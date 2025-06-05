// alumni-connect-backend/routes/alumni.js
const express = require("express");
const pool = require("../db");
const router = express.Router();

// GET /alumni?search=term
router.get("/", async (req, res) => {
  const { search } = req.query;

  try {
    // We only use $1 for all ILIKE comparisons – so pass [term] once.
    const term = `%${search || ""}%`;
    const { rows } = await pool.query(
      `
      SELECT
        clerk_user_id       AS id,
        first_name          AS "firstName",
        last_name           AS "lastName",
        company,
        industry,
        experience_years    AS "experienceYears",
        college,
        graduation_year     AS "graduationYear",
        profile_image       AS "profileImageUrl"
      FROM profiles
      WHERE role = 'alumni'
        AND is_available = TRUE
        AND (
             first_name ILIKE $1
          OR last_name  ILIKE $1
          OR company    ILIKE $1
          OR college    ILIKE $1
          OR industry   ILIKE $1
        )
      ORDER BY last_name;
      `,
      [term]   // only one parameter here
    );

    res.json({ success: true, alumni: rows });
  } catch (err) {
    console.error("GET /alumni error:", err);
    res.status(500).json({ success: false, error: "Database error" });
  }
});

module.exports = router;
