const CACHE_NAME = "mazaq-waiter-shell-v4";
const APP_SHELL = [
    "/waiter",
    "/css/local-fonts.css",
    "/css/pages/waiter.css",
    "/js/theme-init.js",
    "/js/supabase-config.js",
    "/js/employee-auth.js",
    "/js/waiter-dashboard.js",
    "/js/waiter-push.js",
    "/js/waiter-pwa.js",
    "/waiter-icon.svg",
];

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)),
    );
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys
                    .filter((key) => key.startsWith("mazaq-waiter-shell-") && key !== CACHE_NAME)
                    .map((key) => caches.delete(key)),
            ),
        ),
    );
});

self.addEventListener("fetch", (event) => {
    const request = event.request;
    if (request.method !== "GET") return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;
    if (url.pathname.startsWith("/rest/v1/") || url.pathname.startsWith("/auth/v1/") || url.pathname.startsWith("/realtime/v1/")) return;

    event.respondWith(
        caches.match(request).then((cached) => {
            const networkRequest = fetch(request)
                .then((response) => {
                    if (response.ok && response.type === "basic") {
                        const copy = response.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
                    }
                    return response;
                })
                .catch(() => cached || caches.match("/waiter"));

            return cached || networkRequest;
        }),
    );
});

self.addEventListener("push", (event) => {
    let payload = {};
    try {
        payload = event.data?.json() || {};
    } catch (error) {
        console.warn("Waiter Push payload could not be parsed:", error);
    }

    event.waitUntil((async function () {
        const clientsList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        const isCustomerReward = payload.type === "customer_reward";
        const visibleClient = clientsList.find((client) => {
            const path = new URL(client.url).pathname;
            return client.visibilityState === "visible" && (
                isCustomerReward
                    ? path.endsWith("/Pages/Menu.html") || path === "/"
                    : path.endsWith("/waiter") || path.endsWith("/Pages/WaiterDashboard.html")
            );
        });
        if (visibleClient) {
            visibleClient.postMessage({
                type: isCustomerReward ? "CUSTOMER_REWARD_PUSH_RECEIVED" : "WAITER_PUSH_RECEIVED",
                payload,
            });
            console.info("Push received while the matching app is visible.");
            return;
        }

        console.info("Showing background Push notification.");
        await self.registration.showNotification(payload.title || "نداء جديد", {
            body: payload.body || "لديك إشعار جديد.",
            icon: "/waiter-icon.svg",
            badge: "/waiter-icon.svg",
            tag: payload.tag || (isCustomerReward ? "customer-reward" : "waiter-call"),
            renotify: true,
            data: { url: payload.url || "/waiter" },
        });
    })());
});

self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    const targetUrl = event.notification.data?.url || "/waiter";
    event.waitUntil((async function () {
        const clientsList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        const existingClient = clientsList.find((client) => new URL(client.url).pathname === targetUrl);
        if (existingClient) return existingClient.focus();
        return self.clients.openWindow(targetUrl);
    })());
});
