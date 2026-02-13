const CONFIG = {
  APP_NAME: "OnTheGo",

  DEFAULT_LAT: 37.7749,
  DEFAULT_LNG: -122.4194,
  DEFAULT_ZOOM: 13,

  SEARCH_LIMIT: 20,
  DEFAULT_RADIUS_METERS: 8047, // 5 miles

  STORAGE_KEYS: {
    PROFILE: "onthego_profile",
    SETTINGS: "onthego_settings",
    VISITED: "onthego_visited",
    TRIPS: "onthego_trips",
    LAST_SEARCH: "onthego_last_search"
  },

  PROVIDERS: {
    GOOGLE: "google",
    MOCK: "mock"
  },

  GOOGLE_PROXY: {
    NEARBY: "/api/places/nearby",
    TEXT_SEARCH: "/api/places/textSearch",
    PHOTO: "/api/places/photo"
  },

  // Simple starter trips (used if none exist yet)
  SAMPLE_TRIPS: [
    {
      id: "trip_sf",
      hotel: "Hyatt Regency San Francisco",
      city: "San Francisco",
      state: "CA",
      startDate: "2026-02-01",
      endDate: "2026-02-03",
      coordinates: { latitude: 37.7946, longitude: -122.3950 }
    },
    {
      id: "trip_chi",
      hotel: "Hyatt Regency Chicago",
      city: "Chicago",
      state: "IL",
      startDate: "2026-02-10",
      endDate: "2026-02-12",
      coordinates: { latitude: 41.8870, longitude: -87.6229 }
    }
  ]
};
