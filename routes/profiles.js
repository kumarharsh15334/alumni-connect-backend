// ---- alumni-connect-backend/routes/profiles.js ----
const express = require("express");
const pool    = require("../db");
const router  = express.Router();

// 1) Search users (students or alumni) by name/company/college
//    GET /profiles/search?q=term
router.get("/search", async (req, res) => {
  const { q } = req.query;
  try {
    const term = `%${q || ""}%`;
    const { rows } = await pool.query(
      `
      SELECT
        clerk_user_id    AS id,
        first_name || ' ' || last_name AS name,
        role,
        profile_image    AS profileImageUrl
      FROM profiles
      WHERE first_name ILIKE $1
         OR last_name  ILIKE $1
         OR company    ILIKE $1
         OR college    ILIKE $1
      ORDER BY name
      LIMIT 20
      `,
      [term]
    );
    res.json({ success: true, results: rows });
  } catch (err) {
    console.error("GET /profiles/search error:", err);
    res.status(500).json({ success: false, error: "Database error" });
  }
});

// 2) Get one profile by clerkUserId
router.get("/:clerkUserId", async (req, res) => {
  const { clerkUserId } = req.params;
  try {
    const { rows } = await pool.query(
      `SELECT * FROM profiles WHERE clerk_user_id = $1`,
      [clerkUserId]
    );
    if (!rows.length) {
      return res.status(404).json({ success: false, error: "Not found" });
    }
    res.json({ success: true, profile: rows[0] });
  } catch (err) {
    console.error("GET /profiles/:id error:", err);
    res.status(500).json({ success: false, error: "Database error" });
  }
});

// 3) Create or update a profile (DROP hourly_rate)
router.post("/", async (req, res) => {
  const {
    clerkUserId,
    firstName,
    lastName,
    role,
    college,
    department,
    semester,
    company,
    industry,
    graduationYear,
    experienceYears,
    // <-- hourlyRate removed here
    skills,
    website,
    linkedinUrl,
    profileImage,
  } = req.body;

  try {
    await pool.query(
      `
      INSERT INTO profiles (
        clerk_user_id,
        first_name,
        last_name,
        role,
        college,
        department,
        semester,
        company,
        industry,
        graduation_year,
        experience_years,
        skills,
        website,
        linkedin_url,
        profile_image
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6, $7, $8, $9,
        $10, $11,
        $12, $13, $14, $15
      )
      ON CONFLICT (clerk_user_id) DO UPDATE SET
        first_name       = EXCLUDED.first_name,
        last_name        = EXCLUDED.last_name,
        role             = EXCLUDED.role,
        college          = EXCLUDED.college,
        department       = EXCLUDED.department,
        semester         = EXCLUDED.semester,
        company          = EXCLUDED.company,
        industry         = EXCLUDED.industry,
        graduation_year  = EXCLUDED.graduation_year,
        experience_years = EXCLUDED.experience_years,
        /* hourly_rate    = EXCLUDED.hourly_rate, */   -- removed
        skills           = EXCLUDED.skills,
        website          = EXCLUDED.website,
        linkedin_url     = EXCLUDED.linkedin_url,
        profile_image    = EXCLUDED.profile_image,
        updated_at       = now()
      `,
      [
        clerkUserId,
        firstName,
        lastName,
        role,
        college,
        department,
        semester,
        company,
        industry,
        graduationYear,
        experienceYears,
        /* hourlyRate, */         // removed from parameters
        skills,
        website,
        linkedinUrl,
        profileImage,
      ]
    );
    res.json({ success: true });
  } catch (err) {
    console.error("POST /profiles error:", err);
    res.status(500).json({ success: false, error: "Database error" });
  }
});

// 4) Toggle availability (no changes needed here)
router.patch("/:clerkUserId/availability", async (req, res) => {
  const { clerkUserId } = req.params;
  const { is_available } = req.body;
  try {
    await pool.query(
      `UPDATE profiles SET is_available = $1 WHERE clerk_user_id = $2`,
      [is_available, clerkUserId]
    );
    res.json({ success: true, is_available });
  } catch (err) {
    console.error("PATCH /profiles/:id/availability error:", err);
    res.status(500).json({ success: false, error: "Database error" });
  }
});

module.exports = router;
