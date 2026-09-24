const pool = require("./db.js");

async function testConnection() {
  try {
    const [rows] = await pool.query("SHOW TABLES");
    console.log("Connected! Tables found:", rows);
  } catch (err) {
    console.error("Connection failed:", err.message);
  } finally {
    process.exit();
  }
}

testConnection();