const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const app = express();
const PORT = process.env.PORT || 8080;

function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader?.split(" ")[1]; // Bearer <token>

  if (!token) {
    return res.status(401).send({ error: "Token required." });
  }

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, user) => {
    if (err) {
      return res.status(403).send({ error: "Invalid token." });
    }

    req.user = user;
    next();
  });
}

// Middleware to parse JSON data
app.use(express.json());

// CORS configuration
// app.use(
//   cors({
//     origin: [
//       "https://medical-healthcare-dapp-1030.vercel.app",
//       "http://localhost:3000",
//     ],
//     methods: ["GET", "POST"],
//     credentials: true,
//   })
// );

app.use(cors());

app.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`);
});

// authentication endpoint
app.get("/auth-endpoint", authenticateToken, (request, response) => {
  response.json({
    userType: request.user.userType,
    userData: request.user.userData,
  });
});

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.post("/test", (req, res) => {
  console.log(req.body);
  res.send("Test successful.");
})

app.get("/doctor-info/:doctorAddress", async (req, res) => {
  const { doctorAddress } = req.params;
  console.log("Doctor address:", doctorAddress);
  // Check if the doctorAddress exists in the data
  try {
    // Connect to the database
    await connectDb();
    const db = getDb();

    // Check if user already exists (wallet address and email are unique)
    const doctorExists = await db
      .collection("doctor")
      .findOne({ walletAddress: doctorAddress });

    if (!doctorExists) {
      console.log("Doctor does not exist.");
      return res.status(400).send({ error: "Doctor does not exist." });
    }
    console.log("Doctor exists.");
    res.status(200).json(doctorExists);
  } catch (error) {
    console.error("Error getting doctor info:", error);
    res
      .status(500)
      .send({ error: "An error occured while getting doctor info." });
  }
});

app.post("/register", async (req, res) => {
  let { userType, ...userData } = req.body;
  try {
    // Connect to the database
    await connectDb();
    const db = getDb();

    // Check if user already exists (wallet address and email are unique)
    const userExists = await db.collection(userType).findOne({
      $or: [
        { walletAddress: userData.walletAddress },
        { email: userData.email },
      ],
    });

    if (userExists) {
      console.log("User already exists.");
      return res.status(400).send({ error: "User already exists." });
    }
    // Hash password
    userData.password = await bcrypt.hash(userData.password, 10);

    // Store user data in the database
    const user = await db.collection(userType).insertOne(userData);
    console.log("User data stored successfully.");
    res.status(200).json({ success: "User created successfully." });
  } catch (error) {
    console.error("Error storing user data:", error);
    res
      .status(500)
      .send({ error: "An error occured while trying to create a user." });
  }
});

app.post("/login", async (req, res) => {
  let { userType, email, password } = req.body;
  try {
    // Connect to the database
    await connectDb();
    const db = getDb();

    // Check if user exists
    const user = await db.collection(userType).findOne({ email: email });

    if (!user) {
      console.log("User not found.");
      return res.status(400).send({ error: "User not found." });
    }

    // Check if password is correct
    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      console.log("Incorrect password.");
      return res.status(400).send({ error: "Incorrect password." });
    } else {
      // Generate access token
      const accessToken = jwt.sign(
        { userType: userType, userData: user },
        process.env.ACCESS_TOKEN_SECRET,
        { expiresIn: "15m" }
      );

      // Generate refresh token
      // const refreshToken = jwt.sign(user, process.env.REFRESH_TOKEN_SECRET);

      console.log("User logged in successfully.");
      res.status(200).json({
        success: "User logged in successfully.",
        accessToken: accessToken,
      });
    }
  } catch (error) {
    console.error("Error logging in:", error);
    res.status(500).send({ error: "An error occured while trying to log in." });
  }
});
