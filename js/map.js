const MapModule = {
  map: null,
  markersById: new Map(),
  userMarker: null,
  userLocation: null,
  searchAreaBtn: null,
  walkCircle: null,
  _walkCircleMetersPerMinute: 80,

  init() {
    if (typeof L === "undefined") return;

    this.map = L.map("map").setView([CONFIG.DEFAULT_LAT, CONFIG.DEFAULT_LNG], CONFIG.DEFAULT_ZOOM);

    L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: 19 }
    ).addTo(this.map);

    this.addSearchAreaButton();
    this.addLocateMeButton();
    this.bindDinnerPlanReactivity();

    this.map.on("moveend", () => {
      if (this.searchAreaBtn) this.searchAreaBtn.style.display = "block";
    });
  },

  addSearchAreaButton() {
    const self = this;
    const SearchAreaControl = L.Control.extend({
      options: { position: "topright" },
      onAdd() {
        const btn = L.DomUtil.create("button", "search-area-btn");
        btn.innerHTML = '<i class="fas fa-search-location"></i> Search This Area';
        btn.style.display = "none";
        btn.onclick = (e) => {
          L.DomEvent.stopPropagation(e);
          self.searchCurrentArea();
          btn.style.display = "none";
        };
        L.DomEvent.disableClickPropagation(btn);
        self.searchAreaBtn = btn;
        return btn;
      }
    });
    this.map.addControl(new SearchAreaControl());
  },

  async searchCurrentArea() {
    const c = this.map.getCenter();
    this.setSearchCenter(c.lat, c.lng, "Map Center");
  },

  setSearchCenter(lat, lng, label = "Search Center") {
    const latitude = Number(lat);
    const longitude = Number(lng);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

    this.userLocation = { lat: latitude, lng: longitude };

    this.map.setView([latitude, longitude], CONFIG.DEFAULT_ZOOM);

    if (this.userMarker) {
      try { this.map.removeLayer(this.userMarker); } catch {}
    }

    const userIcon = L.icon({
      iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png",
      shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41]
    });

    this.userMarker = L.marker([latitude, longitude], { icon: userIcon })
      .addTo(this.map)
      .bindPopup(`<strong>${label}</strong>`)
      .openPopup();

    this.updateWalkCircleFromPlan((window.DinnerPlan || (typeof DinnerPlan !== "undefined" ? DinnerPlan : null))?.state);
    window.App?.onLocationReady?.(latitude, longitude, label);
  },

  requestUserLocation() {
    if (!("geolocation" in navigator)) {
      UI.toast("Geolocation not supported — using default.");
      this.setSearchCenter(CONFIG.DEFAULT_LAT, CONFIG.DEFAULT_LNG, "Default");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => this.setSearchCenter(pos.coords.latitude, pos.coords.longitude, "My Location"),
      () => {
        UI.toast("Could not get location — using default.");
        this.setSearchCenter(CONFIG.DEFAULT_LAT, CONFIG.DEFAULT_LNG, "Default");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  },

  addLocateMeButton() {
    if (!this.map || typeof L === "undefined") return;

    const LocateControl = L.Control.extend({
      options: { position: "topright" },
      onAdd: () => {
        const container = L.DomUtil.create("div", "map-locate-control");
        container.innerHTML = `
          <button class="locate-me-btn" title="Use my current location">
            <i class="fas fa-location-arrow"></i>
          </button>
        `;

        const btn = container.querySelector(".locate-me-btn");
        btn.addEventListener("click", (e) => {
          L.DomEvent.stopPropagation(e);
          this.requestUserLocation();
        });

        L.DomEvent.disableClickPropagation(container);
        return container;
      }
    });

    this.map.addControl(new LocateControl());
  },

  bindDinnerPlanReactivity() {
    const planStore = window.DinnerPlan || (typeof DinnerPlan !== "undefined" ? DinnerPlan : null);
    if (!planStore || typeof planStore.subscribe !== "function") return;

    this.updateWalkCircleFromPlan(planStore.state);
    planStore.subscribe((plan) => {
      this.updateWalkCircleFromPlan(plan);
    });
  },

  updateWalkCircleFromPlan(plan) {
    if (!this.map || typeof L === "undefined") return;
    if (!plan) return;

    const center = this.userLocation || (this.map ? this.map.getCenter() : null);
    if (!center) return;

    const lat = center.lat ?? center.latitude;
    const lng = center.lng ?? center.longitude;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const minutes = Number(plan.walkMinutes || 15);
    const radiusMeters = Math.max(250, minutes * this._walkCircleMetersPerMinute);

    if (this.walkCircle) {
      try { this.map.removeLayer(this.walkCircle); } catch {}
      this.walkCircle = null;
    }

    this.walkCircle = L.circle([lat, lng], {
      radius: radiusMeters,
      color: "#FF6B35",
      weight: 2,
      opacity: 0.7,
      fillColor: "#FF6B35",
      fillOpacity: 0.08,
      dashArray: "6 6"
    }).addTo(this.map);
  },

  clearMarkers() {
    for (const marker of this.markersById.values()) {
      try { this.map.removeLayer(marker); } catch {}
    }
    this.markersById.clear();
  },

  addRestaurantMarkers(restaurants) {
    this.clearMarkers();

    restaurants.forEach((r) => {
      const lat = r.coordinates?.latitude;
      const lng = r.coordinates?.longitude;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      const icon = L.icon({
        iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png",
        shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41]
      });

      const marker = L.marker([lat, lng], { icon })
        .addTo(this.map)
        .bindPopup(this.createPopupContent(r), { maxWidth: 380, minWidth: 300 });

      marker.on("click", () => UI.highlightRestaurantCard(r.id));

      marker.on("popupopen", async (e) => {
        // attach calendar action
        const el = e.popup.getElement();
        const cal = el?.querySelector(`[data-ics="${r.id}"]`);
        if (cal) {
          cal.addEventListener("click", (ev) => {
            ev.preventDefault();
            App.downloadCalendarForRestaurant(r.id);
          }, { once: true });
        }

        // load route times on demand
        await App.ensureRouteTimes(r.id);
        // update popup HTML after times load
        const updated = App.getRestaurantById(r.id);
        if (updated) marker.setPopupContent(this.createPopupContent(updated));
      });

      this.markersById.set(r.id, marker);
    });

    const layers = [...this.markersById.values()];
    if (this.userMarker) layers.push(this.userMarker);
    if (layers.length) {
      const group = L.featureGroup(layers);
      this.map.fitBounds(group.getBounds().pad(0.12));
    }
  },

  openMarkerPopup(id) {
    const marker = this.markersById.get(id);
    if (!marker) return;
    this.map.invalidateSize();
    marker.openPopup();
    const ll = marker.getLatLng();
    this.map.setView(ll, 16, { animate: true, duration: 0.4 });
  },

  createPopupContent(r) {
    const categories = (r.categories || []).map(c => c.title).join(", ");
    const stars = API.getStarRating(r.rating);
    const address = r.location ? [r.location.address1, r.location.city, r.location.state, r.location.zip_code].filter(Boolean).join(", ") : "";

    const status =
      r.open_now === true ? `<span class="badge open"><i class="fas fa-door-open"></i> Open</span>` :
      r.open_now === false ? `<span class="badge closed"><i class="fas fa-door-closed"></i> Closed</span>` :
      `<span class="badge warn"><i class="fas fa-clock"></i> Hours?</span>`;

    const mapsLink = r.url || `https://www.google.com/maps/search/${encodeURIComponent(r.name + " " + (r.location?.city || ""))}`;
    const website = r.website || "";
    const reserveLink = r.reservable ? (website || API.getReservationLinks(r.name, r.location?.city).opentable) : "";

    const rt = r.routeTimes;
    const walk = rt?.walkSec ? Routing.formatDuration(rt.walkSec) : "";
    const drive = rt?.driveSec ? Routing.formatDuration(rt.driveSec) : "";
    const routeLine = (walk || drive) ? `${walk ? `🚶 ${walk}` : ""}${walk && drive ? " · " : ""}${drive ? `🚗 ${drive}` : ""}` : "Route times: loading…";

    const social = r.social || {};
    const popupSocial = [];
    if (social.instagram) popupSocial.push(`<a class="popup-btn" target="_blank" rel="noopener noreferrer" href="https://www.instagram.com/${encodeURIComponent(social.instagram)}"><i class="fab fa-instagram"></i></a>`);
    if (social.twitter) popupSocial.push(`<a class="popup-btn" target="_blank" rel="noopener noreferrer" href="https://twitter.com/${encodeURIComponent(social.twitter)}"><i class="fab fa-twitter"></i></a>`);
    if (social.facebook) popupSocial.push(`<a class="popup-btn" target="_blank" rel="noopener noreferrer" href="https://www.facebook.com/${encodeURIComponent(social.facebook)}"><i class="fab fa-facebook"></i></a>`);

    return `
      <div class="popup-content">
        <div style="display:flex; gap:10px; align-items:flex-start;">
          <div style="flex:1; min-width:0;">
            <div style="font-weight:1100; font-size:1.05rem;">${r.name}</div>
            <div style="color:rgba(238,242,255,0.72); font-size:0.85rem;">${categories || ""}</div>

            <div style="margin-top:8px; display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
              ${status}
              ${r.price ? `<span class="badge"><i class="fas fa-dollar-sign"></i> ${r.price}</span>` : ""}
              ${Number.isFinite(r.distance) ? `<span class="badge"><i class="fas fa-walking"></i> ${API.formatDistance(r.distance)}</span>` : ""}
              <span class="badge score"><i class="fas fa-briefcase"></i> Score ${r.clientScore ?? "—"}</span>
            </div>

            <div style="margin-top:8px;">
              <span class="stars">${stars}</span>
              <span style="font-weight:1000;"> ${Number(r.rating || 0).toFixed(1)}</span>
              <span style="color:rgba(238,242,255,0.70);"> (${r.review_count || 0})</span>
            </div>

            <div style="margin-top:8px; color:rgba(238,242,255,0.72); font-size:0.85rem;">
              <i class="fas fa-map-marker-alt"></i> ${address || "Address not available"}
            </div>

            <div style="margin-top:8px; color:rgba(238,242,255,0.85); font-weight:900; font-size:0.88rem;">
              ${routeLine}
            </div>
          </div>

          ${r.image_url ? `<img src="${r.image_url}" alt="${r.name}" style="width:84px;height:84px;border-radius:14px;object-fit:cover;border:1px solid rgba(255,255,255,0.12)"/>` : ""}
        </div>

        <div class="popup-actions">
          <a class="popup-btn primary" target="_blank" rel="noopener noreferrer" href="${mapsLink}">
            <i class="fas fa-map"></i> Maps
          </a>

          ${website ? `
            <a class="popup-btn" target="_blank" rel="noopener noreferrer" href="${website}">
              <i class="fas fa-globe"></i> Website
            </a>` : ""}

          ${reserveLink ? `
            <a class="popup-btn" target="_blank" rel="noopener noreferrer" href="${reserveLink}">
              <i class="fas fa-calendar-check"></i> Reserve
            </a>` : ""}

          <a class="popup-btn" href="#" data-ics="${r.id}">
            <i class="fas fa-calendar-plus"></i> Calendar
          </a>

          ${popupSocial.join("")}
        </div>
      </div>
    `;
  }
};
