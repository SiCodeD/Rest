(function () {
    "use strict";

    const installButton = document.getElementById("waiterInstallButton");
    const notificationButton = document.getElementById("waiterNotificationButton");

    const PUSH_FUNCTION_URL =
        "https://iseiqumfkcqynihehzfy.supabase.co/functions/v1/send-waiter-push";

    let deferredPrompt = null;

    function isStandalone() {
        return (
            window.matchMedia?.("(display-mode: standalone)").matches ||
            window.navigator.standalone === true
        );
    }

    function setInstallVisibility(visible) {
        if (!installButton) return;
        installButton.hidden = !visible;
    }

    async function updateNotificationButton() {
        if (!notificationButton) return;

        if (window.WaiterDashboard?.updateNotificationButton) {
            window.WaiterDashboard.updateNotificationButton();
            return;
        }

        if (
            !("Notification" in window) ||
            !("serviceWorker" in navigator)
        ) {
            notificationButton.hidden = true;
            return;
        }

        notificationButton.hidden = false;

        if (Notification.permission === "denied") {
            notificationButton.innerHTML =
                '<span class="material-symbols-outlined">notifications_off</span><span class="waiter-btn-label">الإشعارات محظورة</span>';

            return;
        }

        if (Notification.permission !== "granted") {
            notificationButton.innerHTML =
                '<span class="material-symbols-outlined">notifications</span><span class="waiter-btn-label">تفعيل الإشعارات</span>';

            return;
        }

        const pushEnabled = await isPushEnabled();

        if (pushEnabled) {
            notificationButton.innerHTML =
                '<span class="material-symbols-outlined">notifications_active</span><span class="waiter-btn-label">الإشعارات مفعّلة</span>';
        } else {
            notificationButton.innerHTML =
                '<span class="material-symbols-outlined">notifications</span><span class="waiter-btn-label">تفعيل الإشعارات</span>';
        }
    }

    function registerServiceWorker() {
        if (!("serviceWorker" in navigator)) return;

        window.addEventListener("load", function () {
            navigator.serviceWorker
                .register("/waiter-sw.js", { scope: "/" })
                .then(function (registration) {
                    console.info(
                        "Waiter service worker registered:",
                        registration.scope
                    );

                    updateNotificationButton();
                })
                .catch(function (error) {
                    console.warn(
                        "Waiter PWA service worker registration failed:",
                        error
                    );
                });
        });

        navigator.serviceWorker.addEventListener("message", function (event) {
            if (event.data?.type === "WAITER_PUSH_RECEIVED") {
                console.info(
                    "Waiter Push received:",
                    event.data.payload
                );
            }
        });
    }

    function urlBase64ToUint8Array(base64String) {
        const padding = "=".repeat(
            (4 - (base64String.length % 4)) % 4
        );

        const base64 = (base64String + padding)
            .replace(/-/g, "+")
            .replace(/_/g, "/");

        const rawData = window.atob(base64);

        return Uint8Array.from(
            [...rawData].map(function (character) {
                return character.charCodeAt(0);
            })
        );
    }

    async function getVapidPublicKey() {
        const response = await fetch(PUSH_FUNCTION_URL, {
            method: "GET",
            cache: "no-store",
        });

        if (!response.ok) {
            throw new Error(
                "Failed to load VAPID public key. HTTP " +
                response.status
            );
        }

        const data = await response.json();

        if (!data?.publicKey) {
            throw new Error("VAPID public key is missing.");
        }

        return data.publicKey;
    }

    async function enableNotifications() {
        if (!("Notification" in window)) {
            throw new Error("Notifications are not supported by this browser.");
        }

        if (!("serviceWorker" in navigator)) {
            throw new Error("Service Worker is not supported.");
        }

        if (!window.EmployeeAuth) {
            throw new Error("Employee session system is not available.");
        }

        if (!window.supabase) {
            throw new Error("خدمة الإشعارات غير متاحة.");
        }

        const session = window.EmployeeAuth.getSession();

        if (
            !session?.employeeId ||
            !session?.restaurantId ||
            !session?.sessionToken
        ) {
            throw new Error("No valid waiter device session.");
        }

        if (Notification.permission === "denied") {
            throw new Error(
                "Notifications are blocked. Enable them from browser or device settings."
            );
        }

        const permission = await Notification.requestPermission();

        if (permission !== "granted") {
            throw new Error("Notification permission was not granted.");
        }

        const registration = await navigator.serviceWorker.ready;

        let subscription =
            await registration.pushManager.getSubscription();

        if (!subscription) {
            const publicKey = await getVapidPublicKey();

            subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey:
                    urlBase64ToUint8Array(publicKey),
            });
        }

        const subscriptionJson = subscription.toJSON();

        if (
            !subscriptionJson.endpoint ||
            !subscriptionJson.keys?.p256dh ||
            !subscriptionJson.keys?.auth
        ) {
            throw new Error("Invalid Push subscription.");
        }

        const { data, error } = await window.supabase.rpc(
            "upsert_waiter_push_subscription",
            {
                p_restaurant_id: session.restaurantId,
                p_employee_id: session.employeeId,
                p_session_token: session.sessionToken,
                p_endpoint: subscriptionJson.endpoint,
                p_p256dh_key: subscriptionJson.keys.p256dh,
                p_auth_key: subscriptionJson.keys.auth,
                p_user_agent: navigator.userAgent,
            }
        );

        if (error) throw error;

        console.info(
            "Waiter Push subscription saved:",
            data
        );

        updateNotificationButton();

        return {
            success: true,
            subscription,
        };
    }

    async function unregisterCurrentDevice(session) {
        console.log("🔴 Starting notification disable...", session);

        if (!("serviceWorker" in navigator)) {
            console.log("❌ No service worker support");
            return;
        }

        if (!session?.sessionToken) {
            console.log("❌ No session token");
            return;
        }

        const registration = await navigator.serviceWorker.ready;

        console.log("📱 Service worker registration:", registration);

        const subscription = await registration.pushManager.getSubscription();

        console.log("🔔 Current subscription:", subscription);

        if (!subscription) {
            console.log("⚠️ No subscription found");
            return;
        }

        const endpoint = subscription.endpoint;

        const { error } = await supabase.rpc(
            "remove_waiter_push_subscription",
            {
                p_restaurant_id: session.restaurantId,
                p_employee_id: session.employeeId,
                p_session_token: session.sessionToken,
                p_endpoint: endpoint,
            }
        );

        if (error) {
            console.error("❌ Database removal failed:", error);
            throw error;
        }

        console.log("🗑️ Subscription removed from database");

        const unsubscribed = await subscription.unsubscribe();

        console.log("📵 Browser unsubscribe result:", unsubscribed);
    }

    setInstallVisibility(false);
    registerServiceWorker();
    updateNotificationButton();

    window.addEventListener(
        "beforeinstallprompt",
        function (event) {
            event.preventDefault();
            deferredPrompt = event;
            setInstallVisibility(!isStandalone());
        }
    );

    window.addEventListener("appinstalled", function () {
        deferredPrompt = null;
        setInstallVisibility(false);
    });

    installButton?.addEventListener(
        "click",
        async function () {
            if (!deferredPrompt) return;

            deferredPrompt.prompt();

            const result =
                await deferredPrompt.userChoice;

            if (result.outcome === "accepted") {
                setInstallVisibility(false);
            }

            deferredPrompt = null;
        }
    );

    async function isPushEnabled() {
        if (!("serviceWorker" in navigator)) {
            return false;
        }

        try {
            const registration = await navigator.serviceWorker.ready;
            const subscription =
                await registration.pushManager.getSubscription();

            return !!subscription;
        } catch (error) {
            console.warn(
                "Could not check Push subscription:",
                error
            );

            return false;
        }
    }

    window.WaiterPush = Object.assign({}, window.WaiterPush, {
        enableNotifications,
        unregisterCurrentDevice,
        updateNotificationButton,
        isPushEnabled,
    });
})();