const Account = {
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
      UI.toast("Settings saved", "ok");
      App.refreshProviderBadge();
    });

    // Demo connect/disconnect
    document.querySelectorAll("[data-connect]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.connect;
        document.querySelector(`[data-status="${id}"]`).style.display = "block";
        btn.style.display = "none";
        UI.toast(`${id} connected (demo)`, "ok");
      });
    });
    document.querySelectorAll("[data-disconnect]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.disconnect;
        document.querySelector(`[data-status="${id}"]`).style.display = "none";
        document.querySelector(`[data-connect="${id}"]`).style.display = "inline-flex";
        UI.toast(`${id} disconnected`, "warn");
      });
    });
  },

  load() {
    const profile = Storage.get(CONFIG.STORAGE_KEYS.PROFILE, { name: "", email: "", phone: "" });
    document.getElementById("userName").value = profile.name || "";
    document.getElementById("userEmail").value = profile.email || "";
    document.getElementById("userPhone").value = profile.phone || "";

    const settings = Storage.get(CONFIG.STORAGE_KEYS.SETTINGS, {
      textAlerts: true,
      emailAlerts: true,
      dealAlerts: false,
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
  }
};
