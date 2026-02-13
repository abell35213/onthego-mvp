const Account = {
  userAccount: {
    concurConnected: false,
    tripitConnected: false,
    marriottConnected: false,
    hiltonConnected: false,
    lastSync: null
  },

  init() {
    const modal = document.getElementById("accountModal");
    const openBtn = document.getElementById("accountBtn");
    const closeBtn = modal.querySelector(".close");

    openBtn.addEventListener("click", () => {
      this.load();
      modal.style.display = "block";
    });

    closeBtn.addEventListener("click", () => (modal.style.display = "none"));
    window.addEventListener("click", (e) => {
      if (e.target === modal) modal.style.display = "none";
    });

    // Tabs
    document.querySelectorAll(".account-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".account-tab").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");

        const tab = btn.dataset.tab;
        document.querySelectorAll(".tab-content").forEach(c => (c.style.display = "none", c.classList.remove("active")));
        const el = document.getElementById(`${tab}Tab`);
        el.style.display = "block";
        el.classList.add("active");
      });
    });

    // Profile save
    document.getElementById("accountForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const profile = {
        name: document.getElementById("userName").value.trim(),
        email: document.getElementById("userEmail").value.trim(),
        phone: document.getElementById("userPhone").value.trim()
      };
      Storage.set(CONFIG.STORAGE_KEYS.PROFILE, profile);
      this._flash("profileSavedMsg");
    });

    // Settings save
    document.getElementById("saveSettingsBtn").addEventListener("click", () => {
      const settings = {
        textAlerts: !!document.getElementById("settingTextAlerts").checked,
        emailAlerts: !!document.getElementById("settingEmailAlerts").checked,
        dealAlerts: !!document.getElementById("settingDealAlerts").checked,
        radius: Number(document.getElementById("settingRadius").value || CONFIG.DEFAULT_RADIUS_METERS),
        provider: document.getElementById("settingProvider").value || CONFIG.PROVIDERS.GOOGLE
      };
      Storage.set(CONFIG.STORAGE_KEYS.SETTINGS, settings);
      this._flash("settingsSavedMsg");
      UI.toast("Settings saved");
      App.refreshProviderBadge();
      if (App.currentView === "local") App.refreshRestaurants();
    });

    // Integration-ready connect/disconnect (with fallback demo behavior)
    document.querySelectorAll("[data-connect]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.connectAccount(btn.dataset.connect);
      });
    });
    document.querySelectorAll("[data-disconnect]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.disconnect;
        const statusDiv = document.getElementById(`${id}Status`) || document.querySelector(`[data-status="${id}"]`);
        const connectBtn = document.getElementById(`${id}Connect`) || document.querySelector(`[data-connect="${id}"]`);
        this._setConnected(id, false);
        if (statusDiv) statusDiv.style.display = "none";
        if (connectBtn) {
          connectBtn.disabled = false;
          connectBtn.innerHTML = '<i class="fas fa-plug"></i><span class="connect-text">Connect</span>';
          connectBtn.style.display = "inline-flex";
        }
        this.showNotification(`${this._displayName(id)} disconnected`);
      });
    });
  },

  load() {
    const profile = Storage.get(CONFIG.STORAGE_KEYS.PROFILE, { name: "", email: "", phone: "" });
    document.getElementById("userName").value = profile.name || "";
    document.getElementById("userEmail").value = profile.email || "";
    document.getElementById("userPhone").value = profile.phone || "";

    const settings = Storage.get(CONFIG.STORAGE_KEYS.SETTINGS, {
      textAlerts: true, emailAlerts: true, dealAlerts: false,
      radius: CONFIG.DEFAULT_RADIUS_METERS,
      provider: CONFIG.PROVIDERS.GOOGLE
    });

    document.getElementById("settingTextAlerts").checked = !!settings.textAlerts;
    document.getElementById("settingEmailAlerts").checked = !!settings.emailAlerts;
    document.getElementById("settingDealAlerts").checked = !!settings.dealAlerts;
    document.getElementById("settingRadius").value = String(settings.radius || CONFIG.DEFAULT_RADIUS_METERS);
    document.getElementById("settingProvider").value = settings.provider || CONFIG.PROVIDERS.GOOGLE;
  },

  _flash(id) {
    const el = document.getElementById(id);
    el.style.display = "block";
    setTimeout(() => (el.style.display = "none"), 1800);
  },

  async connectAccount(accountType) {
    const connectBtn = document.getElementById(`${accountType}Connect`) || document.querySelector(`[data-connect="${accountType}"]`);
    const statusDiv = document.getElementById(`${accountType}Status`) || document.querySelector(`[data-status="${accountType}"]`);

    if (connectBtn) {
      connectBtn.disabled = true;
      connectBtn.innerHTML = "<i></i> Connecting...";
    }

    try {
      const resp = await fetch(`/api/integrations/${encodeURIComponent(accountType)}/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ redirectUri: window.location.origin })
      });

      if (resp.ok) {
        await resp.json().catch(() => ({}));
        this._setConnected(accountType, true);
        this.userAccount.lastSync = new Date().toISOString();
        if (connectBtn) connectBtn.style.display = "none";
        if (statusDiv) statusDiv.style.display = "flex";
        this.updateSyncInfo();
        this.showNotification(`${this._displayName(accountType)} connected successfully!`);
        return;
      }
    } catch (e) {
      // fall through to simulation
    }

    setTimeout(() => {
      this._setConnected(accountType, true);
      this.userAccount.lastSync = new Date().toISOString();

      if (connectBtn) connectBtn.style.display = "none";
      if (statusDiv) statusDiv.style.display = "flex";

      this.updateSyncInfo();
      this.showNotification(`${this._displayName(accountType)} connected successfully!`);
    }, 900);
  },

  updateSyncInfo() {
    const syncInfo = document.getElementById("syncInfo");
    const lastSyncTime = document.getElementById("lastSyncTime");
    if (!syncInfo || !lastSyncTime) return;
    if (!this.userAccount.lastSync) {
      syncInfo.style.display = "none";
      return;
    }
    syncInfo.style.display = "flex";
    lastSyncTime.textContent = `Last synced: ${new Date(this.userAccount.lastSync).toLocaleString()}`;
  },

  showNotification(message) {
    UI.toast(message);
  },

  _displayName(accountType) {
    return ({
      concur: "Concur",
      tripit: "TripIt",
      marriott: "Marriott Bonvoy",
      hilton: "Hilton Honors"
    })[accountType] || accountType;
  },

  _setConnected(accountType, isConnected) {
    if (accountType === "concur") this.userAccount.concurConnected = isConnected;
    else if (accountType === "tripit") this.userAccount.tripitConnected = isConnected;
    else if (accountType === "marriott") this.userAccount.marriottConnected = isConnected;
    else if (accountType === "hilton") this.userAccount.hiltonConnected = isConnected;
  }
};
