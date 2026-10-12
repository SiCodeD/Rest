(function () {
    "use strict";

    const FUNCTION_URL = typeof SUPABASE_URL === "string"
        ? SUPABASE_URL.replace(/\/$/, "") + "/functions/v1/send-waiter-push"
        : "";
    const button = () => document.getElementById("customer-reward-push-button");
    const wrap = () => document.getElementById("customer-reward-push-wrap");

    function base64UrlToUint8Array(value) {
        const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4);
        return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
    }

    async function updateButton() {
        const element = button();
        if (!element) return;
        const hasSession = typeof getCustomerSessionToken === "function"
            && Boolean(getCustomerSessionToken());
        wrap()?.classList.toggle("hidden", !hasSession);
        if (!hasSession) return;

        let subscription = null;
        if ("serviceWorker" in navigator) {
            const registration = await navigator.serviceWorker.getRegistration("/");
            subscription = await registration?.pushManager.getSubscription();
        }
        element.textContent = subscription
            ? "إشعارات النقاط مفعّلة"
            : "فعّل إشعارات النقاط";
        element.disabled = !window.isSecureContext
            || !("Notification" in window)
            || !("PushManager" in window)
            || Notification.permission === "denied";
        if (Notification.permission === "denied") {
            element.textContent = "الإشعارات محظورة من إعدادات المتصفح";
        }
    }

    async function isEnabled() {
        if (!("Notification" in window) || Notification.permission !== "granted"
            || !("serviceWorker" in navigator)) return false;
        const registration = await navigator.serviceWorker.getRegistration("/");
        return Boolean(await registration?.pushManager.getSubscription());
    }

    async function enable() {
        const element = button();
        const sessionToken = typeof getCustomerSessionToken === "function"
            ? getCustomerSessionToken()
            : "";
        if (!sessionToken || !window.supabase || !FUNCTION_URL) {
            window.showToast?.("سجّل الدخول إلى حسابك أولًا.");
            return;
        }
        if (!window.isSecureContext || !("Notification" in window) || !("PushManager" in window)) {
            window.showToast?.("الإشعارات غير مدعومة في هذا المتصفح.");
            return;
        }

        if (element) {
            element.disabled = true;
            element.textContent = "جارٍ تفعيل الإشعارات...";
        }
        try {
            const permission = Notification.permission === "default"
                ? await Notification.requestPermission()
                : Notification.permission;
            if (permission !== "granted") {
                throw new Error(permission === "denied"
                    ? "اسمح بالإشعارات من إعدادات المتصفح."
                    : "لم يتم السماح بالإشعارات.");
            }

            const registration = await navigator.serviceWorker.register("/waiter-sw.js", { scope: "/" });
            const response = await fetch(FUNCTION_URL);
            if (!response.ok) throw new Error("خدمة الإشعارات غير مهيأة على الخادم.");
            const config = await response.json();
            if (!config.publicKey) throw new Error("مفتاح الإشعارات غير متوفر.");

            let subscription = await registration.pushManager.getSubscription();
            if (!subscription) {
                subscription = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: base64UrlToUint8Array(config.publicKey),
                });
            }
            const keys = subscription.toJSON().keys || {};
            const { error } = await window.supabase.rpc("upsert_customer_reward_push_subscription", {
                p_restaurant_id: MENU_RESTAURANT_ID,
                p_session_token: sessionToken,
                p_endpoint: subscription.endpoint,
                p_p256dh_key: keys.p256dh,
                p_auth_key: keys.auth,
                p_user_agent: navigator.userAgent,
            });
            if (error) throw error;
            window.showToast?.("تم تفعيل إشعارات النقاط.");
            await updateButton();
        } catch (error) {
            console.error("Customer reward push setup failed:", error);
            window.showToast?.(error?.message || "تعذر تفعيل الإشعارات.");
            await updateButton();
        }
    }

    async function removeCurrentDevice() {
        if (!("serviceWorker" in navigator) || !window.supabase) return;
        const sessionToken = typeof getCustomerSessionToken === "function"
            ? getCustomerSessionToken()
            : "";
        const registration = await navigator.serviceWorker.getRegistration("/");
        const subscription = await registration?.pushManager.getSubscription();
        if (!subscription) return;
        try {
            if (sessionToken && MENU_RESTAURANT_ID) {
                const { error } = await window.supabase.rpc("remove_customer_reward_push_subscription", {
                    p_restaurant_id: MENU_RESTAURANT_ID,
                    p_session_token: sessionToken,
                    p_endpoint: subscription.endpoint,
                });
                if (error) throw error;
            }
        } finally {
            await subscription.unsubscribe();
        }
    }

    if ("serviceWorker" in navigator) {
        navigator.serviceWorker.addEventListener("message", (event) => {
            if (event.data?.type !== "CUSTOMER_REWARD_PUSH_RECEIVED") return;
            window.showToast?.(event.data.payload?.body || "ربحت نقاطًا جديدة!");
            const modal = document.getElementById("loyalty-modal");
            if (modal && !modal.classList.contains("pointer-events-none")) {
                window.openLoyaltyModal?.();
            }
        });
    }

    window.enableCustomerRewardPush = enable;
    window.CustomerRewardPush = { updateButton, removeCurrentDevice, isEnabled };
    document.addEventListener("DOMContentLoaded", () => {
        updateButton().catch((error) => console.warn("Reward notification state unavailable:", error));
    });
})();
