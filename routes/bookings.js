// alumni-connect-backend/routes/bookings.js
const express = require("express");
const pool    = require("../db");
const router  = express.Router();

async function lookupProfile(clerkUserId) {
  const { rows } = await pool.query(
    `SELECT id FROM profiles WHERE clerk_user_id = $1`,
    [clerkUserId]
  );
  if (!rows.length) throw new Error("Profile not found");
  return rows[0].id;
}

// POST /bookings — create a booking
router.post("/", async (req, res) => {
  const {
    studentClerkId,
    alumniClerkId,
    serviceId,
    bookingDate,
    bookingTime,
  } = req.body;
  if (
    !studentClerkId ||
    !alumniClerkId ||
    !serviceId ||
    !bookingDate ||
    !bookingTime
  ) {
    return res.status(400).json({ success: false, error: "Missing fields" });
  }
  try {
    const studentId = await lookupProfile(studentClerkId);
    const alumniId  = await lookupProfile(alumniClerkId);

    const { rows } = await pool.query(
      `INSERT INTO bookings
         (student_id, alumni_id, service_id, booking_date, booking_time)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING *`,
      [studentId, alumniId, serviceId, bookingDate, bookingTime]
    );
    res.json({ success: true, booking: rows[0] });
  } catch (err) {
    console.error("POST /bookings error:", err);
    res.status(500).json({ success: false, error: "Database error" });
  }
});

// GET /bookings/student/:studentClerkId — sessions that **this student** booked
router.get("/student/:studentClerkId", async (req, res) => {
  try {
    const studentId = await lookupProfile(req.params.studentClerkId);

    const { rows } = await pool.query(
      `
      SELECT
        b.id,
        s.title       AS service_title,
        s.description AS service_description,
        b.booking_date,
        b.booking_time,
        -- pull the ALUMNI’s name here
        p.first_name || ' ' || p.last_name AS provider_name
      FROM bookings b
      JOIN services s  ON s.id = b.service_id
      JOIN profiles p  ON p.id = b.alumni_id
      WHERE b.student_id = $1
      ORDER BY b.booking_date, b.booking_time
      `,
      [studentId]
    );

    res.json({ success: true, bookings: rows });
  } catch (err) {
    console.error("GET /bookings/student error:", err);
    res.status(500).json({ success: false, error: "Database error" });
  }
});

// GET /bookings/alumni/:alumniClerkId — sessions **on this alumni**
router.get("/alumni/:alumniClerkId", async (req, res) => {
  try {
    const alumniId = await lookupProfile(req.params.alumniClerkId);

    const { rows } = await pool.query(
      `
      SELECT
        b.id,
        s.title       AS service_title,
        s.description AS service_description,
        b.booking_date,
        b.booking_time,
        -- pull the STUDENT’s name here
        st.first_name || ' ' || st.last_name AS student_name
      FROM bookings b
      JOIN services s   ON s.id = b.service_id
      JOIN profiles st  ON st.id = b.student_id
      WHERE b.alumni_id = $1
      ORDER BY b.booking_date, b.booking_time
      `,
      [alumniId]
    );

    res.json({ success: true, bookings: rows });
  } catch (err) {
    console.error("GET /bookings/alumni error:", err);
    res.status(500).json({ success: false, error: "Database error" });
  }
});

module.exports = router;
