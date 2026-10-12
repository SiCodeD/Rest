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

const MENU_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function jsonResponse(payload, status = 200) {
    return new Response(JSON.stringify(payload), {
        status,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
        },
    });
}

async function authorizeMenuImageWrite(request, env, restaurantId) {
    const authorization = request.headers.get("Authorization") || "";
    const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return jsonResponse({ error: "Authentication required." }, 401);
    if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
        return jsonResponse({ error: "Image service is not configured." }, 503);
    }

    const supabaseUrl = env.SUPABASE_URL.replace(/\/+$/, "");
    let authResponse;
    try {
        authResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
            headers: {
                apikey: env.SUPABASE_ANON_KEY,
                Authorization: `Bearer ${token}`,
            },
        });
    } catch (error) {
        console.error("Menu image authentication request failed:", error);
        return jsonResponse({ error: "Authentication service is unavailable." }, 502);
    }
    if (authResponse.status === 401 || authResponse.status === 403) {
        return jsonResponse({ error: "Invalid or expired session." }, 401);
    }
    if (!authResponse.ok) {
        return jsonResponse({ error: "Could not verify the current session." }, 502);
    }

    let user;
    try {
        user = await authResponse.json();
    } catch {
        return jsonResponse({ error: "Invalid authentication response." }, 502);
    }
    if (!user?.id) return jsonResponse({ error: "Invalid authentication response." }, 502);

    const profileUrl = new URL(`${supabaseUrl}/rest/v1/profiles`);
    profileUrl.searchParams.set("id", `eq.${user.id}`);
    profileUrl.searchParams.set("select", "role,restaurant_id");
    let profileResponse;
    try {
        profileResponse = await fetch(profileUrl, {
            headers: {
                apikey: env.SUPABASE_ANON_KEY,
                Authorization: `Bearer ${token}`,
            },
        });
    } catch (error) {
        console.error("Menu image profile request failed:", error);
        return jsonResponse({ error: "Authorization service is unavailable." }, 502);
    }
    if (!profileResponse.ok) {
        return jsonResponse({ error: "Could not verify restaurant permissions." }, 502);
    }

    let profiles;
    try {
        profiles = await profileResponse.json();
    } catch {
        return jsonResponse({ error: "Invalid authorization response." }, 502);
    }
    const profile = Array.isArray(profiles) ? profiles[0] : null;
    if (
        !profile ||
        !["admin", "super-admin"].includes(profile.role) ||
        (profile.role === "admin" && profile.restaurant_id !== restaurantId)
    ) {
        return jsonResponse({ error: "You cannot manage images for this restaurant." }, 403);
    }
    return null;
}

async function readLimitedBody(request, maxBytes) {
    const contentLength = Number(request.headers.get("Content-Length"));
    if (Number.isFinite(contentLength) && contentLength > maxBytes) return null;
    if (!request.body) return null;

    const reader = request.body.getReader();
    const chunks = [];
    let totalBytes = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.byteLength;
        if (totalBytes > maxBytes) {
            await reader.cancel();
            return null;
        }
        chunks.push(value);
    }
    if (!totalBytes) return null;

    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return bytes;
}

function isJpeg(bytes) {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

async function handleMenuImageRequest(request, env, url) {
    const imagePath = url.pathname.match(/^\/images\/menu\/([^/]+)\/([^/]+)\/([^/]+)$/);
    if (imagePath && ["GET", "HEAD"].includes(request.method)) {
        const [, restaurantId, itemId, version] = imagePath;
        if (
            !UUID_PATTERN.test(restaurantId) ||
            !UUID_PATTERN.test(itemId) ||
            !/^[0-9a-f-]{36}\.jpg$/i.test(version) ||
            !env.MENU_IMAGES
        ) {
            return new Response("Not found.", { status: 404 });
        }

        let object;
        try {
            object = await env.MENU_IMAGES.get(`${restaurantId}/${itemId}/${version}`);
        } catch (error) {
            console.error("Menu image read failed:", error);
            return new Response("Image storage is temporarily unavailable.", { status: 502 });
        }
        if (!object) return new Response("Not found.", { status: 404 });

        const headers = new Headers();
        object.writeHttpMetadata(headers);
        headers.set("Cache-Control", "public, max-age=31536000, immutable");
        headers.set("X-Content-Type-Options", "nosniff");
        headers.set("Content-Disposition", "inline");
        return new Response(request.method === "HEAD" ? null : object.body, { headers });
    }

    const apiPath = url.pathname.match(/^\/api\/menu-images\/([^/]+)\/([^/]+)(?:\/([^/]+))?$/);
    if (!apiPath) return null;
    const [, restaurantId, itemId, version] = apiPath;
    if (!UUID_PATTERN.test(restaurantId) || !UUID_PATTERN.test(itemId)) {
        return jsonResponse({ error: "Invalid image path." }, 400);
    }
    if (!env.MENU_IMAGES) {
        return jsonResponse({ error: "Image storage is not configured." }, 503);
    }

    const authError = await authorizeMenuImageWrite(request, env, restaurantId);
    if (authError) return authError;

    if (request.method === "POST" && !version) {
        if ((request.headers.get("Content-Type") || "").split(";")[0].trim() !== "image/jpeg") {
            return jsonResponse({ error: "Only JPEG images are accepted." }, 415);
        }
        let bytes;
        try {
            bytes = await readLimitedBody(request, MENU_IMAGE_MAX_BYTES);
        } catch (error) {
            console.error("Menu image upload body could not be read:", error);
            return jsonResponse({ error: "Could not read the uploaded image." }, 400);
        }
        if (!bytes) return jsonResponse({ error: "Image is empty or exceeds the 5 MB limit." }, 413);
        if (!isJpeg(bytes)) return jsonResponse({ error: "The uploaded file is not a valid JPEG image." }, 415);

        const imageVersion = `${crypto.randomUUID()}.jpg`;
        const key = `${restaurantId}/${itemId}/${imageVersion}`;
        try {
            await env.MENU_IMAGES.put(key, bytes, {
                httpMetadata: {
                    contentType: "image/jpeg",
                    cacheControl: "public, max-age=31536000, immutable",
                },
            });
        } catch (error) {
            console.error("Menu image upload failed:", error);
            return jsonResponse({ error: "Could not save the image to storage." }, 502);
        }
        return jsonResponse({
            url: `/images/menu/${restaurantId}/${itemId}/${imageVersion}`,
        }, 201);
    }

    if (request.method === "DELETE" && version && /^[0-9a-f-]{36}\.jpg$/i.test(version)) {
        try {
            await env.MENU_IMAGES.delete(`${restaurantId}/${itemId}/${version}`);
        } catch (error) {
            console.error("Menu image deletion failed:", error);
            return jsonResponse({ error: "Could not remove the image from storage." }, 502);
        }
        return new Response(null, { status: 204 });
    }

    return jsonResponse({ error: "Method or image path not allowed." }, 405);
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const methodOk = ["GET", "HEAD"].includes(request.method);
        const rawPath = url.pathname;
        const path = normalizePath(rawPath);
        const lowerPath = path.toLowerCase();

        if (path.startsWith("/api/menu-images/") || path.startsWith("/images/menu/")) {
            const imageResponse = await handleMenuImageRequest(request, env, url);
            if (imageResponse) return imageResponse;
        }

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
