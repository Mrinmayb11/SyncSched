import pg from "pg";
import 'dotenv/config';

// Initialize database client
const db_client = new pg.Client({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  password: process.env.PG_PASSWORD,
  port: process.env.PG_PORT,
});

// Connect to database
db_client.connect().then(() => {
  console.log("Database connection established");
}).catch(err => {
  console.error("Database connection error:", err);
});

export { db_client }; 