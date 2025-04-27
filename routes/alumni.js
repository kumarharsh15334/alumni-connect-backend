// alumni-connect-backend/routes/alumni.js
const express = require("express");
const pool    = require("../db");
const router  = express.Router();

router.get("/", async (req, res) => {
  const { search } = req.query;
  try {
    const { rows } = await pool.query(
      `
      SELECT
        id,
        first_name       AS "firstName",
        last_name        AS "lastName",
        company,
        industry         AS "position",
        skills           AS "expertise",
        college,
        graduation_year  AS "graduationYear",
        rating,
        profile_image    AS "profileImageUrl",
        hourly_rate      AS "hourlyRate"
      FROM profiles
      WHERE role = 'alumni'
        AND is_available = true
        AND (
          first_name ILIKE '%' || $1 || '%'
          OR last_name  ILIKE '%' || $1 || '%'
          OR company    ILIKE '%' || $1 || '%'
          OR college    ILIKE '%' || $1 || '%'
          OR skills @> ARRAY[$1]
        )
      ORDER BY last_name;
      `,
      [search || ""]
    );
    res.json({ success: true, alumni: rows });
  } catch (err) {
    console.error("GET /alumni error:", err);
    res.status(500).json({ success: false, error: "Database error" });
  }
});

module.exports = router;
