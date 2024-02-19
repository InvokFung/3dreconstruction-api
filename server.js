const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { PythonShell } = require('python-shell');
const path = require('path');
const fs = require('fs');
const ejs = require('ejs');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/", express.static('public'));

// Base directory
const dir = path.join(__dirname, 'public');

app.get('/', (req, res) => {
    res.json({
        hello: 'hi!'
    });
})

app.get('/test', (req, res) => {
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

app.listen(3000, () => console.log('Server started on port 3000'));