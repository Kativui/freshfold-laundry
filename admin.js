const API_BASE = "https://freshfold-laundry-dgl3.onrender.com";

const statsCard = document.getElementById("statsCard");
const listEl = document.getElementById("adminBookingsList");

async function loadBookings() {
  try {
    const res = await fetch(`${API_BASE}/admin/bookings`);
    const bookings = await res.json();
    renderStats(bookings);
    renderList(bookings);
  } catch (err) {
    listEl.innerHTML = `<p class="slot-hint">Could not reach the server. Error details: <strong>${err.message}</strong></p>`;
    statsCard.innerHTML = '<p class="slot-hint">—</p>';
  }
}

function renderStats(bookings) {
  const confirmed = bookings.filter(b => b.status === "confirmed");
  const revenue = confirmed.reduce((sum, b) => sum + (b.total || 0), 0);

  statsCard.innerHTML = `
    <p><strong>${bookings.length}</strong> total bookings</p>
    <p><strong>${confirmed.length}</strong> confirmed &middot; <strong>${bookings.length - confirmed.length}</strong> cancelled</p>
    <p><strong>KES ${revenue.toFixed(0)}</strong> in confirmed bookings</p>
  `;
}

function renderList(bookings) {
  if (bookings.length === 0) {
    listEl.innerHTML = '<p class="slot-hint">No bookings yet.</p>';
    return;
  }

  listEl.innerHTML = "";
  bookings.forEach(b => {
    const item = document.createElement("div");
    item.className = "booking-item";
    item.innerHTML = `
      <div class="top-row">
        <span class="booking-ref-tag">${b.ref}</span>
        <span class="status-tag ${b.status === 'confirmed' ? 'status-confirmed' : 'status-cancelled'}">
          ${b.status === 'confirmed' ? 'Confirmed' : 'Cancelled'}
        </span>
      </div>
      <p>${b.fullName} — ${b.phone}${b.email ? " — " + b.email : ""}</p>
      <p>${b.service} — ${b.quantity} ${b.unit}${b.express ? " (Express)" : ""}</p>
      <p>${b.date} · ${b.timeSlot}</p>
      <p>${b.delivery ? "Delivery to: " + b.address : "Self pickup"}</p>
      <p>Total: KES ${b.total.toFixed(0)}</p>
    `;
    listEl.appendChild(item);
  });
}

loadBookings();