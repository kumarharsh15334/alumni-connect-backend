// alumni-connect-backend/routes/qna.js

const express = require("express");
const pool    = require("../db");
const router  = express.Router();

// Helper: fetch all questions with nested answers
async function fetchFullQna() {
  const { rows } = await pool.query(`
    SELECT
      q.id,
      q.question,
      q.asked_at       AS "askedAt",
      json_build_object(
        'id',   p.clerk_user_id,
        'name', p.first_name || ' ' || p.last_name
      )                  AS "askedBy",
      COALESCE(
        json_agg(
          json_build_object(
            'id',         a.id,
            'body',       a.body,
            'answeredAt', a.answered_at,
            'by',         p2.first_name || ' ' || p2.last_name
          ) ORDER BY a.answered_at
        ) FILTER (WHERE a.id IS NOT NULL),
        '[]'
      )                  AS answers
    FROM questions q
    JOIN profiles p       ON q.asked_by    = p.id
    LEFT JOIN answers a   ON a.question_id = q.id
    LEFT JOIN profiles p2 ON a.answered_by = p2.id
    GROUP BY q.id, p.clerk_user_id, p.first_name, p.last_name, q.question, q.asked_at
    ORDER BY q.asked_at DESC
  `);
  return rows;
}

// GET /qna
// Returns all questions + their answers
router.get("/", async (req, res) => {
  try {
    const qna = await fetchFullQna();
    res.json({ success: true, qna });
  } catch (err) {
    console.error("GET /qna error:", err);
    res.status(500).json({ success: false, error: "Database error" });
  }
});

// POST /qna
// Body: { question: string, askedById: string (Clerk user ID) }
router.post("/", async (req, res) => {
  const { question, askedById } = req.body;
  if (!question || !askedById) {
    return res.status(400).json({ success: false, error: "Missing fields" });
  }

  try {
    // Find internal profile PK by Clerk ID
    const profileQ = await pool.query(
      `SELECT id FROM profiles WHERE clerk_user_id = $1`,
      [askedById]
    );
    if (!profileQ.rows.length) {
      return res.status(400).json({ success: false, error: "Invalid user" });
    }
    const profileId = profileQ.rows[0].id;

    // Insert new question
    await pool.query(
      `INSERT INTO questions (question, asked_by) VALUES ($1, $2)`,
      [question, profileId]
    );

    // Return updated feed
    const qna = await fetchFullQna();
    res.json({ success: true, qna });
  } catch (err) {
    console.error("POST /qna error:", err);
    res.status(500).json({ success: false, error: "Database error" });
  }
});

// POST /qna/:id/answer
// Body: { answer: string, byId: string (Clerk user ID) }
router.post("/:id/answer", async (req, res) => {
  const { id }     = req.params;
  const { answer, byId } = req.body;
  if (!answer || !byId) {
    return res.status(400).json({ success: false, error: "Missing fields" });
  }

  try {
    // Find internal profile PK by Clerk ID
    const profileQ = await pool.query(
      `SELECT id FROM profiles WHERE clerk_user_id = $1`,
      [byId]
    );
    if (!profileQ.rows.length) {
      return res.status(400).json({ success: false, error: "Invalid user" });
    }
    const profileId = profileQ.rows[0].id;

    // Insert new answer
    await pool.query(
      `INSERT INTO answers (question_id, answered_by, body) VALUES ($1, $2, $3)`,
      [id, profileId, answer]
    );

    // Return updated feed
    const qna = await fetchFullQna();
    res.json({ success: true, qna });
  } catch (err) {
    console.error("POST /qna/:id/answer error:", err);
    res.status(500).json({ success: false, error: "Database error" });
  }
});

module.exports = router;
