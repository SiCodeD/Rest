(function () {
    "use strict";

    const FUNCTION_URL = typeof SUPABASE_URL === "string"
        ? SUPABASE_URL.replace(/\/$/, "") + "/functions/v1/send-waiter-push"
        : "";

    function isSupported() {
        return Boolean(
            window.isSecureContext
            && "Notification" in window
            && "serviceWorker" in navigator
            && "PushManager" in window
        );
    }

    function base64UrlToUint8Array(value) {
        const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4);
        const binary = atob(padded);
        return Uint8Array.from(binary, function (character) { return character.charCodeAt(0); });
    }

    async function requestPermission() {
        if (!("Notification" in window)) return "unsupported";
        if (Notification.permission !== "default") return Notification.permission;
        console.info("Requesting waiter notification permission after user action.");
        return Notification.requestPermission();
    }

    async function getPublicVapidKey() {
        const response = await fetch(FUNCTION_URL, { method: "GET" });
        if (!response.ok) throw new Error("Could not load Push configuration.");
        const payload = await response.json();
        if (!payload?.publicKey) throw new Error("Push is not configured on the server.");
        return payload.publicKey;
    }

    async function enableForSession(session) {
        const permission = await requestPermission();
        console.info("Waiter notification permission:", permission);
        if (permission !== "granted") return { permission: permission, pushEnabled: false };
        if (!isSupported()) {
            console.warn("Web Push is not supported by this browser or context.");
            return { permission: permission, pushEnabled: false, reason: "unsupported" };
        }
        if (!session?.sessionToken) {
            console.warn("Persistent waiter session has no device token; a fresh login is required for Web Push.");
            return { permission: permission, pushEnabled: false, reason: "session-token" };
        }

        const registration = await navigator.serviceWorker.ready;
        const publicKey = await getPublicVapidKey();
        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
            subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: base64UrlToUint8Array(publicKey),
            });
            console.info("Waiter Push subscription created.");
        } else {
            console.info("Existing waiter Push subscription found.");
        }

        const json = subscription.toJSON();
        const { error } = await supabase.rpc("upsert_waiter_push_subscription", {
            p_restaurant_id: session.restaurantId,
            p_employee_id: session.employeeId,
            p_session_token: session.sessionToken,
            p_endpoint: subscription.endpoint,
            p_p256dh_key: json.keys?.p256dh,
            p_auth_key: json.keys?.auth,
            p_user_agent: navigator.userAgent,
        });
        if (error) throw error;
        console.info("Waiter Push subscription saved for restaurant:", session.restaurantId);
        return { permission: permission, pushEnabled: true };
    }

    async function unregisterCurrentDevice(session) {
        if (!("serviceWorker" in navigator) || !session?.sessionToken) return;
        const registration = await navigator.serviceWorker.getRegistration("/");
        const subscription = await registration?.pushManager.getSubscription();
        if (!subscription) return;

        try {
            const { error } = await supabase.rpc("remove_waiter_push_subscription", {
                p_restaurant_id: session.restaurantId,
                p_employee_id: session.employeeId,
                p_session_token: session.sessionToken,
                p_endpoint: subscription.endpoint,
            });
            if (error) throw error;
            await subscription.unsubscribe();
            console.info("Waiter Push subscription removed from this device.");
        } catch (error) {
            console.warn("Could not remove waiter Push subscription:", error);
            throw error;
        }
    }

    window.WaiterPush = { isSupported, enableForSession, unregisterCurrentDevice };
})();
