// alumni-connect-backend/routes/profiles.js

const express = require("express");
const pool    = require("../db");
const router  = express.Router();

/**
 * Helper: lookup internal profile ID by Clerk user ID
 */
async function lookupProfileId(clerkUserId) {
  const { rows } = await pool.query(
    `SELECT id FROM profiles WHERE clerk_user_id = $1`,
    [clerkUserId]
  );
  if (!rows.length) {
    const err = new Error("Profile not found for Clerk ID: " + clerkUserId);
    err.status = 404;
    throw err;
  }
  return rows[0].id;
}

/**
 * 1) Search users (students or alumni) by name/company/college
 *    GET /profiles/search?q=term
 */
router.get("/search", async (req, res) => {
  const { q } = req.query;
  const term = `%${q || ""}%`;
  try {
    const { rows } = await pool.query(
      `
      SELECT
        clerk_user_id    AS id,
        first_name || ' ' || last_name AS name,
        role,
        profile_image    AS "profileImageUrl"
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

/**
 * 2) Get one profile by Clerk User ID
 *    GET /profiles/:clerkUserId
 */
router.get("/:clerkUserId", async (req, res) => {
  try {
    const { clerkUserId } = req.params;
    const { rows } = await pool.query(
      `SELECT * FROM profiles WHERE clerk_user_id = $1`,
      [clerkUserId]
    );
    if (!rows.length) {
      return res.status(404).json({ success: false, error: "Not found" });
    }
    res.json({ success: true, profile: rows[0] });
  } catch (err) {
    console.error("GET /profiles/:clerkUserId error:", err);
    res.status(err.status || 500).json({ success: false, error: err.message || "Database error" });
  }
});

/**
 * 3) Create or update a profile
 *    POST /profiles
 */
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
    skills,
    website,
    linkedinUrl,
    profileImage,
    dark_mode,
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
        profile_image,
        dark_mode
      ) VALUES (
        $1,$2,$3,$4,
        $5,$6,$7,$8,$9,
        $10,$11,$12,$13,$14,$15,$16
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
        skills           = EXCLUDED.skills,
        website          = EXCLUDED.website,
        linkedin_url     = EXCLUDED.linkedin_url,
        profile_image    = EXCLUDED.profile_image,
        dark_mode        = EXCLUDED.dark_mode,
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
        skills,
        website,
        linkedinUrl,
        profileImage,
        Boolean(dark_mode),
      ]
    );
    res.json({ success: true });
  } catch (err) {
    console.error("POST /profiles error:", err);
    res.status(500).json({ success: false, error: "Database error" });
  }
});

/**
 * 4) Toggle availability
 *    PATCH /profiles/:clerkUserId/availability
 */
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
    console.error("PATCH /profiles/:clerkUserId/availability error:", err);
    res.status(500).json({ success: false, error: "Database error" });
  }
});

/**
 * 5) Toggle dark mode
 *    PATCH /profiles/:clerkUserId/dark-mode
 */
router.patch("/:clerkUserId/dark-mode", async (req, res) => {
  const { clerkUserId } = req.params;
  const { dark_mode } = req.body;
  if (typeof dark_mode !== "boolean") {
    return res
      .status(400)
      .json({ success: false, error: "Missing or invalid dark_mode" });
  }
  try {
    await pool.query(
      `UPDATE profiles SET dark_mode = $1 WHERE clerk_user_id = $2`,
      [dark_mode, clerkUserId]
    );
    res.json({ success: true, dark_mode });
  } catch (err) {
    console.error("PATCH /profiles/:clerkUserId/dark-mode error:", err);
    res.status(500).json({ success: false, error: "Database error" });
  }
});

/**
 * 6) Delete a profile (and cascade all related data)
 *    DELETE /profiles/:clerkUserId
 */
router.delete("/:clerkUserId", async (req, res) => {
  const { clerkUserId } = req.params;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1) Find internal profile PK
    const profileId = await lookupProfileId(clerkUserId);

    // 2) Remove answers & questions
    await client.query(`DELETE FROM answers   WHERE answered_by = $1`, [profileId]);
    await client.query(`DELETE FROM questions WHERE asked_by     = $1`, [profileId]);

    // 3) Remove all messages to/from this user
    await client.query(
      `DELETE FROM messages
         WHERE sender_id   = $1
            OR receiver_id = $1`,
      [profileId]
    );

    // 4) Remove bookings as student or alumni
    await client.query(
      `DELETE FROM bookings
         WHERE student_id = $1
            OR alumni_id  = $1`,
      [profileId]
    );

    // 5) Remove any services offered by this alumni
    await client.query(
      `DELETE FROM services WHERE alumni_id = $1`,
      [profileId]
    );

    // 6) Finally delete the profile row
    await client.query(
      `DELETE FROM profiles WHERE id = $1`,
      [profileId]
    );

    await client.query("COMMIT");
    res.json({ success: true });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("DELETE /profiles/:clerkUserId error:", err);
    res.status(err.status || 500).json({ success: false, error: err.message || "Database error" });
  } finally {
    client.release();
  }
});

module.exports = router;
