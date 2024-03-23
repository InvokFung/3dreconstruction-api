// const { S3 } = require("aws-sdk");
const { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } = require("@aws-sdk/client-s3");
const { Readable } = require('stream');

// exports.s3Uploadv2 = async (req) => {
//     const s3 = new S3({
//         region: process.env.AWS_REGION,
//         accessKeyId: process.env.AWS_ACCESS_KEY_ID,
//         secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
//         // endpoint: process.env.AWS_ENDPOINT
//     });

//     const userId = req.params.userId;
//     const projectId = 1;

//     const params = req.files.map(file => {
//         const userRgbPath = `user-${userId}/${projectId}/rgb/${file.originalname}`;
//         return {
//             Bucket: process.env.AWS_BUCKET_NAME,
//             Key: userRgbPath,
//             Body: file.buffer,
//             // ContentType: file.mimetype,
//             // ACL: "public-read"
//         }
//     })

//     return await Promise.all(params.map(param => s3.upload(param).promise()))
// }

exports.s3Uploadv3 = async (req) => {
    const s3client = new S3Client({
        region: process.env.AWS_REGION,
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    });

    const userId = req.body.userId;
    const projectId = req.body.projectId;

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

exports.s3UploadImages = async (userId, projectId, uploadImages) => {
    const s3client = new S3Client({
        region: process.env.AWS_REGION,
        credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        }
    });

    const params = uploadImages.map(file => {
        const userRgbPath = `user-${userId}/${projectId}/rgb/${file.originalname}`;
        return {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: userRgbPath,
            Body: file.buffer,
        }
    })

    return await Promise.all(params.map(param => s3client.send(new PutObjectCommand(param))))
}

exports.s3DeleteImages = async (userId, projectId, deleteImages) => {
    const s3client = new S3Client({
        region: process.env.AWS_REGION,
        credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        }
    });

    const params = {
        Bucket: process.env.AWS_BUCKET_NAME,
        Delete: {
            Objects: deleteImages.map(fileName => {
                const userRgbPath = `user-${userId}/${projectId}/rgb/${fileName}`;
                return { Key: userRgbPath };
            })
        }
    };

    return await s3client.send(new DeleteObjectsCommand(params));
}

// exports.s3Download = async (req) => {
//     const s3 = new S3();

//     const userId = req.params.userId;
//     const projectId = 1;

//     const userResultPath = `user-${userId}/${projectId}/output/accumulated_numpy.npy`;

//     const params = {
//         Bucket: process.env.AWS_BUCKET_NAME,
//         Key: userResultPath,
//     }

//     return await s3.getObject(params).promise();
// }

exports.s3Downloadv3 = async (req) => {
    const s3client = new S3Client({
        region: process.env.AWS_REGION,
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        // endpoint: process.env.AWS_ENDPOINT
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

// async function deleteObjectsWithPrefixV2(bucket, prefix) {
//     const s3 = new S3();

//     const listedObjects = await s3.listObjectsV2({ Bucket: bucket, Prefix: prefix }).promise();

//     if (!listedObjects.Contents || listedObjects.Contents.length === 0) {
//         console.log("No objects to delete.")
//         return;
//     }

//     const deleteParams = {
//         Bucket: bucket,
//         Delete: { Objects: [] }
//     };

//     listedObjects.Contents.forEach(({ Key }) => {
//         console.log("Deleting", Key)
//         deleteParams.Delete.Objects.push({ Key });
//     });

//     const response = await s3.deleteObjects(deleteParams).promise();
//     console.log(response.Deleted);
//     console.log(response.Errors);

//     if (listedObjects.IsTruncated) await deleteObjectsWithPrefix(bucket, prefix);
//     const listedObjectsAfterDelete = await s3.listObjectsV2({ Bucket: bucket, Prefix: prefix }).promise();
//     console.log("Objects after delete:", listedObjectsAfterDelete.Contents);
//     console.log("Deleted objects successfully.")
// }

async function deleteObjectsWithPrefixV3(bucket, prefix) {
    const s3 = new S3Client({
        region: process.env.AWS_REGION,
        credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        }
    });

    const listedObjects = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix }));

    if (!listedObjects.Contents || listedObjects.Contents.length === 0) {
        console.log("No objects to delete.")
        return;
    }

    const deleteParams = {
        Bucket: bucket,
        Delete: { Objects: [] }
    };

    listedObjects.Contents.forEach(({ Key }) => {
        console.log("Deleting", Key)
        deleteParams.Delete.Objects.push({ Key });
    });

    const response = await s3.send(new DeleteObjectsCommand(deleteParams));

    if (response.Errors) {
        console.log("Failed to delete:", response.Errors);
        return;
    }

    if (listedObjects.IsTruncated) await deleteObjectsWithPrefix(bucket, prefix);

    // const listedObjectsAfterDelete = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix }));
    // console.log("Objects after delete:", listedObjectsAfterDelete.Contents);

    console.log("Deleted objects successfully.")
}

exports.s3DeleteProject = async (action, del_params) => {

    const { userId, projectId } = del_params;

    let prefix;
    switch (action) {
        case "all":
            prefix = `user-${userId}/${projectId}/`;
            break;
        case "output":
            prefix = `user-${userId}/${projectId}/output/`;
            break;
        default:
            return "Invalid action";
    }

    await deleteObjectsWithPrefixV3(process.env.AWS_BUCKET_NAME, prefix);
    // await deleteObjectsWithPrefixV2(process.env.AWS_BUCKET_NAME, prefix);    
}