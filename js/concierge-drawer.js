(() => {
  const drawerHandle = document.getElementById("conciergeDrawerHandle");
  const sidebar = document.getElementById("searchSidebar");

  if (!drawerHandle || !sidebar || typeof UI === "undefined") return;

  drawerHandle.addEventListener("click", () => {
    UI.collapsedSidebar = !UI.collapsedSidebar;
    sidebar.style.width = UI.collapsedSidebar ? "0px" : "";
    sidebar.style.minWidth = UI.collapsedSidebar ? "0px" : "";
    sidebar.style.overflow = UI.collapsedSidebar ? "hidden" : "";
  });
})();
