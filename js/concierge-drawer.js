(() => {
  const drawer = document.getElementById("conciergeDrawer");
  const drawerHandle = document.getElementById("conciergeDrawerHandle");
  const sidebar = document.getElementById("searchSidebar");

  if (!drawer || !drawerHandle || !sidebar || typeof UI === "undefined") return;
  if (typeof UI.collapsedSidebar !== "boolean") UI.collapsedSidebar = false;

  const syncA11yState = () => {
    const isCollapsed = !!UI.collapsedSidebar;
    sidebar.setAttribute("aria-hidden", String(isCollapsed));
    drawer.setAttribute("aria-hidden", String(!isCollapsed));
    drawerHandle.setAttribute("aria-expanded", String(!isCollapsed));
  };

  drawerHandle.addEventListener("click", () => {
    UI.collapsedSidebar = !UI.collapsedSidebar;
    sidebar.style.width = UI.collapsedSidebar ? "0px" : "";
    sidebar.style.minWidth = UI.collapsedSidebar ? "0px" : "";
    sidebar.style.overflow = UI.collapsedSidebar ? "hidden" : "";
    syncA11yState();
  });

  syncA11yState();
})();
