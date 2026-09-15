/* ============================================================
   FreshFold Laundry — Booking Logic (talks to backend API)
   Change the API_BASE below if your backend runs on a
   different host/port (e.g. when you deploy it later).
   ============================================================ */

const API_BASE = "https://freshfold-laundry-dgl3.onrender.com/api";

const SLOTS = [
  "08:00 - 09:00", "09:00 - 10:00", "10:00 - 11:00", "11:00 - 12:00",
  "12:00 - 13:00", "13:00 - 14:00", "14:00 - 15:00", "15:00 - 16:00",
  "16:00 - 17:00", "17:00 - 18:00"
];

const DELIVERY_FEE = 100;
const EXPRESS_MULTIPLIER = 1.5;

/* ---------------- Navigation ---------------- */

const navButtons = document.querySelectorAll(".nav-btn");
const sections = document.querySelectorAll(".section");

navButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    navButtons.forEach(b => b.classList.remove("active"));
    sections.forEach(s => s.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(btn.dataset.section).classList.add("active");
  });
});

/* ---------------- Elements ---------------- */

const form = document.getElementById("bookingForm");
const serviceInputs = document.querySelectorAll('input[name="service"]');
const unitLabel = document.getElementById("unitLabel");
const quantityInput = document.getElementById("quantity");
const expressInput = document.getElementById("express");
const deliveryInput = document.getElementById("delivery");
const addressRow = document.getElementById("addressRow");
const addressInput = document.getElementById("address");
const dateInput = document.getElementById("bookingDate");
const slotGrid = document.getElementById("slotGrid");
const timeSlotHidden = document.getElementById("timeSlot");
const summaryLines = document.getElementById("summaryLines");
const summaryTotal = document.getElementById("summaryTotal");

const today = new Date().toISOString().split("T")[0];
dateInput.setAttribute("min", today);

/* ---------------- Service / unit label sync ---------------- */

serviceInputs.forEach(input => {
  input.addEventListener("change", () => {
    unitLabel.textContent = input.dataset.unit;
    clearError("serviceError");
    updateSummary();
  });
});

quantityInput.addEventListener("input", updateSummary);
expressInput.addEventListener("change", updateSummary);

deliveryInput.addEventListener("change", () => {
  addressRow.style.display = deliveryInput.checked ? "flex" : "none";
  if (!deliveryInput.checked) clearError("addressError");
  updateSummary();
});

/* ---------------- Date -> time slots (from server) ---------------- */

dateInput.addEventListener("change", () => {
  clearError("dateError");
  timeSlotHidden.value = "";
  renderSlots(dateInput.value);
  updateSummary();
});

async function renderSlots(dateValue) {
  slotGrid.innerHTML = '<p class="slot-hint">Loading available slots…</p>';

  if (!dateValue) {
    slotGrid.innerHTML = '<p class="slot-hint">Select a date to see available slots.</p>';
    return;
  }

  let taken = [];
  try {
    const res = await fetch(`${API_BASE}/slots?date=${encodeURIComponent(dateValue)}`);
    const data = await res.json();
    taken = data.taken || [];
  } catch (err) {
    slotGrid.innerHTML = '<p class="slot-hint">Could not reach the server. Is the backend running?</p>';
    return;
  }

  slotGrid.innerHTML = "";
  SLOTS.forEach(slot => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "slot-btn";
    btn.textContent = slot;

    if (taken.includes(slot)) {
      btn.disabled = true;
      btn.title = "Already booked";
    } else {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".slot-btn").forEach(b => b.classList.remove("selected"));
        btn.classList.add("selected");
        timeSlotHidden.value = slot;
        clearError("slotError");
        updateSummary();
      });
    }

    slotGrid.appendChild(btn);
  });
}

/* ---------------- Pricing / summary ---------------- */

function getSelectedService() {
  return Array.from(serviceInputs).find(i => i.checked) || null;
}

