// Clean URL routing:
//   mersalak.com/        -> Landing
//   mersalak.com/:slug   -> public Menu
//   app.mersalak.com/    -> AdminDashboard
//   /login /admin /super-admin /waiter /waiter-login /kitchen /setup-password /landing
// Legacy /Pages/*.html URLs 301-redirect to their clean canonical.

const CLEAN_ROUTES = {
    "/login": "/Pages/Login.html",
    "/admin": "/Pages/AdminDashboard.html",
    "/super-admin": "/Pages/SuperAdminDashboard.html",
    "/waiter": "/Pages/WaiterDashboard.html",
    "/waiter-login": "/Pages/WaiterLogin.html",
    "/kitchen": "/Pages/KitchenDisplay.html",
    "/setup-password": "/Pages/SetupPassword.html",
    "/setuppassword": "/Pages/SetupPassword.html",
    "/landing": "/Pages/Landing.html",
    "/menu": "/Pages/Menu.html",
};

const CANONICAL_BY_FILE = {
    "login.html": "/login",
    "admindashboard.html": "/admin",
    "superadmindashboard.html": "/super-admin",
    "waiterdashboard.html": "/waiter",
    "waiterlogin.html": "/waiter-login",
    "kitchendisplay.html": "/kitchen",
    "setuppassword.html": "/setup-password",
    "landing.html": "/landing",
    // Menu.html has no single canonical (it serves /:slug), so never redirect it.
};

function normalizePath(pathname) {
    if (!pathname) return "/";
    if (pathname.length > 1 && pathname.endsWith("/")) {
        return pathname.slice(0, -1);
    }
    return pathname || "/";
}

function isAppHost(hostname) {
    const host = String(hostname || "").toLowerCase();
    return host === "app.mersalak.com" || host.startsWith("app.");
}

function isReservedSlug(slug) {
    // Every first segment of a clean route is reserved so it never becomes a restaurant slug.
    if (Object.prototype.hasOwnProperty.call(CLEAN_ROUTES, "/" + slug)) return true;
    return ["pages", "js", "css", "public", "assets", "api", "app"].includes(slug);
}

function getRestaurantSlug(pathname) {
    const match = pathname.match(/^\/([^/?.]+)\/?$/);
    if (!match) return "";

    let slug;
    try {
        slug = decodeURIComponent(match[1]).toLowerCase();
    } catch {
        return "";
    }

    if (isReservedSlug(slug)) return "";
    return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ? slug : "";
}

function redirect(url, status) {
    return new Response(null, {
        status,
        headers: { Location: url.toString(), "Cache-Control": "public, max-age=3600" },
    });
}

function serveAsset(env, request, url, filePath) {
    url.pathname = filePath;
    return env.ASSETS.fetch(new Request(url, request));
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const methodOk = ["GET", "HEAD"].includes(request.method);
        const rawPath = url.pathname;
        const path = normalizePath(rawPath);
        const lowerPath = path.toLowerCase();

        if (methodOk) {
            // 1) Legacy /Pages/*.html -> clean canonical (301, keeps ?query)
            if (lowerPath.startsWith("/pages/")) {
                const file = lowerPath.slice("/pages/".length);
                const canonical = CANONICAL_BY_FILE[file];
                if (canonical) {
                    url.pathname = canonical;
                    return redirect(url, 301);
                }
                // Unknown file under /Pages/: serve as-is (lets real 404s surface).
                return env.ASSETS.fetch(request);
            }

            // 2) Trailing-slash canonical: /login/ -> /login
            if (rawPath !== path) {
                url.pathname = path;
                return redirect(url, 301);
            }

            // 3) Root .html: /Login.html -> /login
            const htmlAtRoot = lowerPath.match(/^\/([^/]+)\.html$/);
            if (htmlAtRoot) {
                const canonical = CANONICAL_BY_FILE[htmlAtRoot[1] + ".html"];
                if (canonical) {
                    url.pathname = canonical;
                    return redirect(url, 301);
                }
            }

            // 4) Clean routes: /login -> /Pages/Login.html (internal rewrite, URL stays clean)
            if (Object.prototype.hasOwnProperty.call(CLEAN_ROUTES, lowerPath)) {
                return serveAsset(env, request, url, CLEAN_ROUTES[lowerPath]);
            }

            // 5) Host-based home pages
            if (path === "/") {
                if (isAppHost(url.hostname)) {
                    return serveAsset(env, request, url, "/Pages/AdminDashboard.html");
                }
                return serveAsset(env, request, url, "/Pages/Landing.html");
            }

            // 6) Public restaurant menus only on the main domain (never on app.*)
            if (!isAppHost(url.hostname)) {
                const slug = getRestaurantSlug(path);
                if (slug) {
                    url.pathname = "/Pages/Menu.html";
                    url.searchParams.set("slug", slug);
                    url.searchParams.set("mode", "public");
                    return env.ASSETS.fetch(new Request(url, request));
                }
            }
        }

        return env.ASSETS.fetch(request);
    },
};
