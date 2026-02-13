import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const API_KEY = process.env.GOOGLE_PLACES_API_KEY;
if (!API_KEY) {
  console.warn("⚠️ Missing GOOGLE_PLACES_API_KEY in server/.env");
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ----- helpers -----
function haversine(lat1, lon1, lat2, lon2) {
  const toRad = (x) => (x * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function priceLevelToDollar(level) {
  switch (level) {
    case "PRICE_LEVEL_INEXPENSIVE": return "$";
    case "PRICE_LEVEL_MODERATE": return "$$";
    case "PRICE_LEVEL_EXPENSIVE": return "$$$";
    case "PRICE_LEVEL_VERY_EXPENSIVE": return "$$$$";
    default: return "";
  }
}

function parseAddress(formattedAddress = "") {
  // best-effort parse: "123 St, City, ST 12345, USA"
  const parts = formattedAddress.split(",").map(s => s.trim()).filter(Boolean);
  const address1 = parts[0] || "";
  const city = parts[1] || "";
  const stateZip = parts[2] || "";
  let state = "";
  let zip_code = "";
  const m = stateZip.match(/^([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/);
  if (m) { state = m[1]; zip_code = m[2]; }
  return { address1, city, state, zip_code };
}

function computeTags(p) {
  const tags = new Set();

  const price = priceLevelToDollar(p.priceLevel);
  const rating = Number(p.rating || 0);
  const reviews = Number(p.userRatingCount || 0);

  if (p.goodForGroups || p.reservable || (price && price.length >= 2 && rating >= 4.2 && reviews >= 100)) {
    tags.add("Good for Business Meal");
  }
  if (p.outdoorSeating || p.servesCoffee) tags.add("Chill");
  if (p.liveMusic || p.servesCocktails) tags.add("Fun");
  if (p.editorialSummary?.text) tags.add("Local Spots");

  return [...tags];
}

function placeToRestaurant(p, centerLat, centerLng) {
  const lat = p.location?.latitude;
  const lng = p.location?.longitude;

  const distance = (Number.isFinite(centerLat) && Number.isFinite(centerLng) && Number.isFinite(lat) && Number.isFinite(lng))
    ? haversine(centerLat, centerLng, lat, lng)
    : null;

  const categories = [];
  if (p.primaryTypeDisplayName?.text) categories.push({ title: p.primaryTypeDisplayName.text });
  // also sprinkle a couple type labels for filtering
  if (Array.isArray(p.types)) {
    const extra = p.types.slice(0, 2).map(t => ({ title: t.replace(/_/g, " ") }));
    extra.forEach(x => categories.push(x));
  }

  const img = p.photos?.[0]?.name
    ? `/api/places/photo?name=${encodeURIComponent(p.photos[0].name)}&maxWidthPx=400`
    : "";

  const addr = p.formattedAddress || "";

  return {
    id: p.id,
    name: p.displayName?.text || "Unknown",
    image_url: img,
    rating: p.rating || 0,
    review_count: p.userRatingCount || 0,
    price: priceLevelToDollar(p.priceLevel),
    categories,
    coordinates: { latitude: lat, longitude: lng },
    location: parseAddress(addr),
    formatted_address: addr,
    display_phone: p.nationalPhoneNumber || "",
    url: p.googleMapsUri || "",
    website: p.websiteUri || "",
    open_now: p.currentOpeningHours?.openNow ?? null,

    reservable: !!p.reservable,
    delivery: !!p.delivery,
    takeout: !!p.takeout,
    dineIn: !!p.dineIn,

    tags: computeTags(p),
    distance
  };
}

// ----- endpoints -----

// Nearby restaurants/bars/cafes etc (Places:searchNearby)
app.post("/api/places/nearby", async (req, res) => {
  try {
    const { latitude, longitude, radius, maxResultCount, includedTypes } = req.body || {};
    const lat = Number(latitude);
    const lng = Number(longitude);
    const rad = Math.min(50000, Math.max(100, Number(radius || 1000)));
    const limit = Math.min(20, Math.max(1, Number(maxResultCount || 10))); // Places Nearby max is 20 :contentReference[oaicite:4]{index=4}

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ error: "Invalid latitude/longitude" });
    }
    if (!API_KEY) return res.status(500).json({ error: "Server missing GOOGLE_PLACES_API_KEY" });

    const body = {
      includedTypes: Array.isArray(includedTypes) && includedTypes.length ? includedTypes : ["restaurant"],
      maxResultCount: limit,
      locationRestriction: {
        circle: {
          center: { latitude: lat, longitude: lng },
          radius: rad
        }
      },
      rankPreference: "POPULARITY"
    };

    // Field mask required :contentReference[oaicite:5]{index=5}
    const fieldMask = [
      "places.id",
      "places.displayName",
      "places.primaryTypeDisplayName",
      "places.types",
      "places.rating",
      "places.userRatingCount",
      "places.priceLevel",
      "places.formattedAddress",
      "places.location",
      "places.nationalPhoneNumber",
      "places.googleMapsUri",
      "places.websiteUri",
      "places.photos",
      "places.currentOpeningHours",
      "places.reservable",
      "places.delivery",
      "places.takeout",
      "places.dineIn",
      "places.liveMusic",
      "places.goodForGroups",
      "places.outdoorSeating",
      "places.servesBeer",
      "places.servesWine",
      "places.servesCocktails",
      "places.servesCoffee",
      "places.editorialSummary",
      "places.accessibilityOptions"
    ].join(",");

    const resp = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": API_KEY,
        "X-Goog-FieldMask": fieldMask
      },
      body: JSON.stringify(body)
    });

    const json = await resp.json();
    if (!resp.ok) return res.status(resp.status).json(json);

    const places = Array.isArray(json.places) ? json.places : [];
    const restaurants = places.map(p => placeToRestaurant(p, lat, lng));

    res.json({ restaurants });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// Text search for hotels/lodging (Places:searchText)
app.post("/api/places/textSearch", async (req, res) => {
  try {
    const { textQuery, includedType, locationBias } = req.body || {};
    if (!API_KEY) return res.status(500).json({ error: "Server missing GOOGLE_PLACES_API_KEY" });

    const q = String(textQuery || "").trim();
    if (!q) return res.status(400).json({ error: "Missing textQuery" });

    const body = { textQuery: q };

    if (includedType) body.includedType = String(includedType);

    // optional bias circle
    if (locationBias && Number.isFinite(Number(locationBias.latitude)) && Number.isFinite(Number(locationBias.longitude))) {
      body.locationBias = {
        circle: {
          center: { latitude: Number(locationBias.latitude), longitude: Number(locationBias.longitude) },
          radius: Math.min(50000, Math.max(1000, Number(locationBias.radius || 20000)))
        }
      };
    }

    const fieldMask = [
      "places.id",
      "places.displayName",
      "places.formattedAddress",
      "places.location",
      "places.googleMapsUri"
    ].join(",");

    const resp = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": API_KEY,
        "X-Goog-FieldMask": fieldMask
      },
      body: JSON.stringify(body)
    });

    const json = await resp.json();
    if (!resp.ok) return res.status(resp.status).json(json);

    const hotels = (json.places || []).slice(0, 8).map(p => ({
      id: p.id,
      name: p.displayName?.text || "Unknown",
      address: p.formattedAddress || "",
      coordinates: { latitude: p.location?.latitude, longitude: p.location?.longitude },
      googleMapsUri: p.googleMapsUri || "https://www.google.com/maps"
    }));

    res.json({ hotels });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// Photo redirect (Place Photos New) — returns redirect to photoUri, no API key exposed :contentReference[oaicite:6]{index=6}
app.get("/api/places/photo", async (req, res) => {
  try {
    if (!API_KEY) return res.status(500).send("Missing API key");
    const name = req.query.name ? String(req.query.name) : "";
    const maxWidthPx = req.query.maxWidthPx ? String(req.query.maxWidthPx) : "400";
    if (!name) return res.status(400).send("Missing name");

    const url =
      `https://places.googleapis.com/v1/${encodeURIComponent(name)}/media` +
      `?maxWidthPx=${encodeURIComponent(maxWidthPx)}` +
      `&skipHttpRedirect=true` +
      `&key=${encodeURIComponent(API_KEY)}`;

    const resp = await fetch(url);
    const json = await resp.json();

    if (!resp.ok) {
      return res.status(resp.status).json(json);
    }

    const photoUri = json.photoUri;
    if (!photoUri) return res.status(404).send("No photoUri");
    res.redirect(photoUri);
  } catch (e) {
    console.error(e);
    res.status(500).send("Server error");
  }
});

// Serve your static site (parent folder)
const siteRoot = path.join(__dirname, "..");
app.use(express.static(siteRoot));

app.get("*", (req, res) => {
  res.sendFile(path.join(siteRoot, "index.html"));
});

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => console.log(`✅ OnTheGo running on http://localhost:${PORT}`));