function calculateTotal() {
  const service = getSelectedService();
  const quantity = parseFloat(quantityInput.value) || 0;

  if (!service || quantity <= 0) {
    return { subtotal: 0, expressFee: 0, deliveryFee: 0, total: 0, service: null, quantity };
  }

  const price = parseFloat(service.dataset.price);
  let subtotal = price * quantity;
  let expressFee = 0;
  let deliveryFee = 0;

  if (expressInput.checked) {
    expressFee = subtotal * (EXPRESS_MULTIPLIER - 1);
  }
  if (deliveryInput.checked) {
    deliveryFee = DELIVERY_FEE;
  }

  const total = subtotal + expressFee + deliveryFee;
  return { subtotal, expressFee, deliveryFee, total, service, quantity };
}

function updateSummary() {
  const { subtotal, expressFee, deliveryFee, total, service, quantity } = calculateTotal();

  if (!service) {
    summaryLines.innerHTML = '<p class="slot-hint">Fill in the form to see your total.</p>';
    summaryTotal.textContent = "KES 0";
    return;
  }

  const serviceName = service.parentElement.querySelector(".service-name").textContent;
  const unit = service.dataset.unit;

  let html = `<p><span>${serviceName} (${quantity} ${unit})</span><span>KES ${subtotal.toFixed(0)}</span></p>`;
  if (expressFee > 0) {
    html += `<p><span>Express surcharge (50%)</span><span>KES ${expressFee.toFixed(0)}</span></p>`;
  }
  if (deliveryFee > 0) {
    html += `<p><span>Home delivery</span><span>KES ${deliveryFee.toFixed(0)}</span></p>`;
  }

  summaryLines.innerHTML = html;
  summaryTotal.textContent = `KES ${total.toFixed(0)}`;
}

/* ---------------- Validation helpers ---------------- */

function showError(id, message) {
  document.getElementById(id).textContent = message;
}

function clearError(id) {
  document.getElementById(id).textContent = "";
}

function clearAllErrors() {
  document.querySelectorAll(".error-msg").forEach(el => el.textContent = "");
}

function validateForm() {
  clearAllErrors();
  let valid = true;

  if (!getSelectedService()) {
    showError("serviceError", "Please choose a service.");
    valid = false;
  }

  const quantity = parseFloat(quantityInput.value);
  if (!quantity || quantity <= 0) {
    showError("quantityError", "Enter a valid quantity.");
    valid = false;
  }

  if (deliveryInput.checked && !addressInput.value.trim()) {
    showError("addressError", "Please provide a delivery address.");
    valid = false;
  }

  if (!dateInput.value) {
    showError("dateError", "Please choose a pickup date.");
    valid = false;
  } else if (dateInput.value < today) {
    showError("dateError", "Date cannot be in the past.");
    valid = false;
  }

  if (!timeSlotHidden.value) {
    showError("slotError", "Please select a time slot.");
    valid = false;
  }

  const fullName = document.getElementById("fullName").value.trim();
  if (!fullName) {
    showError("fullNameError", "Please enter your full name.");
    valid = false;
  }

  const phone = document.getElementById("phone").value.trim();
  const phonePattern = /^(?:\+254|0)[71]\d{8}$/;
  if (!phone) {
    showError("phoneError", "Please enter your phone number.");
    valid = false;
  } else if (!phonePattern.test(phone)) {
    showError("phoneError", "Enter a valid Kenyan phone number (e.g. 0712345678).");
    valid = false;
  }

  const email = document.getElementById("email").value.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showError("emailError", "Enter a valid email address.");
    valid = false;
  }

  return valid;
}

