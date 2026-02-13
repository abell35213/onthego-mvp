const Routing = {
  _cache: new Map(),

  _key(o, d) {
    const r = (n) => Math.round(Number(n) * 1e5) / 1e5;
    return `${r(o.lat)},${r(o.lng)}|${r(d.lat)},${r(d.lng)}`;
  },

  async getTimes(origin, destination) {
    const k = this._key(origin, destination);
    if (this._cache.has(k)) return this._cache.get(k);

    // 1) Try your server Routes API (Google Routes)
    try {
      const res = await fetch(CONFIG.GOOGLE_PROXY.ROUTES, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ origin, destination })
      });
      if (res.ok) {
        const data = await res.json();
        const out = {
          provider: data.provider || "google",
          driveSec: data.drive?.durationSec ?? null,
          walkSec: data.walk?.durationSec ?? null,
          driveMeters: data.drive?.distanceMeters ?? null,
          walkMeters: data.walk?.distanceMeters ?? null
        };
        this._cache.set(k, out);
        return out;
      }
    } catch {
      // fall through
    }

    // 2) Fallback: OSRM public server (best effort)
    try {
      const out = await this._osrm(origin, destination);
      this._cache.set(k, out);
      return out;
    } catch {
      // 3) Fallback: estimate from haversine distance
      const meters = API.calculateDistance(origin.lat, origin.lng, destination.lat, destination.lng);
      const walkSec = Math.round(meters / 1.4);     // 1.4 m/s walking
      const driveSec = Math.round(meters / 12.0);   // ~27 mph
      const out = { provider: "estimate", walkSec, driveSec, walkMeters: meters, driveMeters: meters };
      this._cache.set(k, out);
      return out;
    }
  },

  async _osrm(origin, destination) {
    const o = `${origin.lng},${origin.lat}`;
    const d = `${destination.lng},${destination.lat}`;

    const fetchRoute = async (profile) => {
      const url = `https://router.project-osrm.org/route/v1/${profile}/${o};${d}?overview=false&alternatives=false&steps=false`;
      const r = await fetch(url);
      if (!r.ok) throw new Error("OSRM error");
      const j = await r.json();
      const route = j.routes?.[0];
      if (!route) throw new Error("No route");
      return { sec: Math.round(route.duration), meters: Math.round(route.distance) };
    };

    // Many OSRM demos support "driving" and "walking". If walking fails, estimate walk from distance.
    const drive = await fetchRoute("driving");
    let walk;
    try {
      walk = await fetchRoute("walking");
    } catch {
      walk = { sec: Math.round(drive.meters / 1.4), meters: drive.meters };
    }

    return {
      provider: "osrm",
      driveSec: drive.sec,
      walkSec: walk.sec,
      driveMeters: drive.meters,
      walkMeters: walk.meters
    };
  },

  formatDuration(sec) {
    if (!Number.isFinite(sec) || sec <= 0) return "";
    const m = Math.round(sec / 60);
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return `${h}h ${mm}m`;
  }
};
