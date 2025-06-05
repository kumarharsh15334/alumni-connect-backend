// alumni-connect-backend/routes/dashboard.js
const express = require("express");
const pool    = require("../db");
const router  = express.Router();

// Helper: lookup a Clerk User ID → internal profile ID
async function lookupProfile(clerkUserId) {
  const { rows } = await pool.query(
    `SELECT id
       FROM profiles
      WHERE clerk_user_id = $1`,
    [clerkUserId]
  );
  if (!rows.length) throw new Error("Profile not found for Clerk ID: " + clerkUserId);
  return rows[0].id;
}

// … (keep the existing alumni/overview handler above) …

// ─────────────────────────────────────────────────────────────────────────────
// UPDATED: GET /dashboard/student/overview/:clerkUserId
// Returns totalSessions, pastSessions, unreadMessages, questionsAsked, answersReceived
// ─────────────────────────────────────────────────────────────────────────────
router.get("/student/overview/:clerkUserId", async (req, res) => {
  try {
    const { clerkUserId } = req.params;
    // 1. Find internal student ID
    const studentId = await lookupProfile(clerkUserId);

    // 2. totalSessions: total bookings where student_id = studentId
    const totalQ = await pool.query(
      `SELECT COUNT(*) AS cnt
         FROM bookings
        WHERE student_id = $1`,
      [studentId]
    );
    const totalSessions = parseInt(totalQ.rows[0].cnt, 10);

    // 3. pastSessions: bookings where booking_date < today
    const pastQ = await pool.query(
      `SELECT COUNT(*) AS cnt
         FROM bookings
        WHERE student_id = $1
          AND booking_date < CURRENT_DATE`,
      [studentId]
    );
    const pastSessions = parseInt(pastQ.rows[0].cnt, 10);

    // 4. unreadMessages: messages where receiver_id = studentId AND is_read = FALSE
    const unreadQ = await pool.query(
      `SELECT COUNT(*) AS cnt
         FROM messages
        WHERE receiver_id = $1
          AND is_read = FALSE`,
      [studentId]
    );
    const unreadMessages = parseInt(unreadQ.rows[0].cnt, 10);

    // 5. questionsAsked: count of questions where asked_by = studentId
    const askedQ = await pool.query(
      `SELECT COUNT(*) AS cnt
         FROM questions
        WHERE asked_by = $1`,
      [studentId]
    );
    const questionsAsked = parseInt(askedQ.rows[0].cnt, 10);

    // 6. answersReceived: answers to any question asked by this student
    const answersQ = await pool.query(
      `SELECT COUNT(*) AS cnt
         FROM answers a
         JOIN questions q ON q.id = a.question_id
        WHERE q.asked_by = $1`,
      [studentId]
    );
    const answersReceived = parseInt(answersQ.rows[0].cnt, 10);

    // Respond with the five stats (upcomingSessions removed)
    res.json({
      success: true,
      stats: {
        totalSessions,
        pastSessions,
        unreadMessages,
        questionsAsked,
        answersReceived,
      },
    });
  } catch (err) {
    console.error("GET /dashboard/student/overview error:", err);
    res.status(500).json({ success: false, error: "Database error" });
  }
});

module.exports = router;
