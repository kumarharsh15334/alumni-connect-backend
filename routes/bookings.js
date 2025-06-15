//alumni-connect-backend/routes/bookings.js
const express = require("express");
const pool    = require("../db");
const router  = express.Router();

// Helper: find internal profile ID by Clerk user ID
async function lookupProfile(clerkUserId) {
  const { rows } = await pool.query(
    `SELECT id FROM profiles WHERE clerk_user_id = $1`,
    [clerkUserId]
  );
  if (!rows.length) {
    throw new Error("Profile not found for Clerk ID: " + clerkUserId);
  }
  return rows[0].id;
}

/**
 * POST /bookings
 *  – Charge student, credit alumni, create booking with validity_date.
 */
router.post("/", async (req, res) => {
  const { studentClerkId, alumniClerkId, serviceId } = req.body;
  if (!studentClerkId || !alumniClerkId || !serviceId) {
    return res
      .status(400)
      .json({ success: false, error: "Missing studentClerkId, alumniClerkId or serviceId" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1) Lookup internal IDs
    const studentId = await lookupProfile(studentClerkId);
    const alumniId  = await lookupProfile(alumniClerkId);

    // 2) Fetch rate & duration_months
    const svcQ = await client.query(
      `SELECT rate, duration_months FROM services WHERE id = $1`,
      [serviceId]
    );
    if (!svcQ.rows.length) throw new Error("Service not found");
    const { rate } = svcQ.rows[0];

    // 3) Check student balance
    const balQ       = await client.query(`SELECT balance FROM profiles WHERE id = $1`, [studentId]);
    const studentBal = parseFloat(balQ.rows[0].balance);
    if (studentBal < parseFloat(rate)) {
      await client.query("ROLLBACK");
      return res.status(400).json({ success: false, error: "Insufficient balance" });
    }

    // 4) Update wallets
    await client.query(`UPDATE profiles SET balance = balance - $1 WHERE id = $2`, [
      rate,
      studentId,
    ]);
    await client.query(`UPDATE profiles SET balance = balance + $1 WHERE id = $2`, [
      rate,
      alumniId,
    ]);

    // 5) Insert booking and compute validity_date in SQL
    const insQ = await client.query(
      `
      INSERT INTO bookings
        (student_id, alumni_id, service_id, booking_date, booking_time, validity_date)
      SELECT
        $1,       -- student_id
        $2,       -- alumni_id
        $3,       -- service_id
        CURRENT_DATE,
        CURRENT_TIME,
        (CURRENT_DATE + duration_months * INTERVAL '1 month')::date
      FROM services
      WHERE id = $3
      RETURNING
        id                      AS "bookingId",
        student_id              AS "studentId",
        alumni_id               AS "alumniId",
        service_id              AS "serviceId",
        booking_date            AS "bookingDate",
        booking_time            AS "bookingTime",
        validity_date           AS "validityDate"
      `,
      [studentId, alumniId, serviceId]
    );

    await client.query("COMMIT");
    return res.json({ success: true, booking: insQ.rows[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("POST /bookings error:", err);
    return res.status(500).json({ success: false, error: "Database error" });
  } finally {
    client.release();
  }
});

// ────────────────────────────────
// GET ongoing bookings for alumni
// ────────────────────────────────
router.get("/alumni/:alumniClerkId", async (req, res) => {
  try {
    const alumniId = await lookupProfile(req.params.alumniClerkId);
    const { rows } = await pool.query(
      `
      SELECT
        st.clerk_user_id                         AS "studentClerkId",
        st.first_name || ' ' || st.last_name     AS "studentName",
        s.title                                  AS "serviceTitle",
        s.description                            AS "serviceDescription",
        s.duration_months                        AS "sessionDurationMonths",
        b.booking_date                           AS "bookingDate",
        b.booking_time                           AS "bookingTime",
        b.validity_date                          AS "validityDate"
      FROM bookings b
      JOIN services s  ON s.id   = b.service_id
      JOIN profiles st ON st.id  = b.student_id
      WHERE b.alumni_id = $1
        AND b.validity_date >= CURRENT_DATE
      ORDER BY b.booking_date DESC, b.booking_time DESC
      `,
      [alumniId]
    );
    return res.json({ success: true, bookings: rows });
  } catch (err) {
    console.error("GET /bookings/alumni error:", err);
    return res.status(500).json({ success: false, error: "Database error" });
  }
});

// ────────────────────────────────
// GET ongoing bookings for student
// ────────────────────────────────
router.get("/student/:studentClerkId", async (req, res) => {
  try {
    const studentId = await lookupProfile(req.params.studentClerkId);
    const { rows } = await pool.query(
      `
      SELECT
        b.id                                      AS "bookingId",
        pr.first_name || ' ' || pr.last_name      AS "providerName",
        s.title                                   AS "serviceTitle",
        s.description                             AS "serviceDescription",
        s.duration_months                         AS "sessionDurationMonths",
        b.booking_date                            AS "bookingDate",
        b.booking_time                            AS "bookingTime",
        b.validity_date                           AS "validityDate"
      FROM bookings b
      JOIN services s   ON s.id   = b.service_id
      JOIN profiles pr  ON pr.id  = b.alumni_id
      WHERE b.student_id = $1
        AND b.validity_date >= CURRENT_DATE
      ORDER BY b.booking_date DESC, b.booking_time DESC
      `,
      [studentId]
    );
    return res.json({ success: true, bookings: rows });
  } catch (err) {
    console.error("GET /bookings/student error:", err);
    return res.status(500).json({ success: false, error: "Database error" });
  }
});

module.exports = router;
