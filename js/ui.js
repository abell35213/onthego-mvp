const UI = {
  all: [],
  filtered: [],
  preset: "client_dinner",
  collapsedSidebar: false,

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
    let dragging = false;
    let startX = 0;
    let startW = 0;
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

    // Inputs
    const searchInput = document.getElementById("searchInput");
    const cuisineFilter = document.getElementById("cuisineFilter");
    const priceFilter = document.getElementById("priceFilter");
    const ambianceFilter = document.getElementById("ambianceFilter");
    const sortBy = document.getElementById("sortBy");
    const visitedFilter = document.getElementById("visitedFilter");
    const openNowFilter = document.getElementById("openNowFilter");

    const rerender = () => this.applyFilters();
    ["input", "change"].forEach(evt => {
      searchInput.addEventListener(evt, rerender);
      cuisineFilter.addEventListener(evt, rerender);
      priceFilter.addEventListener(evt, rerender);
      ambianceFilter.addEventListener(evt, rerender);
      sortBy.addEventListener(evt, rerender);
      visitedFilter.addEventListener(evt, rerender);
      openNowFilter.addEventListener(evt, rerender);
    });

    // Quick chips
    document.querySelectorAll("#quickChips .chip").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#quickChips .chip").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        this.preset = btn.dataset.preset;
        App.refreshRestaurants();
      });
    });
  },

  setLoading(isLoading) {
    document.getElementById("loadingState").style.display = isLoading ? "block" : "none";
  },

  setRestaurants(restaurants) {
    this.all = restaurants.map(r => this._hydrateVisited(r));
    this._populateCuisineFilter(this.all);
    this.applyFilters();
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

    if (cuisine) {
      out = out.filter(r => (r.categories || []).some(c => c.title === cuisine));
    }

    if (price) out = out.filter(r => (r.price || "") === price);
    if (ambiance) out = out.filter(r => (r.tags || []).includes(ambiance));
    if (visitedOnly) out = out.filter(r => !!r.visited);
    if (openNowOnly) out = out.filter(r => r.open_now === true);

    if (sortBy === "rating") out.sort((a,b) => (b.rating || 0) - (a.rating || 0));
    if (sortBy === "distance") out.sort((a,b) => (a.distance || 0) - (b.distance || 0));
    if (sortBy === "review_count") out.sort((a,b) => (b.review_count || 0) - (a.review_count || 0));

    this.filtered = out;
    this.renderList(out);
    MapModule.addRestaurantMarkers(out);
  },

  renderList(restaurants) {
    const list = document.getElementById("restaurantList");
    const empty = document.getElementById("emptyState");

    // Remove old cards (keep loading + empty)
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

      card.innerHTML = `
        <img class="restaurant-image" src="${r.image_url || ""}" alt="" onerror="this.style.display='none'" />
        <div class="restaurant-main">
          <h3 class="restaurant-name">${r.name}</h3>
          <div class="restaurant-meta">
            ${openBadge}
            ${r.price ? `<span class="badge"><i class="fas fa-dollar-sign"></i> ${r.price}</span>` : ""}
            ${Number.isFinite(r.distance) ? `<span class="badge"><i class="fas fa-walking"></i> ${API.formatDistance(r.distance)}</span>` : ""}
            ${cats ? `<span class="badge"><i class="fas fa-utensils"></i> ${cats}</span>` : ""}
          </div>

          <div class="rating-row">
            <span class="stars">${stars}</span>
            <span style="font-weight:900">${Number(r.rating || 0).toFixed(1)}</span>
            <span class="review-count">(${r.review_count || 0})</span>
            ${r.visited ? `<span class="badge open"><i class="fas fa-check"></i> Visited</span>` : ""}
          </div>

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
          </div>

          <button class="visit-toggle ${r.visited ? "visited" : ""}" type="button">
            <i class="fas ${r.visited ? "fa-check" : "fa-bookmark"}"></i>
            ${r.visited ? "Visited" : "Mark Visited"}
          </button>
        </div>
      `;

      card.addEventListener("click", (e) => {
        // prevent action links toggling popup behavior
        if (e.target.closest("a") || e.target.closest("button.visit-toggle")) return;
        MapModule.openMarkerPopup(r.id);
      });

      card.querySelector(".visit-toggle").addEventListener("click", (e) => {
        e.stopPropagation();
        this.toggleVisited(r.id);
      });

      list.appendChild(card);
    });
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
    App.updateTravelLogFromVisited();
  },

  _hydrateVisited(r) {
    const visited = Storage.get(CONFIG.STORAGE_KEYS.VISITED, {});
    return { ...r, visited: !!visited[r.id] };
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

  toast(message) {
    const el = document.getElementById("toast");
    el.textContent = message;
    el.style.display = "block";
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => (el.style.display = "none"), 2200);
  }
};
