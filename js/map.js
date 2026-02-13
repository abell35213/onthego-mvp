const MapModule = {
  map: null,
  markersById: new Map(),
  userMarker: null,
  userLocation: null,
  searchAreaBtn: null,

  init() {
    if (typeof L === "undefined") {
      console.warn("Leaflet not loaded.");
      return;
    }

    this.map = L.map("map").setView([CONFIG.DEFAULT_LAT, CONFIG.DEFAULT_LNG], CONFIG.DEFAULT_ZOOM);

    // Esri World Imagery (your original vibe)
    L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      {
        attribution:
          "Tiles © Esri — Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community",
        maxZoom: 19
      }
    ).addTo(this.map);

    this.addSearchAreaButton();

    this.map.on("moveend", () => {
      if (this.searchAreaBtn) this.searchAreaBtn.style.display = "block";
    });
  },

  addSearchAreaButton() {
    if (!this.map) return;
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
    if (!this.map) return;
    const c = this.map.getCenter();
    this.setSearchCenter(c.lat, c.lng, "Map Center");
  },

  setSearchCenter(lat, lng, label = "Search Center") {
    const latitude = Number(lat);
    const longitude = Number(lng);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

    this.userLocation = { lat: latitude, lng: longitude };

    if (this.map) this.map.setView([latitude, longitude], CONFIG.DEFAULT_ZOOM);

    if (this.userMarker && this.map) {
      try { this.map.removeLayer(this.userMarker); } catch {}
    }

    // blue marker
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

    // trigger app fetch
    window.App?.onLocationReady?.(latitude, longitude, label);
  },

  requestUserLocation() {
    if (!("geolocation" in navigator)) {
      UI.toast("Geolocation not supported — using default location.", "warn");
      this.setSearchCenter(CONFIG.DEFAULT_LAT, CONFIG.DEFAULT_LNG, "Default");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this.setSearchCenter(pos.coords.latitude, pos.coords.longitude, "My Location");
      },
      (err) => {
        console.warn("Geolocation error:", err);
        UI.toast("Could not get location — using default.", "warn");
        this.setSearchCenter(CONFIG.DEFAULT_LAT, CONFIG.DEFAULT_LNG, "Default");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  },

  clearMarkers() {
    if (!this.map) return;
    for (const marker of this.markersById.values()) {
      try { this.map.removeLayer(marker); } catch {}
    }
    this.markersById.clear();
  },

  addRestaurantMarkers(restaurants) {
    if (!this.map) return;

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
        .bindPopup(this.createPopupContent(r), { maxWidth: 360, minWidth: 280 });

      marker.on("click", () => UI.highlightRestaurantCard(r.id));

      this.markersById.set(r.id, marker);
    });

    // Fit bounds to markers + user marker
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
      `<span class="badge warn"><i class="fas fa-clock"></i> Hours unknown</span>`;

    const deliveryLinks = API.getDeliveryLinks(r.name, address);
    const reservationLinks = API.getReservationLinks(r.name, r.location?.city);

    const mapsLink = r.url || `https://www.google.com/maps/search/${encodeURIComponent(r.name + " " + (r.location?.city || ""))}`;
    const website = r.website || "";

    const reserveLink = r.reservable ? (website || reservationLinks.opentable) : "";

    return `
      <div class="popup-content">
        <div style="display:flex; gap:10px; align-items:flex-start;">
          <div style="flex:1; min-width:0;">
            <div style="font-weight:1000; font-size:1.05rem;">${r.name}</div>
            <div style="color:rgba(238,242,255,0.72); font-size:0.85rem;">${categories || ""}</div>
            <div style="margin-top:8px; display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
              ${status}
              ${r.price ? `<span class="badge"><i class="fas fa-dollar-sign"></i> ${r.price}</span>` : ""}
              ${Number.isFinite(r.distance) ? `<span class="badge"><i class="fas fa-walking"></i> ${API.formatDistance(r.distance)}</span>` : ""}
            </div>
            <div style="margin-top:8px;">
              <span class="stars">${stars}</span>
              <span style="font-weight:900;"> ${Number(r.rating || 0).toFixed(1)}</span>
              <span style="color:rgba(238,242,255,0.70);"> (${r.review_count || 0})</span>
            </div>
            <div style="margin-top:8px; color:rgba(238,242,255,0.72); font-size:0.85rem;">
              <i class="fas fa-map-marker-alt"></i> ${address || "Address not available"}
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
          <a class="popup-btn" target="_blank" rel="noopener noreferrer" href="${deliveryLinks.ubereats}">
            <i class="fas fa-hamburger"></i> Delivery
          </a>
        </div>
      </div>
    `;
  }
};
