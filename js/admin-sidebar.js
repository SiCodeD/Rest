(function () {
    const sidebar = document.getElementById("adminSidebar");
    const toggle = document.getElementById("sidebarToggle");
    const closeButton = document.getElementById("sidebarClose");
    const backdrop = document.getElementById("sidebarBackdrop");

    if (!sidebar || !toggle || !closeButton || !backdrop) return;

    function setSidebarOpen(isOpen) {
        sidebar.classList.toggle("is-open", isOpen);
        document.body.classList.toggle("sidebar-open", isOpen);
        toggle.setAttribute("aria-expanded", String(isOpen));
        toggle.setAttribute(
            "aria-label",
            isOpen ? "إغلاق القائمة الجانبية" : "فتح القائمة الجانبية",
        );
        backdrop.hidden = !isOpen;
    }

    toggle.addEventListener("click", function () {
        setSidebarOpen(!sidebar.classList.contains("is-open"));
    });

    closeButton.addEventListener("click", function () {
        setSidebarOpen(false);
    });

    backdrop.addEventListener("click", function () {
        setSidebarOpen(false);
    });

    sidebar.addEventListener("click", function (event) {
        if (event.target.closest(".sidebar-link")) setSidebarOpen(false);
    });

    document.addEventListener("keydown", function (event) {
        if (event.key === "Escape") setSidebarOpen(false);
    });
})();