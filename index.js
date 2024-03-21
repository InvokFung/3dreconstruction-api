require("dotenv").config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { PythonShell } = require('python-shell');
const path = require('path');
// const fs = require('fs');
// const ejs = require('ejs');
const EventEmitter = require('events');
const { s3Uploadv3, s3Download } = require("./s3service");
const bcrypt = require('bcrypt');
const uuid = require("uuid")
const connectDb = require("./config");

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

    const updateProgress = (userId, projectId, progress) => {
        users[userId][projectId].liveProgress = progress;
        // Update the progress in the database
        const filter = { projectOwner: userId, projectId };
        const update = { projectProgress: progress };
        projectsModel.findOneAndUpdate(filter, update);

        users[userId][projectId].eventEmitter.emit('progress', { value: progress });
    }

    app.post('/process_image/:userId/:projectId', upload.array('images'), async (req, res) => {

        console.log(`Received request from ip: ${req.ip}`);

        //
        const userId = req.params.userId;
        const projectId = req.params.projectId;

        console.log("User ID: " + userId);
        console.log("Project ID: " + projectId);

        // Start the progress at 0    
        updateProgress(userId, projectId, 0);

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

        updateProgress(userId, projectId, 10);
        console.log("Uploading files to S3...")
        try {
            await s3Uploadv3(req);
        } catch (err) {
            console.error(err);
            return;
        }
        console.log("File successfully uploaded to S3")
        updateProgress(userId, projectId, 20);

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
                updateProgress(userId, projectId, progress);
            }
        });

        // end the input stream and allow the process to exit
        pyshell.end(async function (err, code, signal) {
            if (err) {
                throw err;
            }

            console.log("Reconstruction process finished.")
            updateProgress(userId, projectId, 100);
            res.send({
                code: 200
            });
            // console.log("Server accessing result...")
            // try {
            //     const npyBody = (await s3Download(req)).Body;
            //     // Set response headers
            //     res.setHeader('Content-Type', 'application/octet-stream');
            //     res.setHeader('Content-Disposition', 'attachment; filename="accumulated_numpy.npy"');
            //     // Send the file data as a binary stream
            //     res.send(npyBody);
            //     console.log("Result sent to client.")
            // } catch (err) {
            //     console.error(err);
            // }
        });
    });

    function sendProgressUpdates(req, res) {
        const userId = req.params.userId;
        const projectId = req.params.projectId;

        users[userId] = {};
        users[userId][projectId] = {
            eventEmitter: new EventEmitter(),
            liveProgress: 0
        };

        const projectData = users[userId][projectId];
        console.log("Progress update binded received.")
        console.log("From user: " + userId)

        // This is just an example. Your actual progress updates would come from somewhere else.
        projectData.eventEmitter.on('progress', (progress) => {
            // Send the progress update to the client
            res.write(`data: ${progress.value}\n\n`);

            if (progress.value >= 100) {
                res.write('data: CLOSE\n\n');
                res.end();
            }
        })
    }

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
            hello: 'hi3!'
        });
    })

    app.get('/test', (req, res) => {
        res.json({
            hello: 'hi4!'
        });
    })

    app.post('/register', async (req, res) => {
        const data = {
            username: req.body.username,
            password: req.body.password
        }

        const existingUser = await usersModel.findOne({ username: data.username });
        if (existingUser) {
            res.send({
                status: 400,
                content: "User already exists"
            })
        } else {
            const saltRounds = 10;
            const hashedPassword = await bcrypt.hash(data.password, saltRounds);

            data.password = hashedPassword;

            const userId = data.userId = uuid.v4();
            const username = data.username;
            // update authToken
            const authToken = data.authToken = Math.random().toString(36).substring(7);
            // Expire after 1 month
            const expiryDate = data.expiryDate = new Date() + 30 * 24 * 60 * 60 * 1000;

            await usersModel.insertMany(data);
            console.log(`User ${data.username} registered successfully.`)

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
        const data = {
            username: req.params.username,
            authToken: req.params.authToken
        }

        const existingUser = await usersModel.findOne({ username: data.username, authToken: data.authToken });
        if (existingUser) {
            const { userId, username, authToken, expiryDate } = existingUser;
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
            const resData = {
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