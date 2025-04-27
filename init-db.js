// alumni-connect-backend/init-db.js
const pool = require("./db");
require("dotenv").config();

async function migrate() {
  console.log("🔌 Connecting to NeonDB…");
  await pool.connect();

  console.log("🛠️  Creating extension and tables…");

  // UUID helper
  await pool.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto";`);

  // Profiles
  await pool.query(`
    CREATE TABLE IF NOT EXISTS profiles (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      clerk_user_id    TEXT UNIQUE NOT NULL,
      first_name       TEXT NOT NULL,
      last_name        TEXT NOT NULL,
      role             TEXT CHECK (role IN ('student','alumni')) NOT NULL,
      college          TEXT,
      department       TEXT,
      semester         TEXT,
      company          TEXT,
      industry         TEXT,
      graduation_year  INTEGER,
      experience_years INTEGER,
      skills           TEXT[],
      website          TEXT,
      linkedin_url     TEXT,
      hourly_rate      NUMERIC,
      rating           NUMERIC,
      profile_image    TEXT,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // Questions
  await pool.query(`
    CREATE TABLE IF NOT EXISTS questions (
      id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      asked_by  UUID REFERENCES profiles(id),
      question  TEXT    NOT NULL,
      asked_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // Answers
  await pool.query(`
    CREATE TABLE IF NOT EXISTS answers (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      question_id    UUID REFERENCES questions(id) ON DELETE CASCADE,
      answered_by    UUID REFERENCES profiles(id),
      body           TEXT    NOT NULL,
      answered_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  console.log("✅ Migrations complete!");
  await pool.end();
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
