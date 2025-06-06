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

// ─────────────────────────────────────────────────────────────────────────────
// GET /dashboard/alumni/overview/:clerkUserId
// Returns { totalSessions, totalStudents, totalServices, earnings, unreadMessages }
// ─────────────────────────────────────────────────────────────────────────────
router.get("/alumni/overview/:clerkUserId", async (req, res) => {
  try {
    const { clerkUserId } = req.params;
    const alumniId = await lookupProfile(clerkUserId);

    // totalSessions
    const totalQ = await pool.query(
      `SELECT COUNT(*) AS cnt
         FROM bookings
        WHERE alumni_id = $1`,
      [alumniId]
    );
    const totalSessions = parseInt(totalQ.rows[0].cnt, 10);

    // totalStudents (distinct)
    const studentsQ = await pool.query(
      `SELECT COUNT(DISTINCT student_id) AS cnt
         FROM bookings
        WHERE alumni_id = $1`,
      [alumniId]
    );
    const totalStudents = parseInt(studentsQ.rows[0].cnt, 10);

    // totalServices
    const servicesQ = await pool.query(
      `SELECT COUNT(*) AS cnt
         FROM services
        WHERE alumni_id = $1`,
      [alumniId]
    );
    const totalServices = parseInt(servicesQ.rows[0].cnt, 10);

    // earnings
    const earningsQ = await pool.query(
      `SELECT COALESCE(SUM(s.rate), 0) AS total_earned
         FROM bookings b
         JOIN services s ON s.id = b.service_id
        WHERE b.alumni_id = $1`,
      [alumniId]
    );
    const earnings = parseFloat(earningsQ.rows[0].total_earned) || 0;

    // unreadMessages
    const unreadQ = await pool.query(
      `SELECT COUNT(*) AS cnt
         FROM messages
        WHERE receiver_id = $1
          AND is_read = FALSE`,
      [alumniId]
    );
    const unreadMessages = parseInt(unreadQ.rows[0].cnt, 10);

    res.json({
      success: true,
      stats: {
        totalSessions,
        totalStudents,
        totalServices,
        earnings,
        unreadMessages,
      },
    });
  } catch (err) {
    console.error("GET /dashboard/alumni/overview error:", err);
    res.status(500).json({ success: false, error: "Database error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /dashboard/student/overview/:clerkUserId
// Returns { totalSessions, pastSessions, unreadMessages, questionsAsked, answersReceived }
// ─────────────────────────────────────────────────────────────────────────────
router.get("/student/overview/:clerkUserId", async (req, res) => {
  try {
    const { clerkUserId } = req.params;
    const studentId = await lookupProfile(clerkUserId);

    // totalSessions
    const totalQ = await pool.query(
      `SELECT COUNT(*) AS cnt
         FROM bookings
        WHERE student_id = $1`,
      [studentId]
    );
    const totalSessions = parseInt(totalQ.rows[0].cnt, 10);

    // pastSessions (booking_date < today)
    const pastQ = await pool.query(
      `SELECT COUNT(*) AS cnt
         FROM bookings
        WHERE student_id = $1
          AND booking_date < CURRENT_DATE`,
      [studentId]
    );
    const pastSessions = parseInt(pastQ.rows[0].cnt, 10);

    // unreadMessages
    const unreadQ = await pool.query(
      `SELECT COUNT(*) AS cnt
         FROM messages
        WHERE receiver_id = $1
          AND is_read = FALSE`,
      [studentId]
    );
    const unreadMessages = parseInt(unreadQ.rows[0].cnt, 10);

    // questionsAsked
    const askedQ = await pool.query(
      `SELECT COUNT(*) AS cnt
         FROM questions
        WHERE asked_by = $1`,
      [studentId]
    );
    const questionsAsked = parseInt(askedQ.rows[0].cnt, 10);

    // answersReceived
    const answersQ = await pool.query(
      `SELECT COUNT(*) AS cnt
         FROM answers a
         JOIN questions q ON q.id = a.question_id
        WHERE q.asked_by = $1`,
      [studentId]
    );
    const answersReceived = parseInt(answersQ.rows[0].cnt, 10);

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
