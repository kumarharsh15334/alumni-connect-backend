// alumni-connect-backend/server.js
const express = require("express");
const cors    = require("cors");
require("dotenv").config();

const profileRoutes = require("./routes/profiles");
const alumniRoutes  = require("./routes/alumni");
const qnaRoutes     = require("./routes/qna");

const app = express();

// Allow your React frontend to talk to this API
app.use(cors({ origin: process.env.FRONTEND_URL }));
app.use(express.json());

// Mount all routers
app.use("/profiles", profileRoutes);
app.use("/alumni",   alumniRoutes);
app.use("/qna",      qnaRoutes);

const port = parseInt(process.env.PORT, 10) || 4000;
app.listen(port, () => {
  console.log(`🚀 Backend listening on http://localhost:${port}`);
});
