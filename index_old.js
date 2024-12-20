require("dotenv").config();
const https = require('https');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { PythonShell } = require('python-shell');
const path = require('path');
// const fs = require('fs');
// const ejs = require('ejs');
const EventEmitter = require('events');
const {
    s3Uploadv3,
    s3DeleteProject,
    s3UploadImages,
    s3DeleteImages
} = require("./s3service");
const bcrypt = require('bcrypt');
const uuid = require("uuid")
const connectDb = require("./config");

// Provide your SSL certificate and key
const server_options = {
    key: fs.readFileSync('./certificate/privkey.pem'),
    cert: fs.readFileSync('./certificate/cert.pem')
};

const startServer = async () => {
    // Wait till the database is connected
    const { usersModel, projectsModel } = await connectDb();

    const app = express();

    app.use(cors());
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    app.use("/", express.static('public'));

    // Base directory
    // const dir = path.join(__dirname, 'public');
    const localDir = path.join(__dirname, 'local');

    // Make sure tmpImages/ folder exist
    // const tmpImgsDir = path.join(dir, 'tmpImages');
    // if (!fs.existsSync(tmpImgsDir)) {
    //     fs.mkdirSync(tmpImgsDir, { recursive: true });
    // }


    // Request storage
    // const storage = multer.diskStorage({
    //     destination: function (req, file, cb) {
    //         const userDir = path.join(dir, 'tmpImages', req.params.userId, "rgb");
    //         fs.mkdirSync(userDir, { recursive: true });
    //         cb(null, userDir);
    //     },
    //     filename: function (req, file, cb) {
    //         const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    //         cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    //     }
    // });

    const storage = multer.memoryStorage();

    const upload = multer({ storage: storage });

    const users = {};

    // Because runtime restarted, reset all processing projects to idle
    const resetProcessingDB = async () => {
        const filter = { projectStatus: "processing" };
        const update = { projectStatus: "error" };
        await projectsModel.updateMany(filter, update);
    }

    await resetProcessingDB();

    // Update project details in database
    const updateProjectInDB = async (type, userId, projectId, value) => {
        if (!users[userId]) {
            users[userId] = {};
        }

        // If project hasn't been cached, create it
        if (!users[userId][projectId]) {
            users[userId][projectId] = {};
        }

        if (!users[userId][projectId].eventEmitter) {
            users[userId][projectId].eventEmitter = new EventEmitter();
        }

        // Update the progress in the database
        const filter = { projectOwner: userId, projectId };
        let update;
        switch (type) {
            case "status":
                update = { projectStatus: value };
                break;
            case "progress":
                update = { projectProgress: value };
                break;
        }
        const updatedProject = await projectsModel.findOneAndUpdate(filter, update);
        console.log(`Project [${updatedProject.projectName}] ${type} updated to ${value}.`)
        
        users[userId][projectId].eventEmitter.emit(type, { value });
        // Send error to frontend listener
        if (type === "status" && value === "error") {
            users[userId][projectId].eventEmitter.emit("error", { value });
        }
    }

    // Main
    const startReconstruct = async (userId, projectId, config) => {
        const options = {
            mode: 'text',
            pythonOptions: ['-u'],
            args: [userId, projectId]
        };
        if (config) {
            const params = JSON.parse(config);

            for (let key in params) {
                options.args.push(`--${key}`);
                options.args.push(params[key]);
            }
        }
        // console.log("Options", options)

        console.log("Processing in server python script...")
        // Call the python script
        const mainPath = path.join(localDir, 'main.py');
        let pyshell = new PythonShell(mainPath, options);

        //
        let updateQueue = Promise.resolve();

        function queueUpdate(field, userId, projectId, value) {
            updateQueue = updateQueue.then(() => updateProjectInDB(field, userId, projectId, value));
        }

        pyshell.on('message', function (message) {
            console.log(message);
            if (message.includes("main_progress")) {
                const progress = parseInt(message.split(":")[1]);
                queueUpdate("progress", userId, projectId, progress);
            }
        });

        pyshell.on("pythonError", (err) => {
            console.error(err);
            // Reset the project status to idle
            queueUpdate("status", userId, projectId, "error");
            queueUpdate("progress", userId, projectId, 0);
        })

        pyshell.send("start");

        // end the input stream and allow the process to exit
        pyshell.end(async function (err, code, signal) {
            if (err) {
                console.log(err);
                return;
            }

            console.log("Reconstruction process finished.")
            queueUpdate("progress", userId, projectId, 100);
            queueUpdate("status", userId, projectId, "completed");
        });
    }
    //

    const updateProjectImage = async (userId, projectId, project, updateImages) => {

        // Get the existing image names
        const existingImageNames = project.projectImages;

        // Get the new image names
        const updateImageNames = updateImages.map(image => image.originalname);

        // File name string
        const imagesNameToDelete = existingImageNames.filter(name => !updateImageNames.includes(name));

        // File objects
        const imagesToUpload = updateImages.filter(image => !existingImageNames.includes(image.originalname));

        if (imagesNameToDelete.length > 0) {
            await s3DeleteImages(userId, projectId, imagesNameToDelete);
        }

        if (imagesToUpload.length > 0) {
            await s3UploadImages(userId, projectId, imagesToUpload);
        }

        const filter = { projectOwner: userId, projectId };
        const update = { projectImages: updateImageNames };
        const updatedProject = await projectsModel.findOneAndUpdate(filter, update);
    }

    app.post("/projectUpdate", upload.array('images'), async (req, res) => {
        const userId = req.body.userId;
        const projectId = req.body.projectId;
        const action = req.body.action;

        const project = await projectsModel.findOne({ projectOwner: userId, projectId });

        if (!project) {
            res.send({
                status: 400,
                message: "Project not found"
            });
            return;
        }

        switch (action) {
            case "config": {
                const config = req.body.config;
                const parseConfig = JSON.parse(config);
                const filter = { projectOwner: userId, projectId };
                const update = { projectConfig: parseConfig };
                const updatedProject = await projectsModel.findOneAndUpdate(filter, update);
                console.log(`Project [${project.projectName}] config updated successfully.`)
                break;
            }
            case "image": {
                await updateProjectImage(userId, projectId, project, req.files);
                console.log(`Project [${project.projectName}] images updated successfully.`)
                break;
            }
            case "status": {
                const status = req.body.status;
                const filter = { projectOwner: userId, projectId };
                const update = { projectStatus: status };
                const updatedProject = await projectsModel.findOneAndUpdate(filter, update);
                console.log(`Project [${project.projectName}] status updated to ${status}.`)
                break;
            }
            case "restart": {
                const config = project.projectConfig;
                const stringConfig = JSON.stringify(config);

                await updateProjectInDB("status", userId, projectId, "processing");
                await updateProjectInDB("progress", userId, projectId, 0);
                const del_params = { userId, projectId };
                await s3DeleteProject("output", del_params);
                startReconstruct(userId, projectId, stringConfig);
                break;
            }
            case "rename": {
                const projectName = req.body.projectName;
                const filter = { projectOwner: userId, projectId };
                const update = { projectName };
                const updatedProject = await projectsModel.findOneAndUpdate(filter, update);
                console.log(`Project [${project.projectName}] renamed to ${projectName}.`)
                break;
            }
            case "delete": {
                const filter = { projectOwner: userId, projectId };
                const deletedProject = await projectsModel.findOneAndDelete(filter);
                const del_params = { userId, projectId };
                await s3DeleteProject("all", del_params);
                console.log(`Project [${project.projectName}] deleted successfully.`)
                break;
            }
        }

        res.send({
            status: 200,
            message: "Project status updated successfully"
        });
    })

    app.post("/projectConfig", upload.none(), async (req, res) => {
        const userId = req.body.userId;
        const projectId = req.body.projectId;
        const config = req.body.config;

        const project = await projectsModel.findOne({ projectOwner: userId, projectId });

        if (!project) {
            res.send({
                status: 400,
                message: "Project not found"
            });
            return;
        }
        const parseConfig = JSON.parse(config);

        const filter = { projectOwner: userId, projectId };
        const update = { projectConfig: parseConfig };
        const updatedProject = await projectsModel.findOneAndUpdate(filter, update);
        console.log(updatedProject)
        console.log(parseConfig)

        if (project.projectStatus === "config") {
            await updateProjectInDB("status", userId, projectId, "processing");
            await updateProjectInDB("progress", userId, projectId, 0);

            startReconstruct(userId, projectId, config);
        }

        console.log(`Project [${project.projectName}] config updated successfully.`)

        res.send({
            status: 200,
            message: "Project config updated successfully"
        });
    })

    app.post('/projectUpload', upload.array('images'), async (req, res) => {
        const userId = req.body.userId;
        const projectId = req.body.projectId;

        const project = await projectsModel.findOne({ projectOwner: userId, projectId });

        if (!project) {
            res.send({
                status: 400,
                message: "Project not found"
            });
            return;
        }

        await updateProjectImage(userId, projectId, project, req.files);

        if (project.projectStatus === "idle")
            updateProjectInDB("status", userId, projectId, "config");

        console.log(`Project [${project.projectName}] images uploaded successfully.`)

        res.send({
            status: 200,
            message: "File successfully uploaded to S3"
        });
    })

    app.post('/process_image/:userId/:projectId', upload.array('images'), async (req, res) => {

        console.log(`Received request from ip: ${req.ip}`);

        //
        const userId = req.params.userId;
        const projectId = req.params.projectId;

        console.log("User ID: " + userId);
        console.log("Project ID: " + projectId);

        // Start the progress at 0    
        updateProjectInDB("progress", userId, projectId, 0);

        //
        const options = { args: [userId, projectId] };
        if (req.body.parameters) {
            const params = JSON.parse(req.body.parameters);

            for (let key in params) {
                options.args.push(`--${key}`);
                options.args.push(params[key]);
            }
        }
        console.log("Options", options)

        updateProjectInDB("progress", userId, projectId, 10);
        console.log("Uploading files to S3...")
        try {
            await s3Uploadv3(req);
        } catch (err) {
            console.error(err);
            return;
        }
        console.log("File successfully uploaded to S3")
        updateProjectInDB("progress", userId, projectId, 20);

        console.log("Processing in server python script...")
        // Call the python script
        const mainPath = path.join(localDir, 'main.py');
        let pyshell = new PythonShell(mainPath, options);

        pyshell.on('message', function (message) {
            // received a message sent from the Python script (a simple "print" statement)
            console.log(message);
            // Progress range 30-90
            if (message.includes("main_progress")) {
                const progress = parseInt(message.split(":")[1]);
                updateProjectInDB("progress", userId, projectId, progress);
            }
        });

        // end the input stream and allow the process to exit
        pyshell.end(async function (err, code, signal) {
            if (err) {
                throw err;
            }

            console.log("Reconstruction process finished.")
            updateProjectInDB("progress", userId, projectId, 100);
            res.send({
                code: 200
            });
        });
    });

    async function sendProgressUpdates(req, res) {
        const userId = req.params.userId;
        const projectId = req.params.projectId;

        const project = await projectsModel.findOne({ projectOwner: userId, projectId });

        if (project.projectStatus != "processing") {
            res.write('data: CLOSE\n\n');
            res.end();
            return;
        }

        if (!users[userId]) {
            users[userId] = {};
        }

        if (!users[userId][projectId]) {
            users[userId][projectId] = {};
        }

        if (!users[userId][projectId].eventEmitter) {
            users[userId][projectId].eventEmitter = new EventEmitter();
        }

        if (!users[userId][projectId].liveProgress) {
            users[userId][projectId].liveProgress = 0;
        }

        const projectData = users[userId][projectId];
        console.log("Progress update binded received.")
        console.log("From user: " + userId)

        // Initial progress update
        res.write(`data: ${projectData.liveProgress}\n\n`);

        projectData.eventEmitter.on('error', (progress) => {
            res.write('data: CLOSE\n\n');
            res.end();
        })

        // This is just an example. Your actual progress updates would come from somewhere else.
        projectData.eventEmitter.on('progress', (progress) => {
            // Send the progress update to the client
            res.write(`data: ${progress.value}\n\n`);
            projectData.liveProgress = progress.value;

            if (progress.value >= 100) {
                setTimeout(() => {
                    res.write('data: CLOSE\n\n');
                    res.end();
                }, 2000);
            }
        })
    }

    // Live progress updates
    app.get('/process_image/:userId/:projectId', (req, res) => {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();

        // Send an initial message to indicate that the server is ready
        res.write('data: READY\n\n');

        // Send progress updates
        sendProgressUpdates(req, res);
    });

    app.get("/tests3/:userId/:projectId", async (req, res) => {
        try {
            console.log("Testing s3 download...")

            const userId = req.params.userId;
            const projectId = req.params.projectId;

            console.log("User ID: " + userId);
            console.log("Project ID: " + projectId);

            const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
            const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
            const region = process.env.AWS_REGION;
            console.log("Access Key ID: " + accessKeyId);
            console.log("Secret Access Key: " + secretAccessKey);
            console.log("Region: " + region);

            const data = await s3Download(req);
            // res.send(data.Body);
            res.send("Success")
            console.log("Test s3 download success.")
        } catch (err) {
            console.error(err);
        }
    });

    app.get('/', (req, res) => {
        res.json({
            hello: 'hello!'
        });
    })

    app.post('/register', async (req, res) => {
        const userData = {
            username: req.body.username,
            password: req.body.password
        }

        const existingUser = await usersModel.findOne({ username: userData.username });
        if (existingUser) {
            res.send({
                status: 400,
                content: "User already exists"
            })
        } else {
            const saltRounds = 10;
            const hashedPassword = await bcrypt.hash(userData.password, saltRounds);

            userData.password = hashedPassword;

            const userId = userData.userId = uuid.v4();
            const username = userData.username;
            // update authToken
            const authToken = userData.authToken = Math.random().toString(36).substring(7);
            // Expire after 1 month
            const expiryDate = userData.expiryDate = new Date() + 30 * 24 * 60 * 60 * 1000;

            await usersModel.insertMany(userData);

            // Create user in live
            if (!users[userData.userId]) {
                users[userData.userId] = {};
            }

            console.log(`User ${userData.username} registered successfully.`)

            res.send({
                status: 200,
                content: "User registered successfully",
                userId,
                username,
                authToken,
                expiryDate
            })
        }
    })

    app.post('/login', async (req, res) => {
        const data = {
            username: req.body.username,
            password: req.body.password
        }

        const existingUser = await usersModel.findOne({ username: data.username });

        if (existingUser) {
            const match = await bcrypt.compare(data.password, existingUser.password);
            if (match) {
                // update authToken
                const authToken = Math.random().toString(36).substring(7);
                // Expire after 1 month
                const expiryDate = new Date() + 30 * 24 * 60 * 60 * 1000;
                const filter = { username: data.username };
                const update = { authToken, expiryDate };
                const userData = await usersModel.findOneAndUpdate(filter, update);

                // Create user in live
                if (!users[userData.userId]) {
                    users[userData.userId] = {};
                }

                const { userId, username } = userData;

                console.log(`User ${data.username} logged in successfully.`)
                res.send({
                    status: 200,
                    content: "Login successful",
                    userId,
                    username,
                    authToken,
                    expiryDate
                })
            } else {
                res.send({
                    status: 401,
                    content: "Invalid password"
                })
            }
        }
        else {
            res.send({
                status: 404,
                content: "User does not exist"
            })
        }
    })

    app.get('/verify/:username/:authToken', async (req, res) => {
        console.log("Verifying user...")
        // Display req ip
        console.log(`Request from ip: ${req.ip}`);

        const data = {
            username: req.params.username,
            authToken: req.params.authToken
        }

        const existingUser = await usersModel.findOne({ username: data.username, authToken: data.authToken });
        if (existingUser) {
            const { userId, username, authToken, expiryDate } = existingUser;
            // Create user in live
            if (!users[userId]) {
                users[userId] = {};
            }
            res.send({
                status: 200,
                content: "User verified",
                userId,
                username,
                authToken,
                expiryDate
            })
        } else {
            res.send({
                status: 400,
                content: "User not verified"
            })
        }
    })

    app.get('/getProjects/:userId', async (req, res) => {
        const userId = req.params.userId;

        const projects = await projectsModel.find({ projectOwner: userId });
        if (projects) {
            res.send({
                status: 200,
                content: "Projects found",
                projects
            })
        } else {
            res.send({
                status: 400,
                content: "No projects found"
            })
        }
    })

    app.post('/createProject', async (req, res) => {

        // Find the project with the largest projectId
        const lastProject = await projectsModel
            .find({ projectOwner: req.body.projectOwner })
            .sort({ projectId: -1 }).limit(1);
        const maxProjectId = lastProject.length > 0 ? lastProject[0].projectId : 0;

        const data = {
            projectId: maxProjectId + 1,  // Increment the largest projectId
            projectName: req.body.projectName,
            projectStatus: "idle",
            projectProgress: 0,
            projectDate: new Date(),
            projectOwner: req.body.projectOwner
        }

        await projectsModel.insertMany(data);
        console.log(`Project [${data.projectName}] created successfully.`)

        res.send({
            status: 200,
            content: "Project created successfully"
        })
    })

    /*
        /getProjectDetails/:userId/:projectId?detail=###
    */
    app.get("/getProjectDetails/:userId/:projectId", async (req, res) => {
        const userId = req.params.userId;
        const projectId = req.params.projectId;
        const detailName = req.query.detail;

        const project = await projectsModel.findOne({ projectId, projectOwner: userId });

        if (project) {
            let resData = {
                status: 200,
                content: "Project found"
            }
            switch (detailName) {
                case "status":
                    resData.projectStatus = project.projectStatus;
                    break;
                case "progress":
                    resData.progress = project.projectProgress;
                    break;
                case "config":
                    resData.projectConfig = project.projectConfig;
                    break;
                case "full":
                    resData = { ...resData, project };
                    break;
            }
            res.send(resData);
        } else {
            res.send({
                status: 400,
                content: "No status found"
            })
        }
    })

    // function authenticateToken(req, res, next) {
    //     const authHeader = req.headers['authorization'];
    //     const token = authHeader && authHeader.split(' ')[1];

    //     if (token == null) return res.sendStatus(401); // if there isn't any token

    //     // verify a token symmetric
    //     jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, user) => {
    //         if (err) return res.sendStatus(403);
    //         req.user = user;
    //         next();
    //     });
    // }

    app.listen(3000, () => console.log('Server started on port 3000'));
    https.createServer(server_options, app).listen(4000, () => {
        console.log('Https Server started on port 4000');
    });
    // const allowCors = fn => async (req, res) => {
    //     res.setHeader('Access-Control-Allow-Credentials', true)
    //     res.setHeader('Access-Control-Allow-Origin', '*')
    //     // another common pattern
    //     // res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
    //     res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT')
    //     res.setHeader(
    //       'Access-Control-Allow-Headers',
    //       'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    //     )
    //     if (req.method === 'OPTIONS') {
    //       res.status(200).end()
    //       return
    //     }
    //     return await fn(req, res)
    //   }

    //   const handler = (req, res) => {
    //     const d = new Date()
    //     res.end(d.toString())
    //   }

    //   module.exports = allowCors(handler)
}

startServer();