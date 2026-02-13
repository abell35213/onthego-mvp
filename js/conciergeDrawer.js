/* Concierge Drawer (new)
   - Reactive: listens to UI.setRestaurants/UI.applyFilters + user focus events
   - Stores pins in localStorage per "trip context" (active location label or lat/lng hash)
*/
(function () {
  const STORAGE_KEY = 'onthego.conciergePins.v1';

  const state = {
    focused: null,
    restaurants: [],
    pins: {
      primary: null,
      backup: null,
      late: null,
    },
    contextKey: 'default',
  };

  function safeText(v) {
    return (v ?? '').toString();
  }

  function getContextKey() {
    // Prefer the active location label if available; else fall back to map center.
    const label = document.getElementById('activeLocationLabel')?.textContent?.trim();
    if (label) return `label:${label}`;

    try {
      const c = window.MapModule?.map?.getCenter?.();
      if (c?.lat && c?.lng) return `map:${c.lat.toFixed(3)},${c.lng.toFixed(3)}`;
    } catch (_) {}
    return 'default';
  }

  function loadPins() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const all = JSON.parse(raw);
      const ctx = getContextKey();
      state.contextKey = ctx;
      const pins = all?.[ctx];
      if (pins) state.pins = { ...state.pins, ...pins };
    } catch (_) {}
  }

  function savePins() {
    const raw = localStorage.getItem(STORAGE_KEY);
    let all = {};
    try { all = raw ? JSON.parse(raw) : {}; } catch (_) {}
    all[state.contextKey] = state.pins;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  }

  function scoreRestaurant(r) {
    // Simple “concierge-ish” scoring that feels good:
    // rating + review volume + slight preference for business-meal tags + closer is slightly better.
    const rating = Number(r?.rating ?? 0);
    const reviews = Number(r?.review_count ?? 0);
    const distanceM = Number(r?.distance ?? 999999);
    const tags = (r?.tags ?? []).map(t => String(t).toLowerCase());

    const businessBoost = tags.some(t => t.includes('business')) ? 0.35 : 0;
    const visitedPenalty = r?.visited ? -0.10 : 0;

    const reviewBoost = Math.log10(1 + reviews) * 0.25;       // 0..~1.5
    const distancePenalty = Math.min(distanceM / 2500, 2) * 0.35; // 0..0.7

    return (rating * 1.0) + reviewBoost + businessBoost + visitedPenalty - distancePenalty;
  }

  function topSuggestions(list, count) {
    return [...list]
      .sort((a, b) => scoreRestaurant(b) - scoreRestaurant(a))
      .slice(0, count);
  }

  function findById(id) {
    if (!id) return null;
    return state.restaurants.find(r => String(r.id) === String(id)) || null;
  }

  function renderCard(r, { badge } = {}) {
    const img = r?.image_url || 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=300&h=300&fit=crop';
    const cats = (r?.categories || []).slice(0, 2).map(c => c.title).filter(Boolean).join(' • ');
    const price = r?.price ? `${r.price} · ` : '';
    const dist = Number.isFinite(Number(r?.distance)) ? `${Math.round(r.distance)}m` : '';
    const line = `${price}${cats}${dist ? ` · ${dist}` : ''}`.trim();

    const yelpUrl = r?.url || '#';
    const directions = (() => {
      const lat = r?.coordinates?.latitude;
      const lng = r?.coordinates?.longitude;
      if (!lat || !lng) return '#';
      return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
    })();

    return `
      <div class="concierge-card" data-id="${safeText(r.id)}">
        <img src="${safeText(img)}" alt="${safeText(r.name)}" loading="lazy"/>
        <div class="meta">
          <p class="name">${badge ? `${badge} · ` : ''}${safeText(r.name)}</p>
          <div class="line">${safeText(line)}</div>
        </div>
        <div class="concierge-mini-actions">
          <a class="concierge-pill" href="${safeText(yelpUrl)}" target="_blank" rel="noopener noreferrer" title="Open Yelp">
            <i class="fab fa-yelp"></i>
          </a>
          <a class="concierge-pill" href="${safeText(directions)}" target="_blank" rel="noopener noreferrer" title="Directions">
            <i class="fas fa-route"></i>
          </a>
          <button class="concierge-pill js-focus" type="button" title="Focus">
            <i class="fas fa-bullseye"></i>
          </button>
        </div>
      </div>
    `;
  }

  function renderSlot(slotId, restaurantId, fallbackRestaurant, badge) {
    const el = document.getElementById(slotId);
    if (!el) return;

    const pinned = findById(restaurantId);
    const r = pinned || fallbackRestaurant;

    if (!r) {
      el.innerHTML = `<div class="concierge-focused empty">No suggestions yet — try “Search This Area” on the map.</div>`;
      return;
    }

    el.innerHTML = renderCard(r, { badge: pinned ? `${badge} (Pinned)` : `${badge}` });
  }

  function focusRestaurant(r) {
    state.focused = r;
    const focusedEl = document.getElementById('conciergeFocused');
    if (!focusedEl) return;

    if (!r) {
      focusedEl.classList.add('empty');
      focusedEl.textContent = 'Click a restaurant card to preview it here.';
    } else {
      focusedEl.classList.remove('empty');
      focusedEl.innerHTML = renderCard(r, { badge: 'Focused' });
    }

    // Enable pin buttons when focused
    const btns = ['pinPrimaryBtn','pinBackupBtn','pinLateBtn'].map(id => document.getElementById(id));
    btns.forEach(b => { if (b) b.disabled = !r; });
  }

  function syncSubline() {
    const sub = document.getElementById('conciergeSubline');
    if (!sub) return;
    const total = state.restaurants.length;
    const shown = window.UI?.filteredRestaurants?.length ?? total;
    sub.textContent = total
      ? `Curating from ${shown} results${shown !== total ? ` (out of ${total})` : ''}…`
      : 'Curating a plan from your current results…';
  }

  function refresh() {
    state.contextKey = getContextKey();
    loadPins();
    syncSubline();

    const list = window.UI?.filteredRestaurants?.length ? window.UI.filteredRestaurants : state.restaurants;
    const suggestions = topSuggestions(list, 6);

    // Fallbacks are top suggestions that aren't already pinned
    const pinnedIds = new Set([state.pins.primary, state.pins.backup, state.pins.late].filter(Boolean).map(String));
    const unpinned = suggestions.filter(r => !pinnedIds.has(String(r.id)));

    renderSlot('slotPrimary', state.pins.primary, unpinned[0], 'Primary');
    renderSlot('slotBackup', state.pins.backup, unpinned[1] || unpinned[0], 'Backup');
    renderSlot('slotLate', state.pins.late, unpinned[2] || unpinned[1] || unpinned[0], 'Late-night');
  }

  function focusOnMapAndList(restaurantId) {
    const r = findById(restaurantId);
    if (!r) return;

    // Highlight list card if your UI module has it
    try {
      window.UI?.highlightRestaurantCard?.(restaurantId);
    } catch (_) {}

    // Open popup on the map if available
    try {
      window.MapModule?.openMarkerPopup?.(restaurantId, state.restaurants);
    } catch (_) {}

    focusRestaurant(r);
  }

  function bindEvents() {
    // Collapse toggle
    const collapseBtn = document.getElementById('conciergeCollapseBtn');
    const drawer = document.getElementById('conciergeDrawer');
    collapseBtn?.addEventListener('click', () => {
      drawer?.classList.toggle('is-collapsed');
      const icon = collapseBtn.querySelector('i');
      if (icon) icon.className = drawer?.classList.contains('is-collapsed')
        ? 'fas fa-chevron-left'
        : 'fas fa-chevron-right';
      setTimeout(() => window.MapModule?.map?.invalidateSize?.(), 150);
    });

    // Pin buttons
    document.getElementById('pinPrimaryBtn')?.addEventListener('click', () => {
      if (!state.focused) return;
      state.pins.primary = String(state.focused.id);
      savePins(); refresh();
    });
    document.getElementById('pinBackupBtn')?.addEventListener('click', () => {
      if (!state.focused) return;
      state.pins.backup = String(state.focused.id);
      savePins(); refresh();
    });
    document.getElementById('pinLateBtn')?.addEventListener('click', () => {
      if (!state.focused) return;
      state.pins.late = String(state.focused.id);
      savePins(); refresh();
    });

    // Delegate clicks inside drawer
    document.getElementById('conciergeDrawer')?.addEventListener('click', (e) => {
      const target = e.target;
      const card = target?.closest?.('.concierge-card');
      if (!card) return;
      const id = card.getAttribute('data-id');

      if (target?.closest?.('.js-focus')) {
        focusOnMapAndList(id);
      } else {
        // Clicking the card focuses too (nice UX)
        focusOnMapAndList(id);
      }
    });

    // Ask concierge (wired to API; safe fallback)
    document.getElementById('askConciergeBtn')?.addEventListener('click', async () => {
      const btn = document.getElementById('askConciergeBtn');
      if (btn) btn.disabled = true;

      try {
        const payload = {
          restaurants: (window.UI?.filteredRestaurants?.length ? window.UI.filteredRestaurants : state.restaurants).slice(0, 30),
          preferences: {
            // In a real version these come from account settings + time + “business meal” intent
            intent: 'dinner',
            vibe: document.getElementById('ambianceFilter')?.value || '',
            price: document.getElementById('priceFilter')?.value || '',
          }
        };

        const result = await window.API?.askConcierge?.(payload);
        if (result?.pins) {
          state.pins = { ...state.pins, ...result.pins };
          savePins();
        }
      } catch (err) {
        console.warn('Concierge API unavailable, falling back to local scoring.', err);
      } finally {
        refresh();
        if (btn) btn.disabled = false;
      }
    });
  }

  // Public hooks used by UI
  window.ConciergeDrawer = {
    init(initialRestaurants = []) {
      state.restaurants = initialRestaurants || [];
      state.contextKey = getContextKey();
      loadPins();
      bindEvents();
      refresh();
    },
    onRestaurantsUpdated(restaurants = []) {
      state.restaurants = restaurants || [];
      refresh();
    },
    onFocusedRestaurant(restaurant) {
      focusRestaurant(restaurant);
    }
  };
})();
