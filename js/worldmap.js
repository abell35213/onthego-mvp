const WorldMapModule = {
  map: null,
  markers: [],

  init() {
    if (typeof L === "undefined") return;

    this.map = L.map("worldMap", { zoomControl: true }).setView([20, 0], 2);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
      maxZoom: 18
    }).addTo(this.map);

    this.renderTrips();
  },

  renderTrips() {
    const trips = App.getTrips();
    const historyEl = document.getElementById("tripHistory");
    const upcomingEl = document.getElementById("upcomingTrips");

    historyEl.innerHTML = "";
    upcomingEl.innerHTML = "";

    this.clearMarkers();

    const now = new Date();

    trips.forEach((t) => {
      const start = new Date(t.startDate);
      const isUpcoming = start > now;

      const card = document.createElement("div");
      card.className = "trip-card";
      card.innerHTML = `
        <div class="trip-title">${t.hotel}</div>
        <div class="trip-sub">${t.city}, ${t.state} • ${t.startDate} → ${t.endDate}</div>
      `;
      card.addEventListener("click", () => this.highlightTrip(t.id));
      (isUpcoming ? upcomingEl : historyEl).appendChild(card);

      const m = L.marker([t.coordinates.latitude, t.coordinates.longitude]).addTo(this.map);
      m.bindPopup(`<strong>${t.hotel}</strong><br/>${t.city}, ${t.state}<br/><em>Click to search dining</em>`);
      m.on("click", () => this.highlightTrip(t.id));
      this.markers.push(m);
    });

    if (this.markers.length) {
      const group = L.featureGroup(this.markers);
      this.map.fitBounds(group.getBounds().pad(0.25));
    }
  },

  clearMarkers() {
    if (!this.map) return;
    this.markers.forEach(m => { try { this.map.removeLayer(m); } catch {} });
    this.markers = [];
  },

  highlightTrip(id) {
    App.openTrip(id);

    if (window.App && App.currentView && App.currentView !== CONFIG.VIEW_MODE_WORLD) {
      // If user isn't in world view, don't run simulated nearby pins behavior
      return;
    }
  }
};