/* ---------------- Submit (POST to backend) ---------------- */

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (!validateForm()) return;

  const { subtotal, expressFee, deliveryFee, total, service, quantity } = calculateTotal();
  const serviceName = service.parentElement.querySelector(".service-name").textContent;

  const payload = {
    service: serviceName,
    quantity,
    unit: service.dataset.unit,
    express: expressInput.checked,
    delivery: deliveryInput.checked,
    address: deliveryInput.checked ? addressInput.value.trim() : "",
    date: dateInput.value,
    timeSlot: timeSlotHidden.value,
    fullName: document.getElementById("fullName").value.trim(),
    phone: document.getElementById("phone").value.trim(),
    email: document.getElementById("email").value.trim(),
    subtotal, expressFee, deliveryFee, total
  };

  const submitBtn = form.querySelector(".submit-btn");
  submitBtn.disabled = true;
  submitBtn.textContent = "Booking…";

  try {
    const res = await fetch(`${API_BASE}/bookings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (!res.ok) {
      // Slot clash or validation error caught by the server
      showError("slotError", data.error || "Something went wrong. Please try again.");
      renderSlots(dateInput.value);
      return;
    }

    showConfirmation(data);
    form.reset();
    addressRow.style.display = "none";
    unitLabel.textContent = "kg";
    slotGrid.innerHTML = '<p class="slot-hint">Select a date to see available slots.</p>';
    updateSummary();

  } catch (err) {
    showError("slotError", "Could not reach the server. Is the backend running?");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Confirm Booking";
  }
});

/* ---------------- Confirmation modal ---------------- */

const confirmModal = document.getElementById("confirmModal");
const bookingRefEl = document.getElementById("bookingRef");
const modalDetails = document.getElementById("modalDetails");
const closeModalBtn = document.getElementById("closeModalBtn");

function showConfirmation(booking) {
  bookingRefEl.textContent = booking.ref;
  modalDetails.innerHTML = `
    <p><span>Service</span><span>${booking.service}</span></p>
    <p><span>Date</span><span>${booking.date}</span></p>
    <p><span>Time</span><span>${booking.timeSlot}</span></p>
    <p><span>Total</span><span>KES ${booking.total.toFixed(0)}</span></p>
  `;
  confirmModal.classList.add("active");
}

closeModalBtn.addEventListener("click", () => {
  confirmModal.classList.remove("active");
});

/* ---------------- My Bookings lookup / cancel (from server) ---------------- */

const lookupBtn = document.getElementById("lookupBtn");
const lookupPhone = document.getElementById("lookupPhone");
const bookingsListEl = document.getElementById("bookingsList");

lookupBtn.addEventListener("click", async () => {
  const phone = lookupPhone.value.trim();
  if (!phone) {
    bookingsListEl.innerHTML = '<p class="slot-hint">Enter your phone number to search.</p>';
    return;
  }

  bookingsListEl.innerHTML = '<p class="slot-hint">Searching…</p>';

  try {
    const res = await fetch(`${API_BASE}/bookings?phone=${encodeURIComponent(phone)}`);
    const bookings = await res.json();
    renderBookingsList(bookings, phone);
  } catch (err) {
    bookingsListEl.innerHTML = '<p class="slot-hint">Could not reach the server. Is the backend running?</p>';
  }
});

function renderBookingsList(bookings, phone) {
  if (bookings.length === 0) {
    bookingsListEl.innerHTML = '<p class="slot-hint">No bookings found for that phone number.</p>';
    return;
  }

  bookingsListEl.innerHTML = "";
  bookings.forEach(booking => {
    const item = document.createElement("div");
    item.className = "booking-item";
    item.innerHTML = `
      <div class="top-row">
        <span class="booking-ref-tag">${booking.ref}</span>
        <span class="status-tag ${booking.status === 'confirmed' ? 'status-confirmed' : 'status-cancelled'}">
          ${booking.status === 'confirmed' ? 'Confirmed' : 'Cancelled'}
        </span>
      </div>
      <p>${booking.service} — ${booking.quantity} ${booking.unit}</p>
      <p>${booking.date} · ${booking.timeSlot}</p>
      <p>Total: KES ${booking.total.toFixed(0)}</p>
      <button type="button" class="cancel-btn" data-ref="${booking.ref}" ${booking.status !== 'confirmed' ? 'disabled' : ''}>
        Cancel Booking
      </button>
    `;
    bookingsListEl.appendChild(item);
  });

  bookingsListEl.querySelectorAll(".cancel-btn").forEach(btn => {
    btn.addEventListener("click", () => cancelBooking(btn.dataset.ref, phone));
  });
}

async function cancelBooking(ref, phone) {
  try {
    await fetch(`${API_BASE}/bookings/${encodeURIComponent(ref)}/cancel`, { method: "PATCH" });
    const res = await fetch(`${API_BASE}/bookings?phone=${encodeURIComponent(phone)}`);
    const bookings = await res.json();
    renderBookingsList(bookings, phone);
  } catch (err) {
    alert("Could not cancel the booking. Is the backend running?");
  }
}

/* ---------------- Init ---------------- */

updateSummary();
