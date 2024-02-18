const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { PythonShell } = require('python-shell');
const path = require('path');
const fs = require('fs');
const serverless = require('serverless-http');

const app = express();

app.use(cors());

app.use(express.static(path.join(__dirname, 'src')));
app.use('/tmpImages', express.static(path.join(__dirname, 'tmpImages')));

const router = express.Router();

// Make sure tmpImages/ folder exist
const dir = path.join(__dirname, 'tmpImages');
if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
}

// Request storage
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const dir = path.join(__dirname, 'tmpImages', req.params.userId, "rgb");
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

const resultCheck = "Result path: ";

router.post('/process_image/:userId', upload.array('images'), (req, res) => {

    let outputImagePath = "";

    console.log(`Received request from ip: ${req.ip}`);

    //
    const userId = req.params.userId;

    console.log("User ID: " + userId);

    //
    const options = { args: [userId] };
    if (req.body.parameters) {
        const params = JSON.parse(req.body.parameters);

        for (let key in params) {
            options.args.push(`--${key}`);
            options.args.push(params[key]);
        }
    }
    // console.log("Options", options)

    let doCleanup = async () => {
        return new Promise((resolve, reject) => {
            let userIdPath = path.join(__dirname, 'tmpImages', userId);

            fs.rm(userIdPath, { recursive: true }, (err) => {
                if (err) {
                    console.error(err);
                    reject(err);
                }
                resolve();
            });
        })
    }

    let pyshell = new PythonShell('reconstruction/main.py', options);

    pyshell.on('message', function (message) {
        // received a message sent from the Python script (a simple "print" statement)
        console.log(message);
        if (message.includes(resultCheck))
            outputImagePath = message.split(resultCheck)[1];
    });

    // end the input stream and allow the process to exit
    pyshell.end(async function (err, code, signal) {
        if (err) {
            await doCleanup();
            throw err;
        }

        let ext = path.extname(outputImagePath);
        let contentType;

        switch (ext) {
            case '.png':
                contentType = 'image/png';
                break;
            default:
                contentType = 'application/octet-stream';
        }

        // Read the output image file and send it as a response
        fs.readFile(outputImagePath, async (err, data) => {
            if (err) {
                await doCleanup();
                throw err;
            }
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(data);

            await doCleanup();
        });
    });
});

router.get('/', (req, res) => {
    res.json({
        hello: 'hi!'
    });
})

router.get('/test', (req, res) => {
    res.json({
        hello: 'hi2!'
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

// app.listen(3000, () => console.log('Server started on port 3000'));
app.use('/.netlify/functions/server', router);  // path must route to lambda

module.exports = app;
module.exports.handler = serverless(app);