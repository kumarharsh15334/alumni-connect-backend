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

// GET /dashboard/alumni/overview/:clerkUserId
// Returns totalSessions, totalStudents, totalServices, earnings, unreadMessages
router.get("/alumni/overview/:clerkUserId", async (req, res) => {
  try {
    const { clerkUserId } = req.params;
    // 1. Find internal alumni ID
    const alumniId = await lookupProfile(clerkUserId);

    // 2. totalSessions: count all bookings where alumni_id = alumniId
    const totalQ = await pool.query(
      `SELECT COUNT(*) AS cnt
         FROM bookings
        WHERE alumni_id = $1`,
      [alumniId]
    );
    const totalSessions = parseInt(totalQ.rows[0].cnt, 10);

    // 3. totalStudents: distinct count of student_id for this alumni
    const studentsQ = await pool.query(
      `SELECT COUNT(DISTINCT student_id) AS cnt
         FROM bookings
        WHERE alumni_id = $1`,
      [alumniId]
    );
    const totalStudents = parseInt(studentsQ.rows[0].cnt, 10);

    // 4. totalServices: count of services offered by this alumni
    const servicesQ = await pool.query(
      `SELECT COUNT(*) AS cnt
         FROM services
        WHERE alumni_id = $1`,
      [alumniId]
    );
    const totalServices = parseInt(servicesQ.rows[0].cnt, 10);

    // 5. earnings: sum(rate) for all sessions this alumni has had
    const earningsQ = await pool.query(
      `
      SELECT COALESCE(SUM(s.rate), 0) AS total_earned
        FROM bookings b
        JOIN services s ON s.id = b.service_id
       WHERE b.alumni_id = $1
      `,
      [alumniId]
    );
    const earnings = parseFloat(earningsQ.rows[0].total_earned) || 0;

    // 6. unreadMessages: count messages where receiver_id = alumniId AND is_read = FALSE
    const unreadQ = await pool.query(
      `
      SELECT COUNT(*) AS cnt
        FROM messages
       WHERE receiver_id = $1
         AND is_read = FALSE
      `,
      [alumniId]
    );
    const unreadMessages = parseInt(unreadQ.rows[0].cnt, 10);

    // Respond with all five stats
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

module.exports = router;
