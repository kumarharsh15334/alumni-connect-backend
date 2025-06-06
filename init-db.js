// alumni-connect-backend/init-db.js
require("dotenv").config();
const pool = require("./db");

async function migrate() {
  console.log("🔌 Connecting to database…");
  await pool.connect();

  console.log("🛠️  Creating extension and tables…");
  await pool.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto";`);

  // Profiles (updated to include dark_mode DEFAULT FALSE)
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
      dark_mode        BOOLEAN      NOT NULL DEFAULT FALSE,   -- new column
      created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
      updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
    );
  `);

  // Q&A
  await pool.query(`
    CREATE TABLE IF NOT EXISTS questions (
      id        UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      asked_by  UUID         REFERENCES profiles(id),
      question  TEXT         NOT NULL,
      asked_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS answers (
      id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      question_id UUID         REFERENCES questions(id) ON DELETE CASCADE,
      answered_by UUID         REFERENCES profiles(id),
      body        TEXT         NOT NULL,
      answered_at TIMESTAMPTZ  NOT NULL DEFAULT now()
    );
  `);

  // Messages
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

  // Services
  await pool.query(`
    CREATE TABLE IF NOT EXISTS services (
      id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      alumni_id    UUID         REFERENCES profiles(id) ON DELETE CASCADE,
      title        TEXT         NOT NULL,
      description  TEXT,
      rate         NUMERIC      NOT NULL,
      created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
      updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
    );
  `);

  // Bookings
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bookings (
      id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      student_id   UUID         REFERENCES profiles(id) ON DELETE CASCADE,
      alumni_id    UUID         REFERENCES profiles(id) ON DELETE CASCADE,
      service_id   UUID         REFERENCES services(id) ON DELETE CASCADE,
      booking_date DATE         NOT NULL,
      booking_time TIME         NOT NULL,
      status       TEXT         CHECK (status IN ('pending','confirmed','completed','cancelled')) NOT NULL DEFAULT 'pending',
      created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
    );
  `);

  console.log("✅ Migrations complete!");
  await pool.end();
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
