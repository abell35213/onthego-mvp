const App = {
  currentLat: CONFIG.DEFAULT_LAT,
  currentLng: CONFIG.DEFAULT_LNG,
  currentLabel: "Default",
  currentView: "world",

  restaurantById: new Map(),

  init() {
    // bootstrap trips if empty
    const trips = Storage.get(CONFIG.STORAGE_KEYS.TRIPS, null);
    if (!trips) Storage.set(CONFIG.STORAGE_KEYS.TRIPS, CONFIG.SAMPLE_TRIPS);

    Account.init();
    UI.init();
    MapModule.init();
    WorldMapModule.init();
    if (typeof DinnerPlan !== 'undefined') {
      DinnerPlan.init();
    }

    this.bindHeaderButtons();
    this.bindLocationControls();
    this.bindLandingHotelSearch();
    this.bindShareButtons();

    this.refreshProviderBadge();
    this.populateTripDropdown();
    this.renderTravelLog();

    // Handle share-link import (if present)
    this.maybeImportSharedListFromHash();

    // Start world view
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

  bindShareButtons() {
    document.getElementById("shareBtn").addEventListener("click", () => this.shareShortlist());
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

    document.getElementById("heroUseGps").addEventListener("click", () => {
      this.showView("local");
      MapModule.requestUserLocation();
    });

    document.getElementById("heroUseSavedTrips").addEventListener("click", () => {
      this.showView("local");
      UI.toast("Pick a trip from the dropdown to search near that hotel.");
      document.getElementById("tripLocationSelect").focus();
    });
  },

  bindLandingHotelSearch() {
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
        } catch {
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
      } catch {
        UI.toast("Hotel search failed. Try again.");
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

      // If location not set, default
      if (!MapModule.userLocation) MapModule.setSearchCenter(this.currentLat, this.currentLng, this.currentLabel);

      // calendar-aware preset selection
      this.autoPresetFromTime();
    } else {
      viewToggle.querySelector("span").textContent = "Restaurant List";
      viewToggle.querySelector("i").className = "fas fa-list";
    }
  },

  autoPresetFromTime() {
    const suggested = API.suggestedPresetForNow(new Date());
    // only auto-switch if user hasn't already selected something manually in this session
    // We'll still show a hint always.
    this.showTimeHintForPreset(suggested, true);

    // If user is in local view and hasn't interacted much, align preset to time.
    // We treat “client_dinner” as default but switch for morning/lunch.
    if (suggested !== UI.preset) {
      UI.preset = suggested;
      this.syncChipUI(suggested);
      // don't force immediate fetch if we are already mid-search; small debounce
      clearTimeout(this._autoPresetTimer);
      this._autoPresetTimer = setTimeout(() => this.refreshRestaurants(), 200);
    }
  },

  showTimeHintForPreset(preset, auto = false) {
    const hint = document.getElementById("timeHint");
    const label =
      preset === "coffee" ? "Coffee" :
      preset === "quick_lunch" ? "Quick Lunch" :
      preset === "client_dinner" ? "Client Dinner" : "Drinks";

    hint.textContent = auto
      ? `Suggested for now: ${label} (time-aware)`
      : `Mode: ${label}`;
    hint.style.display = "block";
  },

  syncChipUI(preset) {
    document.querySelectorAll("#quickChips .chip").forEach(b => {
      b.classList.toggle("active", b.dataset.preset === preset);
    });
  },

  onLocationReady(lat, lng, label = "Search Center") {
    this.currentLat = lat;
    this.currentLng = lng;
    this.currentLabel = label;

    const el = document.getElementById("activeLocationLabel");
    if (el) el.textContent = `Searching near: ${label}`;

    // time-aware hint + default preset
    this.autoPresetFromTime();
    this.refreshRestaurants();
  },

  async refreshRestaurants() {
    UI.setLoading(true);

    try {
      const restaurants = await API.fetchRestaurants(this.currentLat, this.currentLng, { preset: UI.preset });
      this.restaurantById.clear();
      restaurants.forEach(r => this.restaurantById.set(r.id, r));

      UI.setRestaurants(restaurants);

      // preload route times for top 5 in client dinner mode (keeps UI snappy)
      if (UI.preset === "client_dinner") {
        const top = [...restaurants].sort((a,b) => (b.clientScore||0)-(a.clientScore||0)).slice(0, 5);
        top.forEach(r => this.ensureRouteTimes(r.id).then(() => UI.renderCardPartial(r.id)));
      }
    } finally {
      UI.setLoading(false);
    }
  },

  getRestaurantById(id) {
    return this.restaurantById.get(id) || null;
  },

  async ensureRouteTimes(id) {
    const r = this.getRestaurantById(id);
    if (!r) return;
    if (r.routeTimes && (r.routeTimes.walkSec || r.routeTimes.driveSec)) return;

    const origin = { lat: this.currentLat, lng: this.currentLng };
    const dest = { lat: r.coordinates.latitude, lng: r.coordinates.longitude };

    const times = await Routing.getTimes(origin, dest);

    const updated = { ...r, routeTimes: times };
    this.restaurantById.set(id, updated);

    // Also update UI list memory
    UI.all = UI.all.map(x => x.id === id ? updated : x);
    UI.filtered = UI.filtered.map(x => x.id === id ? updated : x);
  },

  downloadCalendarForRestaurant(id) {
    const r = this.getRestaurantById(id);
    if (!r) return;

    const start = API.nextMealTime(new Date());
    const location = r.location
      ? [r.location.address1, r.location.city, r.location.state, r.location.zip_code].filter(Boolean).join(", ")
      : (r.formatted_address || "");

    const note = r.note ? `Notes: ${r.note}\n\n` : "";
    const desc = `${note}Client Score: ${r.clientScore ?? "—"}\nMaps: ${r.url || ""}`;

    const ics = API.makeIcs({
      title: `${r.name} (OnTheGo)`,
      location: location || r.name,
      start,
      durationMin: 90,
      description: desc
    });

    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `OnTheGo-${r.name.replace(/[^\w\-]+/g, "_")}.ics`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    UI.toast("Calendar event downloaded (.ics)");
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
      badge.innerHTML = `<i class="fas fa-database"></i> Google Places + Routes`;
      badge.style.background = "rgba(34,197,94,0.18)";
      badge.style.borderColor = "rgba(34,197,94,0.35)";
    } else {
      badge.innerHTML = `<i class="fas fa-flask"></i> Demo Data`;
      badge.style.background = "rgba(245,158,11,0.18)";
      badge.style.borderColor = "rgba(245,158,11,0.35)";
    }
  },

  // ===== Notes + Share =====
  async shareShortlist() {
    const shortlist = Storage.get(CONFIG.STORAGE_KEYS.SHORTLIST, {});
    const notes = Storage.get(CONFIG.STORAGE_KEYS.NOTES, {});
    const ids = Object.entries(shortlist).filter(([,v]) => v).map(([id]) => id);

    if (!ids.length) {
      UI.toast("No shortlist yet — star a few places first.");
      return;
    }

    const payload = {
      v: 1,
      createdAt: new Date().toISOString(),
      center: { lat: this.currentLat, lng: this.currentLng, label: this.currentLabel },
      preset: UI.preset,
      items: ids.map(id => ({ id, note: notes[id] || "" }))
    };

    const json = JSON.stringify(payload);
    const b64 = btoa(unescape(encodeURIComponent(json)))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
    const url = `${location.origin}${location.pathname}#otg=${b64}`;

    try {
      await navigator.clipboard.writeText(url);
      UI.toast("Share link copied to clipboard ✅");
    } catch {
      // fallback: prompt
      window.prompt("Copy your share link:", url);
    }
  },

  maybeImportSharedListFromHash() {
    const h = location.hash || "";
    const m = h.match(/#otg=([A-Za-z0-9\-_]+)/);
    if (!m) return;

    try {
      const b64 = m[1].replace(/-/g, "+").replace(/_/g, "/");
      const pad = b64.length % 4 ? "=".repeat(4 - (b64.length % 4)) : "";
      const json = decodeURIComponent(escape(atob(b64 + pad)));
      const payload = JSON.parse(json);

      if (!payload?.items?.length || !payload?.center) return;

      // apply shortlist + notes
      const shortlist = Storage.get(CONFIG.STORAGE_KEYS.SHORTLIST, {});
      const notes = Storage.get(CONFIG.STORAGE_KEYS.NOTES, {});
      payload.items.forEach(it => {
        shortlist[it.id] = true;
        if (it.note) notes[it.id] = it.note;
      });
      Storage.set(CONFIG.STORAGE_KEYS.SHORTLIST, shortlist);
      Storage.set(CONFIG.STORAGE_KEYS.NOTES, notes);

      // go to shared location + preset
      if (payload.preset) {
        UI.preset = payload.preset;
        this.syncChipUI(UI.preset);
      }

      this.showView("local");
      MapModule.setSearchCenter(payload.center.lat, payload.center.lng, payload.center.label || "Shared Location");

      // clean hash so link isn't re-imported repeatedly
      history.replaceState(null, "", location.pathname);

      UI.toast("Imported shared shortlist ✔️");
    } catch (e) {
      console.warn("Share import failed", e);
    }
  },

  // ===== Travel Log =====
  renderTravelLog() {
    const visited = Storage.get(CONFIG.STORAGE_KEYS.VISITED, {});
    const notes = Storage.get(CONFIG.STORAGE_KEYS.NOTES, {});
    const shortlist = Storage.get(CONFIG.STORAGE_KEYS.SHORTLIST, {});

    const visitedCount = Object.values(visited).filter(Boolean).length;
    const noteCount = Object.values(notes).filter(v => (v || "").trim().length).length;
    const shortlistCount = Object.values(shortlist).filter(Boolean).length;

    const trips = this.getTrips();
    const cities = new Set(trips.map(t => `${t.city}, ${t.state}`));

    document.getElementById("travelLogStats").innerHTML = `
      <div class="stat"><div class="n">${shortlistCount}</div><div class="l">Shortlisted</div></div>
      <div class="stat"><div class="n">${noteCount}</div><div class="l">Notes</div></div>
      <div class="stat"><div class="n">${visitedCount}</div><div class="l">Visited</div></div>
      <div class="stat"><div class="n">${trips.length}</div><div class="l">Trips saved</div></div>
      <div class="stat"><div class="n">${cities.size}</div><div class="l">Cities</div></div>
    `;

    const shortlistIds = Object.entries(shortlist).filter(([,v]) => v).map(([id]) => id);

    const listHtml = shortlistIds.length
      ? shortlistIds.map(id => {
          const note = notes[id] || "";
          return `<div style="margin-top:10px; padding:10px; border:1px solid rgba(255,255,255,0.10); border-radius:12px; background: rgba(0,0,0,0.12)">
            <div style="font-weight:1100">${id}</div>
            ${note ? `<div style="color:rgba(238,242,255,0.75); margin-top:6px">${note.replace(/</g,"&lt;")}</div>` : `<div style="color:rgba(238,242,255,0.6); margin-top:6px">No note</div>`}
          </div>`;
        }).join("")
      : `<div style="color:rgba(238,242,255,0.75)">No shortlist yet. Star restaurants to build a shareable list.</div>`;

    document.getElementById("travelLogContent").innerHTML = `
      <div class="travel-log-entry">
        <div style="font-weight:1100"><i class="fas fa-star"></i> Shortlist</div>
        ${listHtml}
        <div style="margin-top:12px;">
          <button class="mini-btn" type="button" onclick="App.shareShortlist()"><i class="fas fa-share-nodes"></i> Share shortlist</button>
        </div>
      </div>

      <div class="travel-log-entry">
        <div style="font-weight:1100; margin-bottom:8px;"><i class="fas fa-plane"></i> Trips</div>
        ${trips.map(t => `
          <div style="margin-top:8px; color:rgba(238,242,255,0.85)">
            <strong>${t.hotel}</strong> — ${t.city}, ${t.state} • ${t.startDate} → ${t.endDate}
          </div>
        `).join("")}
      </div>
    `;
  }
};

window.addEventListener("DOMContentLoaded", () => App.init());
