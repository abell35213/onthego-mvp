const App = {
  currentLat: CONFIG.DEFAULT_LAT,
  currentLng: CONFIG.DEFAULT_LNG,
  currentLabel: "Default",
  currentView: "world",

  init() {
    // Ensure sample trips exist
    const trips = Storage.get(CONFIG.STORAGE_KEYS.TRIPS, null);
    if (!trips) Storage.set(CONFIG.STORAGE_KEYS.TRIPS, CONFIG.SAMPLE_TRIPS);

    Account.init();
    UI.init();
    MapModule.init();
    WorldMapModule.init();

    this.bindHeaderButtons();
    this.bindLocationControls();
    this.bindLandingHotelSearch();

    this.refreshProviderBadge();
    this.populateTripDropdown();
    this.renderTravelLog();

    // Start on world view
    this.showView("world");
  },

  bindHeaderButtons() {
    const viewToggle = document.getElementById("viewToggle");
    const travelLogBtn = document.getElementById("travelLogBtn");

    viewToggle.addEventListener("click", () => {
      if (this.currentView === "local") this.showView("world");
      else this.showView("local");
    });

    travelLogBtn.addEventListener("click", () => {
      this.showView("travelLog");
      this.renderTravelLog();
    });
  },

  bindLocationControls() {
    document.getElementById("useGpsBtn").addEventListener("click", () => {
      this.showView("local");
      MapModule.requestUserLocation();
    });

    document.getElementById("tripLocationSelect").addEventListener("change", (e) => {
      const id = e.target.value;
      if (!id) return;
      this.openTrip(id);
    });
  },

  bindLandingHotelSearch() {
    document.getElementById("heroUseGps").addEventListener("click", () => {
      this.showView("local");
      MapModule.requestUserLocation();
    });

    document.getElementById("heroUseSavedTrips").addEventListener("click", () => {
      // just focus the dropdown and nudge
      this.showView("local");
      UI.toast("Pick a trip from the dropdown to search near that hotel.");
      document.getElementById("tripLocationSelect").focus();
    });

    // provider badge in hero
    this.refreshProviderBadge();
  },

  async bindLandingHotelSearch() {
    const form = document.getElementById("hotelSearchForm");
    const input = document.getElementById("hotelSearchInput");
    const sugg = document.getElementById("hotelSuggestions");

    let lastResults = [];

    const renderSuggestions = (items) => {
      if (!items.length) {
        sugg.style.display = "none";
        sugg.innerHTML = "";
        return;
      }
      sugg.innerHTML = items.map((h, idx) => `
        <div class="suggestion-item" data-idx="${idx}">
          <div class="suggestion-title">${h.name}</div>
          <div class="suggestion-sub">${h.address || ""}</div>
        </div>
      `).join("");
      sugg.style.display = "block";

      sugg.querySelectorAll(".suggestion-item").forEach(el => {
        el.addEventListener("click", () => {
          const h = lastResults[Number(el.dataset.idx)];
          if (!h) return;
          sugg.style.display = "none";
          input.value = `${h.name}`;
          this.showView("local");
          MapModule.setSearchCenter(h.coordinates.latitude, h.coordinates.longitude, h.name);
        });
      });
    };

    let debounceTimer = null;
    input.addEventListener("input", () => {
      clearTimeout(debounceTimer);
      const q = input.value.trim();
      if (q.length < 3) return renderSuggestions([]);

      debounceTimer = setTimeout(async () => {
        try {
          const bias = { latitude: this.currentLat, longitude: this.currentLng, radius: 50000 };
          lastResults = await API.searchHotels(q, bias);
          renderSuggestions(lastResults.slice(0, 6));
        } catch (e) {
          console.warn(e);
          renderSuggestions([]);
        }
      }, 250);
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const q = input.value.trim();
      if (!q) return;

      try {
        const bias = { latitude: this.currentLat, longitude: this.currentLng, radius: 50000 };
        lastResults = await API.searchHotels(q, bias);
        if (lastResults.length === 1) {
          const h = lastResults[0];
          this.showView("local");
          MapModule.setSearchCenter(h.coordinates.latitude, h.coordinates.longitude, h.name);
          return;
        }
        renderSuggestions(lastResults.slice(0, 6));
      } catch (err) {
        UI.toast("Hotel search failed. Try again.", "warn");
      }
    });
  },

  showView(which) {
    this.currentView = which;

    const world = document.getElementById("worldView");
    const local = document.getElementById("localView");
    const log = document.getElementById("travelLogView");

    world.style.display = which === "world" ? "flex" : "none";
    local.style.display = which === "local" ? "flex" : "none";
    log.style.display = which === "travelLog" ? "block" : "none";

    const viewToggle = document.getElementById("viewToggle");
    if (which === "local") {
      viewToggle.querySelector("span").textContent = "World View";
      viewToggle.querySelector("i").className = "fas fa-globe";
      // If map has no center yet, set default
      if (!MapModule.userLocation) MapModule.setSearchCenter(this.currentLat, this.currentLng, this.currentLabel);
    } else {
      viewToggle.querySelector("span").textContent = "Restaurant List";
      viewToggle.querySelector("i").className = "fas fa-list";
    }
  },

  onLocationReady(lat, lng, label = "Search Center") {
    this.currentLat = lat;
    this.currentLng = lng;
    this.currentLabel = label;

    const el = document.getElementById("activeLocationLabel");
    if (el) el.textContent = `Searching near: ${label}`;

    this.refreshRestaurants();
  },

  async refreshRestaurants() {
    UI.setLoading(true);

    try {
      const restaurants = await API.fetchRestaurants(this.currentLat, this.currentLng, { preset: UI.preset });
      UI.setRestaurants(restaurants);
    } finally {
      UI.setLoading(false);
    }
  },

  getTrips() {
    return Storage.get(CONFIG.STORAGE_KEYS.TRIPS, CONFIG.SAMPLE_TRIPS);
  },

  populateTripDropdown() {
    const sel = document.getElementById("tripLocationSelect");
    const trips = this.getTrips();

    sel.innerHTML = `<option value="" disabled selected>Select a trip…</option>` +
      trips.map(t => `<option value="${t.id}">${t.hotel} — ${t.city}, ${t.state}</option>`).join("");
  },

  openTrip(id) {
    const trip = this.getTrips().find(t => t.id === id);
    if (!trip) return;

    this.showView("local");
    MapModule.setSearchCenter(trip.coordinates.latitude, trip.coordinates.longitude, trip.hotel);
    document.getElementById("tripLocationSelect").value = id;
  },

  refreshProviderBadge() {
    const settings = Storage.get(CONFIG.STORAGE_KEYS.SETTINGS, {});
    const provider = settings.provider || CONFIG.PROVIDERS.GOOGLE;
    const badge = document.getElementById("providerBadge");
    if (!badge) return;

    if (provider === CONFIG.PROVIDERS.GOOGLE) {
      badge.innerHTML = `<i class="fas fa-database"></i> Google Places`;
      badge.style.background = "rgba(34,197,94,0.18)";
      badge.style.borderColor = "rgba(34,197,94,0.35)";
    } else {
      badge.innerHTML = `<i class="fas fa-flask"></i> Demo Data`;
      badge.style.background = "rgba(245,158,11,0.18)";
      badge.style.borderColor = "rgba(245,158,11,0.35)";
    }
  },

  updateTravelLogFromVisited() {
    // Minimal: store visited IDs with timestamps for the log
    const visited = Storage.get(CONFIG.STORAGE_KEYS.VISITED, {});
    const log = Storage.get(CONFIG.STORAGE_KEYS.LAST_SEARCH, {});

    log.updatedAt = new Date().toISOString();
    log.visited = visited;
    Storage.set(CONFIG.STORAGE_KEYS.LAST_SEARCH, log);

    // if currently on log view, refresh
    if (this.currentView === "travelLog") this.renderTravelLog();
  },

  renderTravelLog() {
    const visited = Storage.get(CONFIG.STORAGE_KEYS.VISITED, {});
    const allVisitedIds = Object.entries(visited).filter(([,v]) => v).map(([k]) => k);

    const stats = document.getElementById("travelLogStats");
    const content = document.getElementById("travelLogContent");

    const trips = this.getTrips();
    const cities = new Set(trips.map(t => `${t.city}, ${t.state}`));

    stats.innerHTML = `
      <div class="stat"><div class="n">${allVisitedIds.length}</div><div class="l">Visited places</div></div>
      <div class="stat"><div class="n">${trips.length}</div><div class="l">Trips saved</div></div>
      <div class="stat"><div class="n">${cities.size}</div><div class="l">Cities</div></div>
    `;

    content.innerHTML = `
      <div class="travel-log-entry">
        <div style="font-weight:1000;">Visited IDs (demo log)</div>
        <div style="color:rgba(238,242,255,0.75); margin-top:8px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono','Courier New', monospace;">
          ${allVisitedIds.length ? allVisitedIds.join("<br/>") : "No visited places yet. Mark one visited from the list."}
        </div>
      </div>
    `;
  }
};

window.addEventListener("DOMContentLoaded", () => App.init());
