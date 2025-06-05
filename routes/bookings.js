// alumni-connect-backend/routes/bookings.js
const express = require("express");
const pool    = require("../db");
const router  = express.Router();

// Helper: map Clerk ID → internal profile ID
async function lookupProfile(clerkUserId) {
  const { rows } = await pool.query(
    `SELECT id FROM profiles WHERE clerk_user_id = $1`,
    [clerkUserId]
  );
  if (!rows.length) throw new Error("Profile not found for Clerk ID: " + clerkUserId);
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

// GET /bookings/alumni/:alumniClerkId — all sessions ON this alumni
router.get("/alumni/:alumniClerkId", async (req, res) => {
  try {
    const alumniId = await lookupProfile(req.params.alumniClerkId);

    const { rows } = await pool.query(
      `
      SELECT
        st.clerk_user_id                     AS studentClerkId,
        st.first_name || ' ' || st.last_name AS student_name,
        s.title                              AS service_title,
        s.description                        AS service_description,
        b.booking_date,
        b.booking_time
      FROM bookings b
      JOIN services s  ON s.id  = b.service_id
      JOIN profiles st ON st.id = b.student_id
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

// GET /bookings/student/:studentClerkId — all sessions that this student booked
router.get("/student/:studentClerkId", async (req, res) => {
  try {
    const studentId = await lookupProfile(req.params.studentClerkId);

    const { rows } = await pool.query(
      `
      SELECT
        b.id                                  AS booking_id,      -- return the UUID here
        pr.first_name || ' ' || pr.last_name  AS provider_name,
        s.title                               AS service_title,
        s.description                         AS service_description,
        b.booking_date,
        b.booking_time
      FROM bookings b
      JOIN services s  ON s.id         = b.service_id
      JOIN profiles pr ON pr.id        = b.alumni_id
      WHERE b.student_id = $1
      ORDER BY b.booking_date, b.booking_time
      `,
      [studentId]
    );

    // Now each row has a `booking_id` field, which is guaranteed to be unique.
    res.json({
      success: true,
      bookings: rows.map((r) => ({
        id:                r.booking_id,
        provider_name:     r.provider_name,
        service_title:     r.service_title,
        service_description: r.service_description,
        booking_date:      r.booking_date,
        booking_time:      r.booking_time,
      })),
    });
  } catch (err) {
    console.error("GET /bookings/student error:", err);
    res.status(500).json({ success: false, error: "Database error" });
  }
});

module.exports = router;
