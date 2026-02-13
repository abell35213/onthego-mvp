const UI = {
  all: [],
  filtered: [],
  restaurants: [],
  preset: "client_dinner",
  collapsedSidebar: false,
  _noteTargetId: null,
  _searchDebounceTimer: null,

  init() {
    // Sidebar collapse
    document.getElementById("sidebarToggleBtn").addEventListener("click", () => {
      const sidebar = document.getElementById("searchSidebar");
      this.collapsedSidebar = !this.collapsedSidebar;
      sidebar.style.width = this.collapsedSidebar ? "0px" : "";
      sidebar.style.minWidth = this.collapsedSidebar ? "0px" : "";
      sidebar.style.overflow = this.collapsedSidebar ? "hidden" : "";
    });

    // Resize handle
    const handle = document.getElementById("sidebarResizeHandle");
    let dragging = false, startX = 0, startW = 0;
    handle.addEventListener("mousedown", (e) => {
      dragging = true;
      startX = e.clientX;
      startW = document.getElementById("searchSidebar").offsetWidth;
      document.body.style.userSelect = "none";
    });
    window.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const w = Math.min(720, Math.max(320, startW + dx));
      document.getElementById("searchSidebar").style.width = `${w}px`;
    });
    window.addEventListener("mouseup", () => {
      dragging = false;
      document.body.style.userSelect = "";
    });

    // Filters
    const rerender = () => this.applyFilters();
    const searchInput = document.getElementById("searchInput");
    if (searchInput) {
      searchInput.addEventListener("input", () => {
        clearTimeout(this._searchDebounceTimer);
        this._searchDebounceTimer = setTimeout(() => {
          this.applyFilters();
        }, 120);
      });
    }
    ["cuisineFilter","priceFilter","ambianceFilter","sortBy","visitedFilter","openNowFilter"]
      .forEach(id => {
        const el = document.getElementById(id);
        el.addEventListener("change", rerender);
      });

    // Quick chips
    document.querySelectorAll("#quickChips .chip").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#quickChips .chip").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        this.preset = btn.dataset.preset;
        App.showTimeHintForPreset(this.preset, false);
        App.refreshRestaurants();
      });
    });

    // Shortlist bar
    document.getElementById("shortlistShareBtn").addEventListener("click", () => App.shareShortlist());
    document.getElementById("shortlistClearBtn").addEventListener("click", () => {
      Storage.set(CONFIG.STORAGE_KEYS.SHORTLIST, {});
      this.all = this.all.map(r => ({ ...r, shortlisted: false }));
      this.applyFilters();
      App.renderTravelLog();
      UI.toast("Shortlist cleared");
    });

    // Notes modal
    const noteModal = document.getElementById("noteModal");
    document.getElementById("noteModalClose").addEventListener("click", () => noteModal.style.display = "none");
    window.addEventListener("click", (e) => { if (e.target === noteModal) noteModal.style.display = "none"; });

    document.getElementById("saveNoteBtn").addEventListener("click", () => {
      if (!this._noteTargetId) return;
      const notes = Storage.get(CONFIG.STORAGE_KEYS.NOTES, {});
      notes[this._noteTargetId] = document.getElementById("noteTextarea").value || "";
      Storage.set(CONFIG.STORAGE_KEYS.NOTES, notes);
      this._flash("noteSavedMsg");
      this._applyNoteToLocal(this._noteTargetId, notes[this._noteTargetId]);
      this.applyFilters();
      App.renderTravelLog();
    });

    document.getElementById("toggleShortlistBtn").addEventListener("click", () => {
      if (!this._noteTargetId) return;
      this.toggleShortlist(this._noteTargetId);
      this.syncNoteModalButtons(this._noteTargetId);
    });

    document.getElementById("calendarBtn").addEventListener("click", () => {
      if (!this._noteTargetId) return;
      App.downloadCalendarForRestaurant(this._noteTargetId);
    });
  },

  setLoading(isLoading) {
    document.getElementById("loadingState").style.display = isLoading ? "block" : "none";
  },

  setRestaurants(restaurants) {
    this.all = restaurants;
    this._populateCuisineFilter(this.all);
    this.applyFilters();
    if (window.ConciergeDrawer) {
      ConciergeDrawer.onRestaurantsUpdated(this.restaurants);
    }
    this.updateShortlistBar();
  },

  updateShortlistBar() {
    const shortlist = Storage.get(CONFIG.STORAGE_KEYS.SHORTLIST, {});
    const count = Object.values(shortlist).filter(Boolean).length;
    const bar = document.getElementById("shortlistBar");
    const n = document.getElementById("shortlistCount");
    n.textContent = String(count);
    bar.style.display = count > 0 ? "flex" : "none";
  },

  applyFilters() {
    const q = (document.getElementById("searchInput").value || "").trim().toLowerCase();
    const cuisine = document.getElementById("cuisineFilter").value;
    const price = document.getElementById("priceFilter").value;
    const ambiance = document.getElementById("ambianceFilter").value;
    const sortBy = document.getElementById("sortBy").value;
    const visitedOnly = document.getElementById("visitedFilter").checked;
    const openNowOnly = document.getElementById("openNowFilter").checked;

    let out = [...this.all];

    if (q) {
      out = out.filter(r => {
        const hay = [
          r.name,
          (r.categories || []).map(c => c.title).join(" "),
          r.location?.city,
          r.location?.state,
          r.location?.zip_code
        ].filter(Boolean).join(" ").toLowerCase();
        return hay.includes(q);
      });
    }

    if (cuisine) out = out.filter(r => (r.categories || []).some(c => c.title === cuisine));
    if (price) out = out.filter(r => (r.price || "") === price);
    if (ambiance) out = out.filter(r => (r.tags || []).includes(ambiance));
    if (visitedOnly) out = out.filter(r => !!r.visited);
    if (openNowOnly) out = out.filter(r => r.open_now === true);

    this.sortRestaurants(out, sortBy);

    // If in “client dinner” mode, bias by client score even if user didn't select
    if (this.preset === "client_dinner" && sortBy !== "client_score") {
      out.sort((a,b) => (b.clientScore || 0) - (a.clientScore || 0));
    }

    this.filtered = out;
    this.restaurants = out;
    this.renderList(out);
    MapModule.addRestaurantMarkers(out);
    if (window.ConciergeDrawer) {
      ConciergeDrawer.onRestaurantsUpdated(this.restaurants);
    }
    this.updateShortlistBar();
  },

  sortRestaurants(restaurants, sortBy) {
    const plan = (window.DinnerPlan && window.DinnerPlan.state) ? window.DinnerPlan.state : null;

    const score = (r) => {
      let s = (Number(r.rating) || 0) * 10;
      const dist = Number(r.distance) || 999999;
      s += Math.max(0, 20 - dist / 250);

      if (plan) {
        const price = (r.price || "").length;
        if (plan.budget === "low") s += price <= 2 ? 8 : -4;
        if (plan.budget === "mid") s += price === 2 ? 8 : -2;
        if (plan.budget === "high") s += price >= 3 ? 8 : -1;

        const cats = (r.categories || []).map((c) => (c.title || "").toLowerCase()).join(" ");
        const tags = (r.tags || []).join(" ").toLowerCase();
        const hay = `${cats} ${tags} ${(r.name || "").toLowerCase()}`;

        if (plan.vibe === "business") s += hay.includes("steak") || hay.includes("wine") ? 4 : 0;
        if (plan.vibe === "quiet") s += hay.includes("bistro") || hay.includes("sushi") ? 3 : 0;
        if (plan.vibe === "lively") s += hay.includes("bar") || hay.includes("tapas") ? 3 : 0;
        if (plan.vibe === "solo") s += hay.includes("ramen") || hay.includes("counter") ? 3 : 0;
        if (plan.vibe === "celebratory") s += hay.includes("cocktail") ? 3 : 0;

        if (r.visited) s += 1;
      }

      return s;
    };

    switch (sortBy) {
      case "client_score":
        restaurants.sort((a, b) => (b.clientScore || 0) - (a.clientScore || 0));
        break;
      case "distance":
        restaurants.sort((a, b) => (a.distance || 0) - (b.distance || 0));
        break;
      case "review_count":
        restaurants.sort((a, b) => (b.review_count || 0) - (a.review_count || 0));
        break;
      case "rating":
      default:
        restaurants.sort((a, b) => score(b) - score(a));
        break;
    }
  },

  renderList(restaurants) {
    const list = document.getElementById("restaurantList");
    const empty = document.getElementById("emptyState");

    [...list.querySelectorAll(".restaurant-card")].forEach(el => el.remove());

    if (!restaurants.length) {
      empty.style.display = "block";
      return;
    }
    empty.style.display = "none";

    restaurants.forEach(r => {
      const card = document.createElement("div");
      card.className = "restaurant-card";
      card.dataset.id = r.id;

      const cats = (r.categories || []).map(c => c.title).join(", ");
      const stars = API.getStarRating(r.rating);
      const openBadge =
        r.open_now === true ? `<span class="badge open"><i class="fas fa-door-open"></i> Open</span>` :
        r.open_now === false ? `<span class="badge closed"><i class="fas fa-door-closed"></i> Closed</span>` :
        `<span class="badge warn"><i class="fas fa-clock"></i> Hours?</span>`;

      const tags = (r.tags || []).slice(0, 4).map(t => {
        const cls = t === "Good for Business Meal" ? "business" : t === "Chill" ? "chill" : t === "Fun" ? "fun" : t === "Local Spots" ? "local" : "";
        return `<span class="tag-badge ${cls}">${t}</span>`;
      }).join("");

      const mapsLink = r.url || `https://www.google.com/maps/search/${encodeURIComponent(r.name)}`;
      const reserveLink = r.reservable ? (r.website || API.getReservationLinks(r.name, r.location?.city).opentable) : "";
      const website = r.website || "";

      const rt = r.routeTimes;
      const walk = rt?.walkSec ? Routing.formatDuration(rt.walkSec) : "";
      const drive = rt?.driveSec ? Routing.formatDuration(rt.driveSec) : "";
      const routeLine = (walk || drive)
        ? `${walk ? `🚶 ${walk}` : ""}${walk && drive ? " · " : ""}${drive ? `🚗 ${drive}` : ""}`
        : "Route times: click to load";

      const noteHas = !!(r.note && r.note.trim().length);

      card.innerHTML = `
        <div class="card-float-actions">
          <button class="icon-pill ${r.shortlisted ? "active" : ""}" type="button" data-star="${r.id}">
            <i class="fas fa-star"></i>
          </button>
          <button class="icon-pill note ${noteHas ? "hasnote" : ""}" type="button" data-note="${r.id}">
            <i class="fas fa-note-sticky"></i>
          </button>
        </div>

        <img class="restaurant-image" src="${r.image_url || ""}" alt="" onerror="this.style.display='none'" />
        <div class="restaurant-main">
          <h3 class="restaurant-name">${r.name}</h3>

          <div class="restaurant-meta">
            ${openBadge}
            ${r.price ? `<span class="badge"><i class="fas fa-dollar-sign"></i> ${r.price}</span>` : ""}
            ${Number.isFinite(r.distance) ? `<span class="badge"><i class="fas fa-walking"></i> ${API.formatDistance(r.distance)}</span>` : ""}
            ${cats ? `<span class="badge"><i class="fas fa-utensils"></i> ${cats}</span>` : ""}
            <span class="badge score"><i class="fas fa-briefcase"></i> Score ${r.clientScore ?? "—"}</span>
          </div>

          <div class="rating-row">
            <span class="stars">${stars}</span>
            <span style="font-weight:1000">${Number(r.rating || 0).toFixed(1)}</span>
            <span class="review-count">(${r.review_count || 0})</span>
            ${r.visited ? `<span class="badge open"><i class="fas fa-check"></i> Visited</span>` : ""}
          </div>

          <div class="small-row">${routeLine}</div>

          ${tags ? `<div class="tags">${tags}</div>` : ""}

          <div class="restaurant-actions">
            <a class="action-link primary" href="${mapsLink}" target="_blank" rel="noopener noreferrer">
              <i class="fas fa-map"></i> Maps
            </a>

            ${website ? `
              <a class="action-link" href="${website}" target="_blank" rel="noopener noreferrer">
                <i class="fas fa-globe"></i> Website
              </a>` : ""}

            ${reserveLink ? `
              <a class="action-link" href="${reserveLink}" target="_blank" rel="noopener noreferrer">
                <i class="fas fa-calendar-check"></i> Reserve
              </a>` : ""}

            <button class="action-link" type="button" data-cal="${r.id}">
              <i class="fas fa-calendar-plus"></i> Calendar
            </button>
          </div>

          <button class="visit-toggle ${r.visited ? "visited" : ""}" type="button" data-visit="${r.id}">
            <i class="fas ${r.visited ? "fa-check" : "fa-bookmark"}"></i>
            ${r.visited ? "Visited" : "Mark Visited"}
          </button>
        </div>
      `;

      // Card click opens popup + loads route times
      card.addEventListener("click", async (e) => {
        if (e.target.closest("a") || e.target.closest("button")) return;
        if (window.ConciergeDrawer) ConciergeDrawer.onFocusedRestaurant(r);
        MapModule.openMarkerPopup(r.id);
        await App.ensureRouteTimes(r.id);
        this.renderCardPartial(r.id);
      });

      // Star
      card.querySelector(`[data-star="${r.id}"]`).addEventListener("click", (e) => {
        e.stopPropagation();
        this.toggleShortlist(r.id);
      });

      // Note
      card.querySelector(`[data-note="${r.id}"]`).addEventListener("click", (e) => {
        e.stopPropagation();
        this.openNoteModal(r.id);
      });

      // Visit
      card.querySelector(`[data-visit="${r.id}"]`).addEventListener("click", (e) => {
        e.stopPropagation();
        this.toggleVisited(r.id);
      });

      // Calendar
      card.querySelector(`[data-cal="${r.id}"]`).addEventListener("click", (e) => {
        e.stopPropagation();
        App.downloadCalendarForRestaurant(r.id);
      });

      list.appendChild(card);
    });
  },

  renderCardPartial(id) {
    // lightweight refresh: update route line in the existing DOM card
    const r = App.getRestaurantById(id);
    const card = document.querySelector(`.restaurant-card[data-id="${id}"]`);
    if (!r || !card) return;

    const rt = r.routeTimes;
    const walk = rt?.walkSec ? Routing.formatDuration(rt.walkSec) : "";
    const drive = rt?.driveSec ? Routing.formatDuration(rt.driveSec) : "";
    const routeLine = (walk || drive)
      ? `${walk ? `🚶 ${walk}` : ""}${walk && drive ? " · " : ""}${drive ? `🚗 ${drive}` : ""}`
      : "Route times unavailable";

    const row = card.querySelector(".small-row");
    if (row) row.textContent = routeLine;
  },

  highlightRestaurantCard(id) {
    const el = document.querySelector(`.restaurant-card[data-id="${id}"]`);
    if (!el) return;
    document.querySelectorAll(".restaurant-card").forEach(c => c.classList.remove("highlight"));
    el.classList.add("highlight");
    el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  },

  toggleVisited(id) {
    const visited = Storage.get(CONFIG.STORAGE_KEYS.VISITED, {});
    visited[id] = !visited[id];
    Storage.set(CONFIG.STORAGE_KEYS.VISITED, visited);

    this.all = this.all.map(r => r.id === id ? { ...r, visited: !!visited[id] } : r);
    this.applyFilters();
    App.renderTravelLog();
  },

  toggleShortlist(id) {
    const shortlist = Storage.get(CONFIG.STORAGE_KEYS.SHORTLIST, {});
    shortlist[id] = !shortlist[id];
    Storage.set(CONFIG.STORAGE_KEYS.SHORTLIST, shortlist);

    this.all = this.all.map(r => r.id === id ? { ...r, shortlisted: !!shortlist[id] } : r);
    this.applyFilters();
    App.renderTravelLog();
  },

  openNoteModal(id) {
    const r = App.getRestaurantById(id);
    if (!r) return;

    this._noteTargetId = id;

    const modal = document.getElementById("noteModal");
    document.getElementById("noteModalSubtitle").textContent = `${r.name} • Score ${r.clientScore ?? "—"}`;
    document.getElementById("noteTextarea").value = r.note || "";

    this.syncNoteModalButtons(id);
    modal.style.display = "block";
  },

  syncNoteModalButtons(id) {
    const shortlist = Storage.get(CONFIG.STORAGE_KEYS.SHORTLIST, {});
    const isShort = !!shortlist[id];
    const btn = document.getElementById("toggleShortlistBtn");
    btn.innerHTML = isShort
      ? `<i class="fas fa-star"></i> Remove from Shortlist`
      : `<i class="fas fa-star"></i> Add to Shortlist`;
  },

  _applyNoteToLocal(id, note) {
    this.all = this.all.map(r => r.id === id ? { ...r, note } : r);
  },

  _populateCuisineFilter(restaurants) {
    const set = new Set();
    restaurants.forEach(r => (r.categories || []).forEach(c => set.add(c.title)));
    const cuisines = [...set].sort((a,b) => a.localeCompare(b));

    const select = document.getElementById("cuisineFilter");
    const current = select.value;
    select.innerHTML = `<option value="">All Cuisines</option>` + cuisines.map(c => `<option value="${c}">${c}</option>`).join("");
    select.value = cuisines.includes(current) ? current : "";
  },

  _flash(id) {
    const el = document.getElementById(id);
    el.style.display = "block";
    setTimeout(() => (el.style.display = "none"), 1400);
  },

  toast(message) {
    const el = document.getElementById("toast");
    el.textContent = message;
    el.style.display = "block";
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => (el.style.display = "none"), 2200);
  }
};
