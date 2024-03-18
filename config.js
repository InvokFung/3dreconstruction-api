const mongoose = require("mongoose")

const connectDb = async () => {
    try {
        await mongoose.connect("mongodb+srv://admin:a12345@fypreconstruction.qilrj8x.mongodb.net/reconstruction")
        console.log("=====================================")
        console.log("Successfully connected to MongoDB.")
        console.log("=====================================")

        const userSchema = new mongoose.Schema({
            username: {
                type: String,
                required: true
            },
            password: {
                type: String,
                required: true
            },
            authToken: {
                type: String,
                required: true
            },
            expiryDate: {
                type: Date,
                required: true
            }
        })

        const usersModel = mongoose.model("users", userSchema)

        const projectSchema = new mongoose.Schema({
            projectId: {
                type: Number,
                required: true
            },
            projectName: {
                type: String,
                required: true
            },            
            // projectLocation: {
            //     type: String,
            //     required: true
            // },
            projectStatus: {
                type: String,
                required: true
            },
            projectDate: {
                type: Date,
                required: true
            },
            projectOwner: {
                type: String,
                required: true
            }
        })

        const projectsModel = mongoose.model("projects", projectSchema)

        return { usersModel, projectsModel }
    } catch (err) {
        throw "Database connection failed: " + err
    }
}

module.exports = connectDb