const API = {
  async fetchRestaurants(lat, lng, options = {}) {
    const settings = Storage.get(CONFIG.STORAGE_KEYS.SETTINGS, {});
    const provider = settings.provider || CONFIG.PROVIDERS.GOOGLE;

    const radius = Number(settings.radius || CONFIG.DEFAULT_RADIUS_METERS);
    const preset = options.preset || "client_dinner";

    // types preset (Google types)
    const includedTypes = this._presetToIncludedTypes(preset);

    if (provider === CONFIG.PROVIDERS.GOOGLE) {
      try {
        const res = await fetch(CONFIG.GOOGLE_PROXY.NEARBY, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            latitude: lat,
            longitude: lng,
            radius,
            maxResultCount: CONFIG.SEARCH_LIMIT,
            includedTypes
          })
        });

        if (!res.ok) throw new Error(`Places proxy error: ${res.status}`);
        const data = await res.json();
        return (data.restaurants || []).map(r => ({ ...r, provider: "google" }));
      } catch (e) {
        console.warn("Google Places failed; falling back to demo data.", e);
        UI?.toast?.("Google Places unavailable — using demo data.", "warn");
        return this._mockRestaurants(lat, lng);
      }
    }

    return this._mockRestaurants(lat, lng);
  },

  async searchHotels(textQuery, locationBias) {
    const settings = Storage.get(CONFIG.STORAGE_KEYS.SETTINGS, {});
    const provider = settings.provider || CONFIG.PROVIDERS.GOOGLE;

    if (provider !== CONFIG.PROVIDERS.GOOGLE) {
      // demo suggestion list
      return [
        {
          id: "demo_hotel",
          name: "Demo Hotel",
          address: "123 Demo St, Demo City",
          coordinates: { latitude: CONFIG.DEFAULT_LAT, longitude: CONFIG.DEFAULT_LNG },
          googleMapsUri: "https://www.google.com/maps"
        }
      ];
    }

    const res = await fetch(CONFIG.GOOGLE_PROXY.TEXT_SEARCH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        textQuery,
        includedType: "lodging",
        locationBias
      })
    });
    if (!res.ok) throw new Error(`TextSearch error: ${res.status}`);
    const data = await res.json();
    return data.hotels || [];
  },

  // ===== Helpers used across UI/Map =====
  formatDistance(meters) {
    const m = Number(meters || 0);
    if (!Number.isFinite(m)) return "";
    const miles = m / 1609.344;
    return miles < 0.1 ? `${Math.round(m)} m` : `${miles.toFixed(1)} mi`;
  },

  getStarRating(rating) {
    const r = Math.max(0, Math.min(5, Number(rating || 0)));
    const full = Math.floor(r);
    const half = r - full >= 0.5 ? 1 : 0;
    const empty = 5 - full - half;

    return (
      "★".repeat(full) +
      (half ? "½" : "") +
      "☆".repeat(empty)
    );
  },

  calculateDistance(lat1, lon1, lat2, lon2) {
    const toRad = (x) => (x * Math.PI) / 180;
    const R = 6371000;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  },

  getDeliveryLinks(name, addressOrCity) {
    const q = encodeURIComponent(`${name} ${addressOrCity || ""}`.trim());
    return {
      ubereats: `https://www.ubereats.com/search?q=${q}`,
      doordash: `https://www.doordash.com/search/store/${q}/`,
      grubhub: `https://www.grubhub.com/search?queryText=${q}`
    };
  },

  getReservationLinks(name, city) {
    const q = encodeURIComponent(`${name} ${city || ""}`.trim());
    return {
      opentable: `https://www.opentable.com/s/?term=${q}`,
      resy: `https://resy.com/cities/${encodeURIComponent((city || "all").toLowerCase())}?query=${q}`
    };
  },

  getSocialMediaLinks(name) {
    const q = encodeURIComponent(name);
    return {
      instagram: `https://www.instagram.com/explore/tags/${q.replace(/%20/g, "")}/`,
      facebook: `https://www.facebook.com/search/top?q=${q}`,
      twitter: `https://x.com/search?q=${q}&src=typed_query`
    };
  },

  // ===== Internal =====
  _presetToIncludedTypes(preset) {
    // Places type list is large; we keep a small, practical set.
    switch (preset) {
      case "coffee": return ["cafe"];
      case "drinks": return ["bar"];
      case "quick_lunch": return ["restaurant"];
      case "client_dinner":
      default:
        return ["restaurant"];
    }
  },

  _mockRestaurants(lat, lng) {
    const base = [
      { name: "The Executive Table", price: "$$$", rating: 4.6, review_count: 842, tags: ["Good for Business Meal"], open_now: true, reservable: true, categories: [{ title: "Steakhouse" }] },
      { name: "Neighborhood Noodles", price: "$$", rating: 4.4, review_count: 513, tags: ["Local Spots"], open_now: true, reservable: false, categories: [{ title: "Asian" }] },
      { name: "Rooftop Lounge", price: "$$$", rating: 4.3, review_count: 392, tags: ["Fun"], open_now: false, reservable: true, categories: [{ title: "Bar" }] },
      { name: "Garden Cafe", price: "$", rating: 4.5, review_count: 201, tags: ["Chill"], open_now: true, reservable: false, categories: [{ title: "Cafe" }] }
    ];

    // Scatter near center
    return base.map((r, i) => {
      const dLat = (Math.random() - 0.5) * 0.02;
      const dLng = (Math.random() - 0.5) * 0.02;
      const coordinates = { latitude: lat + dLat, longitude: lng + dLng };
      return {
        id: `mock_${i}_${r.name.replace(/\s+/g, "_")}`,
        ...r,
        provider: "mock",
        image_url: "",
        location: { address1: "", city: "", state: "", zip_code: "" },
        display_phone: "",
        coordinates,
        distance: this.calculateDistance(lat, lng, coordinates.latitude, coordinates.longitude),
        url: `https://www.google.com/maps/search/${encodeURIComponent(r.name)}`,
        website: ""
      };
    }).sort((a, b) => b.rating - a.rating);
  }
};
