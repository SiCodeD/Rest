(function () {
  "use strict";

  const client = window.supabase;
  if (!client || typeof client.from !== "function") return;

  // Order/operations tables stay writable so existing orders can be finished.
  const OPERATIONAL_TABLES = new Set(["orders", "order_items", "notifications", "profiles", "waiter_calls"]);
  const WRITE_METHODS = new Set(["insert", "update", "upsert", "delete"]);
  const BLOCKED_RPC = /^admin_(save|delete|set|adjust)_/;
  const BLOCKED_MESSAGE = "انتهى اشتراكك. التعديلات متوقفة حتى تجدد اشتراكك.";

  let readOnly = false;
  let lastNotice = 0;

  function notifyBlocked() {
    const now = Date.now();
    if (now - lastNotice < 2000) return;
    lastNotice = now;
    window.Notifications?.info?.("اشتراك منتهي", BLOCKED_MESSAGE);
  }

  function blockedResult() {
    notifyBlocked();
    return { data: null, error: { message: BLOCKED_MESSAGE, code: "SUBSCRIPTION_EXPIRED" }, status: 403 };
  }

  function blockedBuilder() {
    const handler = {
      get(_target, prop) {
        if (prop === "then") {
          return (resolve, reject) => Promise.resolve(blockedResult()).then(resolve, reject);
        }
        return () => proxy;
      },
    };
    const proxy = new Proxy(function () {}, handler);
    return proxy;
  }

  const originalFrom = client.from.bind(client);
  client.from = function (table) {
    const builder = originalFrom(table);
    if (OPERATIONAL_TABLES.has(String(table))) return builder;
    return new Proxy(builder, {
      get(target, prop, receiver) {
        if (readOnly && WRITE_METHODS.has(prop)) return () => blockedBuilder();
        const value = Reflect.get(target, prop, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  };

  if (typeof client.rpc === "function") {
    const originalRpc = client.rpc.bind(client);
    client.rpc = function (name, ...args) {
      if (readOnly && BLOCKED_RPC.test(String(name))) return blockedBuilder();
      return originalRpc(name, ...args);
    };
  }

  function renewSubscription() {
    if (window.FeatureGate?.planNavigation) return window.FeatureGate.planNavigation();
    window.dispatchEvent(new CustomEvent("mersalak:upgrade-plan"));
  }

  function showBanner() {
    if (document.getElementById("subscriptionExpiredBanner")) return;
    const host = document.querySelector(".main-shell");
    if (!host) return;
    const banner = document.createElement("div");
    banner.id = "subscriptionExpiredBanner";
    banner.setAttribute("role", "alert");
    banner.style.cssText =
      "display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;" +
      "margin:0 0 16px;padding:14px 18px;border-radius:14px;border:1px solid rgba(220,38,38,.35);" +
      "background:rgba(220,38,38,.08);";
    banner.innerHTML =
      '<div><strong style="display:block;font-size:15px">انتهى اشتراكك</strong>' +
      '<span style="font-size:13px;opacity:.85">يمكنك عرض بيانات مطعمك، لكن استقبال الطلبات والتعديلات متوقف حتى تجدد اشتراكك.</span></div>' +
      '<button type="button" class="button-primary" id="subscriptionRenewButton">تجديد الاشتراك</button>';
    host.insertBefore(banner, host.firstChild);
    banner.querySelector("#subscriptionRenewButton").addEventListener("click", renewSubscription);
  }

  const RECHECK_MS = 60000;
  const MAX_TIMER_MS = 2147483647;
  let restaurantId = null;
  let expiryTimer = null;
  let checking = false;

  function hideBanner() {
    document.getElementById("subscriptionExpiredBanner")?.remove();
  }

  function applyState(disabled) {
    if (disabled === readOnly) return;
    readOnly = disabled;
    if (disabled) {
      document.documentElement.dataset.subscriptionReadOnly = "true";
      showBanner();
    } else {
      delete document.documentElement.dataset.subscriptionReadOnly;
      hideBanner();
    }
    window.FeatureGate?.apply?.().catch?.(() => {});
    window.dispatchEvent(new CustomEvent("mersalak:subscription-state", { detail: { readOnly } }));
  }

  // Schedules a re-check right after the end of the current trial/period.
  async function scheduleExpiryTimer() {
    clearTimeout(expiryTimer);
    expiryTimer = null;
    try {
      const { data, error } = await client.rpc("get_restaurant_entitlements");
      const sub = !error ? data?.subscription : null;
      if (!sub) return;
      const end = sub.status === "trialing" ? sub.trial_ends_at : sub.status === "active" ? sub.current_period_end : null;
      const endMs = end ? new Date(end).getTime() : NaN;
      if (!Number.isFinite(endMs)) return;
      const delay = endMs - Date.now() + 1000;
      if (delay <= 0) return;
      expiryTimer = setTimeout(refresh, Math.min(delay, MAX_TIMER_MS));
    } catch (error) {
      console.warn("Subscription expiry timer unavailable", error);
    }
  }

  async function refresh() {
    if (checking || !restaurantId) return;
    checking = true;
    try {
      const { data, error } = await client.rpc("get_restaurant_order_access", { p_restaurant_id: restaurantId });
      if (!error && data) applyState(data.order_enabled === false);
      await scheduleExpiryTimer();
    } catch (error) {
      console.warn("Subscription state unavailable", error);
    } finally {
      checking = false;
    }
  }

  async function init() {
    try {
      const user = await window.Auth?.getCurrentUser?.();
      restaurantId = user?.restaurantId || user?.restaurant_id;
      if (!restaurantId) return;
      await refresh();
      setInterval(() => {
        if (!document.hidden) refresh();
      }, RECHECK_MS);
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden) refresh();
      });
    } catch (error) {
      console.warn("Subscription state unavailable", error);
    }
  }
  window.SubscriptionState = { isReadOnly: () => readOnly, renewSubscription };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
