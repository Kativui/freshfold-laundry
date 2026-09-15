/* ============================================================
   FreshFold Laundry — Backend API
   A small Express server backed by a JSON file acting as the
   database (data.json). This gives you real persistence that
   any device can reach over the network — not just the browser
   that made the booking.

   Endpoints:
     GET   /api/slots?date=YYYY-MM-DD   -> { allSlots, taken }
     POST  /api/bookings                -> create a booking
     GET   /api/bookings?phone=...      -> a customer's bookings
     PATCH /api/bookings/:ref/cancel    -> cancel a booking
     GET   /api/admin/bookings          -> ALL bookings (business view)
   ============================================================ */

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 3001;
const DB_FILE = path.join(__dirname, "data.json");

const SLOTS = [
  "08:00 - 09:00", "09:00 - 10:00", "10:00 - 11:00", "11:00 - 12:00",
  "12:00 - 13:00", "13:00 - 14:00", "14:00 - 15:00", "15:00 - 16:00",
  "16:00 - 17:00", "17:00 - 18:00"
];

app.use(cors());
app.use(express.json());

/* ---------------- JSON "database" helpers ---------------- */

function readDB() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ bookings: [] }, null, 2));
  }
  return JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
}

function writeDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

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

/* ---------------- Routes ---------------- */

// Available / taken time slots for a given date
app.get("/api/slots", (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: "date is required" });

  const db = readDB();
  const taken = db.bookings
    .filter(b => b.date === date && b.status === "confirmed")
    .map(b => b.timeSlot);

  res.json({ date, allSlots: SLOTS, taken });
});

// Create a booking
app.post("/api/bookings", (req, res) => {
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

  const db = readDB();

  // Authoritative slot-clash check happens on the server, not the browser
  const clash = db.bookings.some(x =>
    x.status === "confirmed" && x.date === b.date && x.timeSlot === b.timeSlot
  );
  if (clash) {
    return res.status(409).json({ error: "that time slot was just booked by someone else" });
  }

  const booking = {
    ref: generateRef(),
    service: b.service,
    quantity: Number(b.quantity),
    unit: b.unit,
    express: !!b.express,
    delivery: !!b.delivery,
    address: b.delivery ? b.address : "",
    date: b.date,
    timeSlot: b.timeSlot,
    fullName: b.fullName,
    phone: b.phone,
    email: b.email || "",
    subtotal: Number(b.subtotal) || 0,
    expressFee: Number(b.expressFee) || 0,
    deliveryFee: Number(b.deliveryFee) || 0,
    total: Number(b.total) || 0,
    status: "confirmed",
    createdAt: new Date().toISOString()
  };

  db.bookings.push(booking);
  writeDB(db);

  res.status(201).json(booking);
});

// A customer's bookings, by phone number
app.get("/api/bookings", (req, res) => {
  const { phone } = req.query;
  if (!phone) return res.status(400).json({ error: "phone is required" });

  const db = readDB();
  const results = db.bookings
    .filter(b => b.phone === phone)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  res.json(results);
});

// Cancel a booking
app.patch("/api/bookings/:ref/cancel", (req, res) => {
  const { ref } = req.params;
  const db = readDB();
  const booking = db.bookings.find(b => b.ref === ref);

  if (!booking) return res.status(404).json({ error: "booking not found" });
  if (booking.status === "cancelled") return res.status(400).json({ error: "already cancelled" });

  booking.status = "cancelled";
  writeDB(db);

  res.json(booking);
});

// Business/admin view — every booking, from every customer
app.get("/api/admin/bookings", (req, res) => {
  const db = readDB();
  const sorted = [...db.bookings].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(sorted);
});

app.listen(PORT, () => {
  console.log(`FreshFold API running at http://localhost:${PORT}`);
});
