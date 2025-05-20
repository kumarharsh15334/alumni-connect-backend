require("dotenv").config();
const pool = require("./db");

async function migrate() {
  console.log("🔌 Connecting to NeonDB…");
  await pool.connect();

  console.log("🛠️  Creating extension and tables…");

  // UUID helper
  await pool.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto";`);

  // Profiles
  await pool.query(`
    CREATE TABLE IF NOT EXISTS profiles (
      id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      clerk_user_id    TEXT         UNIQUE NOT NULL,
      first_name       TEXT         NOT NULL,
      last_name        TEXT         NOT NULL,
      role             TEXT         CHECK (role IN ('student','alumni')) NOT NULL,
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
      profile_image    TEXT,
      hourly_rate      NUMERIC,
      rating           NUMERIC,
      is_available     BOOLEAN      NOT NULL DEFAULT TRUE,
      created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
      updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
    );
  `);

  // Questions
  await pool.query(`
    CREATE TABLE IF NOT EXISTS questions (
      id        UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      asked_by  UUID         REFERENCES profiles(id),
      question  TEXT         NOT NULL,
      asked_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
    );
  `);

  // Answers
  await pool.query(`
    CREATE TABLE IF NOT EXISTS answers (
      id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      question_id UUID         REFERENCES questions(id) ON DELETE CASCADE,
      answered_by UUID         REFERENCES profiles(id),
      body        TEXT         NOT NULL,
      answered_at TIMESTAMPTZ  NOT NULL DEFAULT now()
    );
  `);

  // Messages table (with is_read)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      sender_id   UUID         REFERENCES profiles(id) ON DELETE CASCADE,
      receiver_id UUID         REFERENCES profiles(id) ON DELETE CASCADE,
      content     TEXT         NOT NULL,
      sent_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
      is_read     BOOLEAN      NOT NULL DEFAULT FALSE
    );
  `);

  // If table existed already, ensure is_read column is present
  await pool.query(`
    ALTER TABLE messages
    ADD COLUMN IF NOT EXISTS is_read BOOLEAN NOT NULL DEFAULT FALSE;
  `);

  console.log("✅ Migrations complete!");
  await pool.end();
}

migrate().catch(err => {
  console.error("Migration failed:", err);
  process.exit(1);
});
