require("dotenv").config();   // 👈 THIS LINE WAS MISSING
const knex = require("knex");

// PostgreSQL config
const knexConfig = {
  client: "pg",
  connection: {
    host: process.env.PG_HOST,
    user: process.env.PG_USER,
    password: String(process.env.PG_PASSWORD), // force string
    database: process.env.PG_DATABASE,
    port: Number(process.env.PG_PORT),
  },
  pool: {
    min: 2,
    max: 10,
  },
};

// Initialize Knex
const db = knex(knexConfig);

// Test DB connection
async function connectDb() {
  console.log("Connecting to the database...");
  try {
    await db.raw("SELECT 1");
    console.log("✅ Database connection successful.");
  } catch (error) {
    console.error("Database connection failed:", error.message);
    throw error;
  }
}

// Exports
module.exports = db;
module.exports.connectDb = connectDb;
