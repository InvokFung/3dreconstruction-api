const { S3, Endpoint } = require("aws-sdk");
const { S3Client, PutObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
const { Readable } = require('stream');

exports.s3Uploadv2 = async (req) => {
    const s3 = new S3({
        region: process.env.AWS_REGION,
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        endpoint: process.env.AWS_ENDPOINT
    });

    const userId = req.params.userId;
    // const projectId = req.body.projectId;
    const projectId = 1;
    // console.log(req.files)

    const params = req.files.map(file => {
        const userRgbPath = `user-${userId}/${projectId}/rgb/${file.originalname}`;
        return {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: userRgbPath,
            Body: file.buffer,
            // ContentType: file.mimetype,
            // ACL: "public-read"
        }
    })

    return await Promise.all(params.map(param => s3.upload(param).promise()))
}

exports.s3Uploadv3 = async (req) => {
    const s3client = new S3Client({
        region: process.env.AWS_REGION,
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,        
    });

    const userId = req.params.userId;
    const projectId = 1;

    const params = req.files.map(file => {
        const userRgbPath = `user-${userId}/${projectId}/rgb/${file.originalname}`;
        return {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: userRgbPath,
            Body: file.buffer,
        }
    })

    return await Promise.all(params.map(param => s3client.send(new PutObjectCommand(param))))
}

exports.s3Download = async (req) => {
    const s3 = new S3({
        region: process.env.AWS_REGION,
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        endpoint: process.env.AWS_ENDPOINT
    });

    const userId = req.params.userId;
    const projectId = 1;

    const userResultPath = `user-${userId}/${projectId}/output/accumulated_numpy.npy`;

    const params = {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: userResultPath,
    }
    return await s3.getObject(params).promise();
}

exports.s3Downloadv3 = async (req) => {
    const s3client = new S3Client({
        region: process.env.AWS_REGION,
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        endpoint: process.env.AWS_ENDPOINT
    });
    
    const userId = req.params.userId;
    const projectId = 1;

    const userResultPath = `user-${userId}/${projectId}/output/accumulated_numpy.npy`;

    const params = {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: userResultPath,
    }
    const data = await s3client.send(new GetObjectCommand(params));
    const body = await new Promise((resolve, reject) => {
        const chunks = [];
        const stream = new Readable().wrap(data.Body);
        stream.on('data', chunk => chunks.push(chunk));
        stream.on('error', reject);
        stream.on('end', () => resolve(Buffer.concat(chunks)));
    });
    return body;
}