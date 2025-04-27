// alumni-connect-backend/db.js
const { Pool } = require("pg");
require("dotenv").config();

if (!process.env.DATABASE_URL) {
  throw new Error("Missing DATABASE_URL in .env");
}

module.exports = new Pool({
  connectionString: process.env.DATABASE_URL,
});
