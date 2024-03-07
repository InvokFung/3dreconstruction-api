// require("dotenv").config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { PythonShell } = require('python-shell');
const path = require('path');
const fs = require('fs');
const ejs = require('ejs');
const { s3Uploadv3, s3Download } = require("./s3service");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/", express.static('public'));

// Base directory
const dir = path.join(__dirname, 'public');

// Make sure tmpImages/ folder exist
const tmpImgsDir = path.join(dir, 'tmpImages');
if (!fs.existsSync(tmpImgsDir)) {
    fs.mkdirSync(tmpImgsDir, { recursive: true });
}


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

app.post('/process_image/:userId/:projectId', upload.array('images'), async (req, res) => {

    console.log(`Received request from ip: ${req.ip}`);

    //
    const userId = req.params.userId;
    const projectId = req.params.projectId;

    console.log("User ID: " + userId);
    console.log("Project ID: " + projectId);

    //
    const options = { args: [userId, projectId] };
    if (req.body.parameters) {
        const params = JSON.parse(req.body.parameters);

        for (let key in params) {
            options.args.push(`--${key}`);
            options.args.push(params[key]);
        }
    }
    // console.log("Options", options)

    console.log("Uploading files to S3...")
    try {
        await s3Uploadv3(req);
    } catch (err) {
        console.error(err);
        return;
    }
    console.log("File successfully uploaded to S3")

    console.log("Processing in server python script...")
    // Call the python script
    const mainPath = path.join(dir, 'reconstruction', 'main.py');
    let pyshell = new PythonShell(mainPath, options);

    pyshell.on('message', function (message) {
        // received a message sent from the Python script (a simple "print" statement)
        console.log(message);
    });

    // end the input stream and allow the process to exit
    pyshell.end(async function (err, code, signal) {
        if (err) {
            throw err;
        }

        console.log("Reconstruction process finished.")
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
        res.send(data.Body);
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

app.get('/test3', (req, res) => {
    res.json({
        hello: 'hi5!'
    });
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