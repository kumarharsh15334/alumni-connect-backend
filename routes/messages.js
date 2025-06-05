// alumni-connect-backend/routes/messages.js
const express = require("express");
const pool    = require("../db");
const router  = express.Router();

// Lookup a Clerk user ID → internal profile { id, full_name }
async function lookupProfile(clerkUserId) {
  const { rows } = await pool.query(
    `
    SELECT id, first_name || ' ' || last_name AS full_name
      FROM profiles
     WHERE clerk_user_id = $1
    `,
    [clerkUserId]
  );
  if (!rows.length) throw new Error("Profile not found for Clerk ID: " + clerkUserId);
  return { id: rows[0].id, name: rows[0].full_name };
}

// GET /messages/:role/:clerkUserId/threads
router.get("/:role/:clerkUserId/threads", async (req, res) => {
  const { clerkUserId } = req.params;
  try {
    const me = await lookupProfile(clerkUserId);

    //  Find all DISTINCT peers (anyone I’ve ever messaged or received from)
    const { rows: peers } = await pool.query(
      `
      SELECT DISTINCT
        CASE
          WHEN sender_id = $1 THEN receiver_id
          ELSE sender_id
        END AS peer_id
      FROM messages
      WHERE sender_id = $1 OR receiver_id = $1
      `,
      [me.id]
    );

    const threads = await Promise.all(
      peers.map(async ({ peer_id }) => {
        // Fetch the peer’s Clerk ID, name, and image from profiles
        const peerQ = await pool.query(
          `
          SELECT
            clerk_user_id,
            first_name || ' ' || last_name AS full_name,
            profile_image
          FROM profiles
          WHERE id = $1
          `,
          [peer_id]
        );
        const { clerk_user_id, full_name, profile_image } = peerQ.rows[0];

        // Fetch the **last message** in that conversation
        const lastQ = await pool.query(
          `
          SELECT content, sent_at
            FROM messages
           WHERE (sender_id = $1 AND receiver_id = $2)
              OR (sender_id = $2 AND receiver_id = $1)
           ORDER BY sent_at DESC
           LIMIT 1
          `,
          [me.id, peer_id]
        );
        const last = lastQ.rows[0] || {};

        // Count unread messages (peer → me)
        const unreadQ = await pool.query(
          `
          SELECT COUNT(*) AS cnt
            FROM messages
           WHERE sender_id   = $1
             AND receiver_id = $2
             AND is_read     = FALSE
          `,
          [peer_id, me.id]
        );
        const unread = parseInt(unreadQ.rows[0].cnt, 10);

        return {
          threadId: clerk_user_id, // Peer’s Clerk ID
          with: {
            id:              clerk_user_id,
            name:            full_name,
            unread,
            profileImageUrl: profile_image || ""
          },
          lastMessage: last.content || "",
          updatedAt:   last.sent_at || null,
        };
      })
    );

    res.json({ success: true, threads });
  } catch (err) {
    console.error("GET /messages/threads error:", err);
    res.status(500).json({ success: false, error: "Database error" });
  }
});

// GET /messages/:role/:clerkUserId/threads/:peerClerkId
//  Returns full conversation + marks peer→me messages as read
router.get("/:role/:clerkUserId/threads/:peerClerkId", async (req, res) => {
  const { clerkUserId, peerClerkId } = req.params;
  try {
    const me   = await lookupProfile(clerkUserId);
    const peer = await lookupProfile(peerClerkId);

    // Fetch conversation in ascending timestamp order
    const { rows } = await pool.query(
      `
      SELECT
        p.clerk_user_id AS sender,
        content         AS body,
        sent_at         AS timestamp
      FROM messages m
      JOIN profiles p ON p.id = m.sender_id
      WHERE (m.sender_id = $1 AND m.receiver_id = $2)
         OR (m.sender_id = $2 AND m.receiver_id = $1)
      ORDER BY sent_at
      `,
      [me.id, peer.id]
    );

    // Mark all peer→me as read
    await pool.query(
      `
      UPDATE messages
         SET is_read = TRUE
       WHERE sender_id   = $2
         AND receiver_id = $1
         AND is_read     = FALSE
      `,
      [me.id, peer.id]
    );

    res.json({ success: true, messages: rows });
  } catch (err) {
    console.error("GET /messages/thread error:", err);
    res.status(500).json({ success: false, error: "Database error" });
  }
});

// POST /messages/:role/:clerkUserId/threads/:peerClerkId
//  Insert a new message and broadcast via socket.io
router.post("/:role/:clerkUserId/threads/:peerClerkId", async (req, res) => {
  const { clerkUserId, peerClerkId } = req.params;
  const { body } = req.body;
  if (!body) {
    return res.status(400).json({ success: false, error: "Missing body" });
  }
  try {
    const me   = await lookupProfile(clerkUserId);
    const peer = await lookupProfile(peerClerkId);

    const ins = await pool.query(
      `
      INSERT INTO messages (sender_id, receiver_id, content)
      VALUES ($1, $2, $3)
      RETURNING sent_at
      `,
      [me.id, peer.id, body]
    );

    // Emit real-time via Socket.IO (server.js is already wired up)
    req.app.get("io").to(`${[clerkUserId, peerClerkId].sort().join("_")}`)
      .emit("receive_message", {
        roomId:    `${[clerkUserId, peerClerkId].sort().join("_")}`,
        sender:    clerkUserId,
        body,
        timestamp: ins.rows[0].sent_at,
      });

    res.json({
      success: true,
      message: {
        sender:    clerkUserId,
        body,
        timestamp: ins.rows[0].sent_at,
      },
    });
  } catch (err) {
    console.error("POST /messages/thread error:", err);
    res.status(500).json({ success: false, error: "Database error" });
  }
});

module.exports = router;
