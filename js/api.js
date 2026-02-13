const API = {
  async fetchRestaurants(lat, lng, options = {}) {
    const settings = Storage.get(CONFIG.STORAGE_KEYS.SETTINGS, {});
    const provider = settings.provider || CONFIG.PROVIDERS.GOOGLE;
    const radius = Number(settings.radius || CONFIG.DEFAULT_RADIUS_METERS);

    const preset = options.preset || "client_dinner";
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

        const out = (data.restaurants || []).map(r => ({
          ...r,
          provider: "google",
          clientScore: this.computeClientDinnerScore(r),
          routeTimes: null
        }));

        return this._hydrateUserData(out);
      } catch (e) {
        console.warn("Google Places failed; using demo data.", e);
        UI?.toast?.("Google Places unavailable — using demo data.");
        return this._hydrateUserData(this._mockRestaurants(lat, lng));
      }
    }

    return this._hydrateUserData(this._mockRestaurants(lat, lng));
  },

  async searchHotels(textQuery, locationBias) {
    const settings = Storage.get(CONFIG.STORAGE_KEYS.SETTINGS, {});
    const provider = settings.provider || CONFIG.PROVIDERS.GOOGLE;

    if (provider !== CONFIG.PROVIDERS.GOOGLE) {
      return [{
        id: "demo_hotel",
        name: "Demo Hotel",
        address: "123 Demo St, Demo City",
        coordinates: { latitude: CONFIG.DEFAULT_LAT, longitude: CONFIG.DEFAULT_LNG },
        googleMapsUri: "https://www.google.com/maps"
      }];
    }

    const res = await fetch(CONFIG.GOOGLE_PROXY.TEXT_SEARCH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ textQuery, includedType: "lodging", locationBias })
    });

    if (!res.ok) throw new Error(`TextSearch error: ${res.status}`);
    const data = await res.json();
    return data.hotels || [];
  },

  // ===== Scoring =====
  computeClientDinnerScore(r) {
    // 0-100: favors high ratings, lots of reviews, reservable, $$-$$$, not too “noisy”
    const rating = Number(r.rating || 0);
    const reviews = Number(r.review_count || 0);
    const reservable = !!r.reservable;
    const openNow = r.open_now === true;

    const price = (r.price || "");
    const priceScore =
      price === "$$" ? 12 :
      price === "$$$" ? 10 :
      price === "$" ? 6 :
      price === "$$$$" ? 6 : 8;

    const ratingScore = Math.max(0, Math.min(5, rating)) * 14; // up to 70
    const reviewScore = Math.min(18, Math.log10(1 + reviews) * 8); // ~0-18

    let bonus = 0;
    if (reservable) bonus += 6;
    if (openNow) bonus += 3;

    // “Business friendly” proxies
    if (r.goodForGroups) bonus += 3;
    if (r.dineIn) bonus += 2;

    // “Noisy” proxies
    let penalty = 0;
    if (r.liveMusic) penalty += 6;
    if (r.servesCocktails) penalty += 2;

    const raw = ratingScore + reviewScore + priceScore + bonus - penalty;
    return Math.max(0, Math.min(100, Math.round(raw)));
  },

  // ===== Calendar-aware suggestion =====
  suggestedPresetForNow(date = new Date()) {
    const hour = date.getHours();
    // local time heuristic
    if (hour >= 5 && hour < 11) return "coffee";
    if (hour >= 11 && hour < 15) return "quick_lunch";
    if (hour >= 15 && hour < 17) return "coffee";
    if (hour >= 17 && hour < 21) return "client_dinner";
    return "drinks";
  },

  nextMealTime(date = new Date()) {
    // returns a Date for “reasonable next event” (tonight 7pm / tomorrow 12pm etc)
    const d = new Date(date);
    const h = d.getHours();
    const set = (hh, mm) => { d.setHours(hh, mm, 0, 0); };

    if (h < 10) { set(12, 0); return d; }
    if (h < 15) { set(19, 0); return d; }
    if (h < 21) { set(19, 0); return d; }

    // after 9pm -> tomorrow lunch
    d.setDate(d.getDate() + 1);
    set(12, 0);
    return d;
  },

  makeIcs({ title, location, start, durationMin = 90, description = "" }) {
    const pad = (n) => String(n).padStart(2, "0");
    const toICSDate = (dt) => {
      // floating local time
      return `${dt.getFullYear()}${pad(dt.getMonth()+1)}${pad(dt.getDate())}T${pad(dt.getHours())}${pad(dt.getMinutes())}00`;
    };
    const end = new Date(start.getTime() + durationMin * 60 * 1000);

    const escape = (s) => String(s || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
    const ics =
`BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//OnTheGo//EN
CALSCALE:GREGORIAN
BEGIN:VEVENT
UID:${Date.now()}@onthego
DTSTAMP:${toICSDate(new Date())}
DTSTART:${toICSDate(start)}
DTEND:${toICSDate(end)}
SUMMARY:${escape(title)}
LOCATION:${escape(location)}
DESCRIPTION:${escape(description)}
END:VEVENT
END:VCALENDAR`;

    return ics;
  },

  // ===== Shared helpers =====
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
    return "★".repeat(full) + (half ? "½" : "") + "☆".repeat(empty);
  },

  calculateDistance(lat1, lon1, lat2, lon2) {
    const toRad = (x) => (x * Math.PI) / 180;
    const R = 6371000;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  },

  getReservationLinks(restaurantName, city) {
    const term = [restaurantName, city].filter(Boolean).join(" ");
    const encodedTerm = encodeURIComponent(term);
    return {
      opentable: `https://www.opentable.com/s?term=${encodedTerm}`,
      resy: city
        ? `https://resy.com/cities/${encodeURIComponent(city).toLowerCase()}?search=${encodeURIComponent(restaurantName)}`
        : `https://resy.com/cities/sf?search=${encodeURIComponent(restaurantName)}`
    };
  },

  async askConcierge({ plan, message }) {
    try {
      const response = await fetch("/api/concierge", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ plan, message })
      });
      if (!response.ok) throw new Error(`Concierge error: ${response.status}`);
      return await response.json();
    } catch (e) {
      return { source: "fallback", text: "Concierge is unavailable right now. Try selecting 2 restaurants and I’ll suggest a primary + backup plan." };
    }
  },

  // ===== User data hydration =====
  _hydrateUserData(restaurants) {
    const visited = Storage.get(CONFIG.STORAGE_KEYS.VISITED, {});
    const notes = Storage.get(CONFIG.STORAGE_KEYS.NOTES, {});
    const shortlist = Storage.get(CONFIG.STORAGE_KEYS.SHORTLIST, {});

    return restaurants.map(r => ({
      ...r,
      visited: !!visited[r.id],
      note: notes[r.id] || "",
      shortlisted: !!shortlist[r.id]
    }));
  },

  // ===== Internal =====
  _presetToIncludedTypes(preset) {
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
      { name: "The Executive Table", price: "$$$", rating: 4.6, review_count: 842, tags: ["Good for Business Meal"], open_now: true, reservable: true, goodForGroups: true, dineIn: true, liveMusic: false, servesCocktails: true, categories: [{ title: "Steakhouse" }] },
      { name: "Neighborhood Noodles", price: "$$", rating: 4.4, review_count: 513, tags: ["Local Spots"], open_now: true, reservable: false, goodForGroups: false, dineIn: true, liveMusic: false, servesCocktails: false, categories: [{ title: "Asian" }] },
      { name: "Rooftop Lounge", price: "$$$", rating: 4.3, review_count: 392, tags: ["Fun"], open_now: false, reservable: true, goodForGroups: true, dineIn: true, liveMusic: true, servesCocktails: true, categories: [{ title: "Bar" }] },
      { name: "Garden Cafe", price: "$", rating: 4.5, review_count: 201, tags: ["Chill"], open_now: true, reservable: false, goodForGroups: false, dineIn: true, liveMusic: false, servesCocktails: false, categories: [{ title: "Cafe" }] }
    ];

    return base.map((r, i) => {
      const dLat = (Math.random() - 0.5) * 0.02;
      const dLng = (Math.random() - 0.5) * 0.02;
      const coordinates = { latitude: lat + dLat, longitude: lng + dLng };
      const distance = this.calculateDistance(lat, lng, coordinates.latitude, coordinates.longitude);
      const id = `mock_${i}_${r.name.replace(/\s+/g, "_")}`;
      const out = {
        id,
        ...r,
        provider: "mock",
        image_url: "",
        location: { address1: "", city: "", state: "", zip_code: "" },
        display_phone: "",
        coordinates,
        distance,
        url: `https://www.google.com/maps/search/${encodeURIComponent(r.name)}`,
        website: "",
        routeTimes: null
      };
      out.clientScore = this.computeClientDinnerScore(out);
      return out;
    }).sort((a, b) => b.clientScore - a.clientScore);
  }
};
