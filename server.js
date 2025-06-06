// alumni-connect-backend/server.js
const express = require("express");
const cors    = require("cors");
const http    = require("http");
const { Server } = require("socket.io");
require("dotenv").config();

const profileRoutes   = require("./routes/profiles");
const alumniRoutes    = require("./routes/alumni");
const dashboardRoutes = require("./routes/dashboard"); // ← ensure this is here
const qnaRoutes       = require("./routes/qna");
const messageRoutes   = require("./routes/messages");
const servicesRoutes  = require("./routes/services");
const bookingRoutes   = require("./routes/bookings");
const pool            = require("./db");

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: process.env.FRONTEND_URL },
});

app.use(cors({ origin: process.env.FRONTEND_URL }));
app.use(express.json());

// Mount all REST routes
app.use("/profiles", profileRoutes);
app.use("/alumni", alumniRoutes);
app.use("/dashboard", dashboardRoutes);   // ← student & alumni overview both live here
app.use("/qna", qnaRoutes);
app.use("/messages", messageRoutes);
app.use("/services", servicesRoutes);
app.use("/bookings", bookingRoutes);

// Real-time chat (unchanged)
io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);

  socket.on("join_room", ({ roomId }) => {
    socket.join(roomId);
  });

  socket.on(
    "send_message",
    async ({ roomId, myClerkId, peerClerkId, content }) => {
      try {
        const meQ   = await pool.query(
          "SELECT id FROM profiles WHERE clerk_user_id = $1",
          [myClerkId]
        );
        const peerQ = await pool.query(
          "SELECT id FROM profiles WHERE clerk_user_id = $1",
          [peerClerkId]
        );
        if (!meQ.rows.length || !peerQ.rows.length) return;

        const ins = await pool.query(
          `INSERT INTO messages (sender_id, receiver_id, content)
           VALUES ($1, $2, $3) RETURNING sent_at`,
          [meQ.rows[0].id, peerQ.rows[0].id, content]
        );
        io.to(roomId).emit("receive_message", {
          roomId,
          sender:    myClerkId,
          body:      content,
          timestamp: ins.rows[0].sent_at,
        });
      } catch (err) {
        console.error("send_message error:", err);
      }
    }
  );
});

const port = parseInt(process.env.PORT, 10) || 4000;
server.listen(port, () => {
  console.log(`🚀 Backend at http://localhost:${port}`);
});
