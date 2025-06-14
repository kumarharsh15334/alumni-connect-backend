//alumni-connect-backend/routes/services.js
const express = require("express");
const pool = require("../db");
const router = express.Router();

async function lookupProfile(clerkUserId) {
  const { rows } = await pool.query(
    "SELECT id FROM profiles WHERE clerk_user_id = $1",
    [clerkUserId]
  );
  if (!rows.length) throw new Error("Profile not found");
  return rows[0].id;
}

// GET /services/alumni/:clerkUserId
router.get("/alumni/:clerkUserId", async (req, res) => {
  try {
    const alumniId = await lookupProfile(req.params.clerkUserId);
    const { rows } = await pool.query(
      `
      SELECT
        id,
        title,
        description,
        rate,
        duration_months AS session_time_months
      FROM services
      WHERE alumni_id = $1
      ORDER BY created_at DESC
      `,
      [alumniId]
    );
    res.json({ success: true, services: rows });
  } catch (err) {
    console.error("GET /services error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /services/alumni/:clerkUserId
router.post("/alumni/:clerkUserId", async (req, res) => {
  const { title, description, rate, duration_months } = req.body;
  if (!title || rate == null || duration_months == null) {
    return res.status(400).json({ success: false, error: "Missing fields" });
  }
  try {
    const alumniId = await lookupProfile(req.params.clerkUserId);
    const { rows } = await pool.query(
      `
      INSERT INTO services
        (alumni_id, title, description, rate, duration_months)
      VALUES ($1,$2,$3,$4,$5)
      RETURNING id, title, description, rate, duration_months AS session_time_months
      `,
      [alumniId, title, description || "", rate, duration_months]
    );
    res.json({ success: true, services: rows });
  } catch (err) {
    console.error("POST /services error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /services/:id
router.patch("/:id", async (req, res) => {
  const { title, description, rate, duration_months } = req.body;
  const sets = [];
  const vals = [];
  let idx = 1;
  if (title !== undefined) {
    sets.push(`title = $${idx++}`);
    vals.push(title);
  }
  if (description !== undefined) {
    sets.push(`description = $${idx++}`);
    vals.push(description);
  }
  if (rate !== undefined) {
    sets.push(`rate = $${idx++}`);
    vals.push(rate);
  }
  if (duration_months !== undefined) {
    sets.push(`duration_months = $${idx++}`);
    vals.push(duration_months);
  }
  if (!sets.length) {
    return res.status(400).json({ success: false, error: "Nothing to update" });
  }
  vals.push(req.params.id);
  try {
    const { rows } = await pool.query(
      `
      UPDATE services
      SET ${sets.join(", ")}, updated_at = now()
      WHERE id = $${idx}
      RETURNING id, title, description, rate, duration_months AS session_time_months
      `,
      vals
    );
    res.json({ success: true, services: rows });
  } catch (err) {
    console.error("PATCH /services error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /services/:id
router.delete("/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM services WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error("DELETE /services error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
