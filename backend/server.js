/* ============================================================
   FreshFold Laundry — Backend API (MySQL version)
   Same endpoints as before, but reading/writing a real MySQL
   database (freshfold_laundry.bookings) instead of a JSON file.

   Endpoints:
     GET   /api/slots?date=YYYY-MM-DD   -> { allSlots, taken }
     POST  /api/bookings                -> create a booking
     GET   /api/bookings?phone=...      -> a customer's bookings
     PATCH /api/bookings/:ref/cancel    -> cancel a booking
     GET   /api/admin/bookings          -> ALL bookings (business view)
     DELETE /api/admin/bookings/:ref    -> permanently delete one booking
     DELETE /api/admin/bookings         -> permanently delete ALL bookings
   ============================================================ */
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const pool = require("./db");

const app = express();
const PORT = 3001;

const SLOTS = [
  "08:00 - 09:00", "09:00 - 10:00", "10:00 - 11:00", "11:00 - 12:00",
  "12:00 - 13:00", "13:00 - 14:00", "14:00 - 15:00", "15:00 - 16:00",
  "16:00 - 17:00", "17:00 - 18:00"
];

app.use(cors());
app.use(express.json());

/* ---------------- Helpers ---------------- */

function generateRef() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let ref = "FF-";
  for (let i = 0; i < 6; i++) {
    ref += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return ref;
}

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

// Converts a MySQL row (snake_case, 0/1 booleans) into the camelCase
// shape the frontend already expects, so script.js/admin.js need no changes.
function formatBooking(row) {
  return {
    ref: row.ref,
    service: row.service,
    quantity: Number(row.quantity),
    unit: row.unit,
    express: !!row.express,
    delivery: !!row.delivery,
    address: row.address || "",
    date: row.booking_date,
    timeSlot: row.time_slot,
    fullName: row.full_name,
    phone: row.phone,
    email: row.email || "",
    subtotal: Number(row.subtotal),
    expressFee: Number(row.express_fee),
    deliveryFee: Number(row.delivery_fee),
    total: Number(row.total),
    status: row.status,
    createdAt: row.created_at,
  };
}

/* ---------------- Routes ---------------- */

// Available / taken time slots for a given date
function requireAdmin(req, res, next) {
  const key = req.headers["x-admin-key"];
  if (key !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
}
app.get("/api/slots", async (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: "date is required" });

  try {
    const [rows] = await pool.query(
      "SELECT time_slot FROM bookings WHERE booking_date = ? AND status = 'confirmed'",
      [date]
    );
    const taken = rows.map(r => r.time_slot);
    res.json({ date, allSlots: SLOTS, taken });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "database error" });
  }
});

// Create a booking
app.post("/api/bookings", async (req, res) => {
  const b = req.body || {};

  const required = ["service", "quantity", "unit", "date", "timeSlot", "fullName", "phone"];
  for (const field of required) {
    if (!b[field]) {
      return res.status(400).json({ error: `${field} is required` });
    }
  }

  if (Number(b.quantity) <= 0) {
    return res.status(400).json({ error: "quantity must be greater than 0" });
  }

  if (b.date < todayStr()) {
    return res.status(400).json({ error: "date cannot be in the past" });
  }

  const phonePattern = /^(?:\+254|0)[71]\d{8}$/;
  if (!phonePattern.test(b.phone)) {
    return res.status(400).json({ error: "invalid phone number" });
  }

  if (b.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email)) {
    return res.status(400).json({ error: "invalid email address" });
  }

  if (b.delivery && !b.address) {
    return res.status(400).json({ error: "address is required for delivery" });
  }

  try {
    // Authoritative slot-clash check happens on the server, not the browser
    const [clashRows] = await pool.query(
      "SELECT id FROM bookings WHERE booking_date = ? AND time_slot = ? AND status = 'confirmed'",
      [b.date, b.timeSlot]
    );
    if (clashRows.length > 0) {
      return res.status(409).json({ error: "that time slot was just booked by someone else" });
    }

    const ref = generateRef();

    await pool.query(
      `INSERT INTO bookings
        (ref, service, quantity, unit, express, delivery, address, booking_date, time_slot,
         full_name, phone, email, subtotal, express_fee, delivery_fee, total, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed')`,
      [
        ref, b.service, Number(b.quantity), b.unit, !!b.express, !!b.delivery,
        b.delivery ? b.address : "", b.date, b.timeSlot, b.fullName, b.phone, b.email || "",
        Number(b.subtotal) || 0, Number(b.expressFee) || 0, Number(b.deliveryFee) || 0, Number(b.total) || 0,
      ]
    );

    const [rows] = await pool.query("SELECT * FROM bookings WHERE ref = ?", [ref]);
    res.status(201).json(formatBooking(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "database error" });
  }
});

// A customer's bookings, by phone number
app.get("/api/bookings", async (req, res) => {
  const { phone } = req.query;
  if (!phone) return res.status(400).json({ error: "phone is required" });

  try {
    const [rows] = await pool.query(
      "SELECT * FROM bookings WHERE phone = ? ORDER BY created_at DESC",
      [phone]
    );
    res.json(rows.map(formatBooking));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "database error" });
  }
});

// Cancel a booking
app.patch("/api/bookings/:ref/cancel", async (req, res) => {
  const { ref } = req.params;

  try {
    const [rows] = await pool.query("SELECT * FROM bookings WHERE ref = ?", [ref]);
    if (rows.length === 0) return res.status(404).json({ error: "booking not found" });
    if (rows[0].status === "cancelled") return res.status(400).json({ error: "already cancelled" });

    await pool.query("UPDATE bookings SET status = 'cancelled' WHERE ref = ?", [ref]);

    const [updated] = await pool.query("SELECT * FROM bookings WHERE ref = ?", [ref]);
    res.json(formatBooking(updated[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "database error" });
  }
});

// Business/admin view — every booking, from every customer
app.get("/api/admin/bookings",requireAdmin ,async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM bookings ORDER BY created_at DESC");
    res.json(rows.map(formatBooking));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "database error" });
  }
});

// Permanently delete a single booking (admin only)
app.delete("/api/admin/bookings/:ref",requireAdmin ,async (req, res) => {
  const { ref } = req.params;

  try {
    const [result] = await pool.query("DELETE FROM bookings WHERE ref = ?", [ref]);
    if (result.affectedRows === 0) return res.status(404).json({ error: "booking not found" });
    res.json({ deleted: ref });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "database error" });
  }
});

// Permanently delete ALL bookings (admin only — use with care)
app.delete("/api/admin/bookings",requireAdmin ,async (req, res) => {
  try {
    await pool.query("DELETE FROM bookings");
    res.json({ message: "all bookings cleared" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "database error" });
  }
});

app.listen(PORT, () => {
  console.log(`FreshFold API (MySQL) running at http://localhost:${PORT}`);
});