//alumni-connect-backend/routes/bookings.js

const express = require("express");
const pool    = require("../db");
const router  = express.Router();

// Helper: find internal profile ID by Clerk ID
async function lookupProfile(clerkUserId) {
  const { rows } = await pool.query(
    `SELECT id FROM profiles WHERE clerk_user_id = $1`,
    [clerkUserId]
  );
  if (!rows.length) throw new Error("Profile not found for Clerk ID: " + clerkUserId);
  return rows[0].id;
}

/**
 * POST /bookings
 *  – charges student’s wallet, credits alumni, creates booking
 */
router.post("/", async (req, res) => {
  const { studentClerkId, alumniClerkId, serviceId } = req.body;
  if (!studentClerkId || !alumniClerkId || !serviceId) {
    return res.status(400).json({ success: false, error: "Missing fields" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1) Lookup internal IDs
    const studentId = await lookupProfile(studentClerkId);
    const alumniId  = await lookupProfile(alumniClerkId);

    // 2) Fetch service rate
    const svcQ = await client.query(
      `SELECT rate FROM services WHERE id = $1`,
      [serviceId]
    );
    if (!svcQ.rows.length) throw new Error("Service not found");
    const rate = parseFloat(svcQ.rows[0].rate);

    // 3) Check student balance
    const balQ = await client.query(
      `SELECT balance FROM profiles WHERE id = $1`,
      [studentId]
    );
    const studentBal = parseFloat(balQ.rows[0].balance);
    if (studentBal < rate) {
      await client.query("ROLLBACK");
      return res.status(400).json({ success: false, error: "Insufficient balance" });
    }

    // 4) Update wallets
    await client.query(
      `UPDATE profiles SET balance = balance - $1 WHERE id = $2`,
      [rate, studentId]
    );
    await client.query(
      `UPDATE profiles SET balance = balance + $1 WHERE id = $2`,
      [rate, alumniId]
    );

    // 5) Insert booking (uses CURRENT_DATE and CURRENT_TIME)
    const bookQ = await client.query(
      `INSERT INTO bookings
         (student_id, alumni_id, service_id, booking_date, booking_time)
       VALUES ($1,$2,$3,CURRENT_DATE,CURRENT_TIME)
       RETURNING id, student_id, alumni_id, service_id, booking_date, booking_time`,
      [studentId, alumniId, serviceId]
    );

    await client.query("COMMIT");
    res.json({ success: true, booking: bookQ.rows[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("POST /bookings error:", err);
    res.status(500).json({ success: false, error: "Database error" });
  } finally {
    client.release();
  }
});

/**
 * GET /bookings/alumni/:alumniClerkId
 *  – list all bookings for this alumni, including service duration
 */
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
        s.duration_months                    AS session_duration_months,
        b.booking_date,
        b.booking_time
      FROM bookings b
      JOIN services s  ON s.id  = b.service_id
      JOIN profiles st ON st.id = b.student_id
      WHERE b.alumni_id = $1
      ORDER BY b.booking_date DESC, b.booking_time DESC
      `,
      [alumniId]
    );
    res.json({ success: true, bookings: rows });
  } catch (err) {
    console.error("GET /bookings/alumni error:", err);
    res.status(500).json({ success: false, error: "Database error" });
  }
});

/**
 * GET /bookings/student/:studentClerkId
 *  – list all bookings for this student, including service duration
 */
router.get("/student/:studentClerkId", async (req, res) => {
  try {
    const studentId = await lookupProfile(req.params.studentClerkId);
    const { rows } = await pool.query(
      `
      SELECT
        b.id                                  AS booking_id,
        pr.first_name || ' ' || pr.last_name  AS provider_name,
        s.title                               AS service_title,
        s.description                         AS service_description,
        s.duration_months                     AS session_duration_months,
        b.booking_date,
        b.booking_time
      FROM bookings b
      JOIN services s  ON s.id         = b.service_id
      JOIN profiles pr ON pr.id        = b.alumni_id
      WHERE b.student_id = $1
      ORDER BY b.booking_date DESC, b.booking_time DESC
      `,
      [studentId]
    );

    // Map to consistent output
    const bookings = rows.map((r) => ({
      booking_id:             r.booking_id,
      provider_name:          r.provider_name,
      service_title:          r.service_title,
      service_description:    r.service_description,
      session_duration_months: r.session_duration_months,
      booking_date:           r.booking_date,
      booking_time:           r.booking_time,
    }));

    res.json({ success: true, bookings });
  } catch (err) {
    console.error("GET /bookings/student error:", err);
    res.status(500).json({ success: false, error: "Database error" });
  }
});

module.exports = router;
