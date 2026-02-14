// js/plan.js
// Reactive dinner plan state (simple event-driven store)

const DinnerPlan = {
  state: {
    date: '',
    time: '',
    partySize: 2,
    vibe: 'business',      // business | quiet | lively | solo | celebratory
    budget: 'mid',         // low | mid | high
    walkMinutes: 15,
    dietary: ''
  },
  listeners: new Set(),

  init() {
    // Load persisted state
    try {
      const saved = localStorage.getItem('dinnerPlan');
      if (saved) this.state = { ...this.state, ...JSON.parse(saved) };
    } catch (e) {}

    // Default date/time
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    if (!this.state.date) this.state.date = `${yyyy}-${mm}-${dd}`;
    if (!this.state.time) this.state.time = '19:30';

    this.mountMiniPanel();
  },

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  },

  set(patch) {
    this.state = { ...this.state, ...patch };
    try {
      localStorage.setItem('dinnerPlan', JSON.stringify(this.state));
    } catch (e) {}
    this.listeners.forEach((fn) => {
      try { fn(this.state); } catch (e) {}
    });
  },

  mountMiniPanel() {
    // Inject a compact plan panel into the sidebar (above restaurant list)
    const sidebar = document.getElementById('searchSidebar');
    const restaurantList = document.getElementById('restaurantList');
    if (!sidebar || !restaurantList) return;

    const panel = document.createElement('section');
    panel.className = 'plan-panel';
    panel.innerHTML = `
      <div class="plan-panel__header">
        <div class="plan-panel__title"><i class="fas fa-magic"></i> Dinner Plan</div>
        <div class="plan-panel__hint">Shortlist that fits your night</div>
      </div>

      <div class="plan-panel__grid">
        <label class="plan-field">
          <span>Date</span>
          <input id="planDate" type="date" />
        </label>
        <label class="plan-field">
          <span>Time</span>
          <input id="planTime" type="time" />
        </label>
        <label class="plan-field">
          <span>Party</span>
          <input id="planParty" type="number" min="1" max="20" />
        </label>
        <label class="plan-field">
          <span>Vibe</span>
          <select id="planVibe">
            <option value="business">Client / Business</option>
            <option value="quiet">Quiet</option>
            <option value="lively">Lively</option>
            <option value="solo">Solo</option>
            <option value="celebratory">Celebratory</option>
          </select>
        </label>
        <label class="plan-field">
          <span>Budget</span>
          <select id="planBudget">
            <option value="low">$</option>
            <option value="mid">$$</option>
            <option value="high">$$$</option>
          </select>
        </label>
        <label class="plan-field">
          <span>Walk</span>
          <input id="planWalk" type="range" min="5" max="45" step="5" />
          <small id="planWalkLabel"></small>
        </label>
        <label class="plan-field plan-field--full">
          <span>Dietary notes</span>
          <input id="planDietary" type="text" placeholder="e.g., gluten-free, no shellfish" />
        </label>
      </div>
    `;

    restaurantList.parentNode.insertBefore(panel, restaurantList);

    // hydrate inputs
    const $ = (id) => document.getElementById(id);
    const walkLabel = $('planWalkLabel');

    $('planDate').value = this.state.date;
    $('planTime').value = this.state.time;
    $('planParty').value = String(this.state.partySize);
    $('planVibe').value = this.state.vibe;
    $('planBudget').value = this.state.budget;
    $('planWalk').value = String(this.state.walkMinutes);
    $('planDietary').value = this.state.dietary;

    const setWalkLabel = (v) => {
      if (walkLabel) walkLabel.textContent = `≤ ${v} minutes`;
    };
    setWalkLabel(this.state.walkMinutes);

    // listeners
    $('planDate').addEventListener('change', (e) => this.set({ date: e.target.value }));
    $('planTime').addEventListener('change', (e) => this.set({ time: e.target.value }));
    $('planParty').addEventListener('change', (e) => this.set({ partySize: Number(e.target.value || 2) }));
    $('planVibe').addEventListener('change', (e) => this.set({ vibe: e.target.value }));
    $('planBudget').addEventListener('change', (e) => this.set({ budget: e.target.value }));
    $('planWalk').addEventListener('input', (e) => {
      const v = Number(e.target.value || 15);
      setWalkLabel(v);
      this.set({ walkMinutes: v });
    });
    $('planDietary').addEventListener('input', (e) => this.set({ dietary: e.target.value }));

    // Trigger reactive sorting when plan changes
    this.subscribe(() => {
      if (window.UI && typeof UI.applyFilters === 'function') UI.applyFilters();
    });
  }
};
