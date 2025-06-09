// alumni-connect-backend/routes/messages.js
const express = require("express");
const pool = require("../db");
const router = express.Router();

/** lookup internal profile ID by Clerk user ID */
async function lookupProfile(clerkUserId) {
  const { rows } = await pool.query(
    `SELECT id FROM profiles WHERE clerk_user_id = $1`,
    [clerkUserId]
  );
  if (!rows.length) throw new Error("Profile not found for Clerk ID " + clerkUserId);
  return rows[0].id;
}

/**
 * GET /messages/:role/:clerkUserId/threads
 *  – for alumni: returns threads with `priority: true` for students who've booked
 */
router.get("/:role/:clerkUserId/threads", async (req, res) => {
  const { role, clerkUserId } = req.params;
  try {
    const meId = await lookupProfile(clerkUserId);

    // 1) everyone I've ever messaged or received from
    const { rows: msgPeers } = await pool.query(
      `SELECT DISTINCT
         CASE WHEN sender_id = $1 THEN receiver_id ELSE sender_id END AS peer_id
       FROM messages
       WHERE sender_id = $1 OR receiver_id = $1`,
      [meId]
    );
    const msgPeerIds = msgPeers.map(r => r.peer_id);

    // 2) if alumni, students who've booked with me
    let bookingPeerIds = [];
    if (role === "alumni") {
      const { rows: bookRows } = await pool.query(
        `SELECT DISTINCT student_id AS peer_id
           FROM bookings
          WHERE alumni_id = $1`,
        [meId]
      );
      bookingPeerIds = bookRows.map(r => r.peer_id);
    }

    // 3) unify
    const allPeerIds = Array.from(new Set([...msgPeerIds, ...bookingPeerIds]));

    // 4) build each thread
    const threads = await Promise.all(
      allPeerIds.map(async peerId => {
        // fetch basic info
        const prof = await pool.query(
          `SELECT clerk_user_id, first_name || ' ' || last_name AS full_name, profile_image
             FROM profiles
            WHERE id = $1`,
          [peerId]
        );
        const { clerk_user_id, full_name, profile_image } = prof.rows[0];

        // last message
        const lastQ = await pool.query(
          `SELECT content, sent_at
             FROM messages
            WHERE (sender_id=$1 AND receiver_id=$2)
               OR (sender_id=$2 AND receiver_id=$1)
            ORDER BY sent_at DESC
            LIMIT 1`,
          [meId, peerId]
        );
        const last = lastQ.rows[0] || { content: "", sent_at: null };

        // unread count
        const unreadQ = await pool.query(
          `SELECT COUNT(*) AS cnt
             FROM messages
            WHERE sender_id = $1
              AND receiver_id = $2
              AND is_read = FALSE`,
          [peerId, meId]
        );
        const unread = parseInt(unreadQ.rows[0].cnt, 10);

        return {
          threadId: clerk_user_id,
          with: {
            id: clerk_user_id,
            name: full_name,
            unread,
            profileImageUrl: profile_image || "",
          },
          lastMessage: last.content,
          updatedAt: last.sent_at,
          priority: bookingPeerIds.includes(peerId),
        };
      })
    );

    res.json({ success: true, threads });
  } catch (err) {
    console.error("GET /messages/threads error:", err);
    res.status(500).json({ success: false, error: "Database error" });
  }
});

/** GET full conversation + mark as read */
router.get("/:role/:clerkUserId/threads/:peerClerkId", async (req, res) => {
  const { clerkUserId, peerClerkId } = req.params;
  try {
    const me   = await lookupProfile(clerkUserId);
    const peer = await lookupProfile(peerClerkId);

    const convoQ = await pool.query(
      `SELECT p.clerk_user_id AS sender, content AS body, sent_at AS timestamp
         FROM messages m
         JOIN profiles p ON p.id = m.sender_id
        WHERE (sender_id=$1 AND receiver_id=$2)
           OR (sender_id=$2 AND receiver_id=$1)
        ORDER BY sent_at`,
      [me, peer]
    );

    // mark peer→me read
    await pool.query(
      `UPDATE messages
          SET is_read = TRUE
        WHERE sender_id = $2
          AND receiver_id = $1
          AND is_read = FALSE`,
      [me, peer]
    );

    res.json({ success: true, messages: convoQ.rows });
  } catch (err) {
    console.error("GET /messages/thread error:", err);
    res.status(500).json({ success: false, error: "Database error" });
  }
});

/** POST send + broadcast */
router.post("/:role/:clerkUserId/threads/:peerClerkId", async (req, res) => {
  const { clerkUserId, peerClerkId } = req.params;
  const { body } = req.body;
  if (!body) return res.status(400).json({ success: false, error: "Missing body" });

  try {
    const me   = await lookupProfile(clerkUserId);
    const peer = await lookupProfile(peerClerkId);

    const ins = await pool.query(
      `INSERT INTO messages (sender_id, receiver_id, content)
       VALUES ($1,$2,$3)
       RETURNING sent_at`,
      [me, peer, body]
    );

    // broadcast over socket.io
    req.app.get("io")
      .to([clerkUserId, peerClerkId].sort().join("_"))
      .emit("receive_message", {
        roomId:    [clerkUserId, peerClerkId].sort().join("_"),
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
