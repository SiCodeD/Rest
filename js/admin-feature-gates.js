(function () {
  "use strict";

  const metadata = {
    customer_management: {
      title: "إدارة العملاء غير متاحة في خطتك",
      description: "قم بترقية خطتك للوصول إلى إدارة العملاء وملفات العملاء.",
      requiredPlan: "Professional",
    },
    customer_profile: {
      title: "ملفات العملاء غير متاحة في خطتك",
      description: "قم بترقية خطتك للوصول إلى ملفات العملاء وتفاصيلهم.",
      requiredPlan: "Professional",
    },
    feedback: {
      title: "الملاحظات والتقييمات غير متاحة في خطتك",
      description: "قم بترقية خطتك للوصول إلى ملاحظات وتقييمات العملاء.",
      requiredPlan: "Professional",
    },
    loyalty: {
      title: "الولاء غير متاح في خطتك",
      description: "قم بالترقية للوصول إلى نظام النقاط والمستويات.",
      requiredPlan: "Business",
    },
    rewards: {
      title: "المكافآت غير متاحة في خطتك",
      description: "قم بالترقية للوصول إلى المكافآت واستبدالها.",
      requiredPlan: "Business",
    },
    missions: {
      title: "المهام غير متاحة في خطتك",
      description: "قم بالترقية للوصول إلى المهام وتحفيز العملاء.",
      requiredPlan: "Business",
    },
    customer_reports: {
      title: "تقارير العملاء غير متاحة في خطتك",
      description: "قم بالترقية للوصول إلى تحليلات وتقارير العملاء.",
      requiredPlan: "Business",
    },
  };

  const gatedSections = {
    customers: "customer_management",
    loyalty: "loyalty",
    rewards: "rewards",
    missions: "missions",
  };

  let contextKey = null;
  let access = new Map();
  let loadPromise = null;

  function normalizeKey(value) {
    return String(value || "").trim().toLowerCase();
  }

  async function getContextKey() {
    try {
      const user = await window.Auth?.getCurrentUser?.();
      return String(user?.restaurantId || user?.restaurant_id || "session");
    } catch (error) {
      console.warn("Feature access context unavailable", error);
      return "session";
    }
  }

  function collectFeatureMap(payload) {
    const result = new Map();
    const visit = (value) => {
      if (!value) return;
      if (Array.isArray(value)) {
        value.forEach((item) => {
          if (!item || typeof item !== "object") return;
          const key = item.feature_key || item.featureKey || item.key;
          const flag = item.enabled ?? item.is_enabled ?? item.allowed ?? item.can_use;
          if (key && typeof flag === "boolean") result.set(normalizeKey(key), flag);
          visit(item.features);
          visit(item.entitlements);
        });
        return;
      }
      if (typeof value !== "object") return;
      [value.features, value.entitlements, value.feature_access].forEach(visit);
      Object.entries(value).forEach(([key, flag]) => {
        if (typeof flag === "boolean") result.set(normalizeKey(key), flag);
      });
    };
    visit(payload);
    return result;
  }

  async function loadAccess() {
    const nextContextKey = await getContextKey();
    if (loadPromise && nextContextKey === contextKey) return loadPromise;
    contextKey = nextContextKey;
    access = new Map();
    loadPromise = (async () => {
      if (!window.supabase?.rpc) return access;
      const { data, error } = await window.supabase.rpc("get_restaurant_entitlements");
      if (!error) access = collectFeatureMap(data);
      else console.warn("Feature entitlements could not be loaded", error);
      return access;
    })().finally(() => {
      loadPromise = null;
    });
    return loadPromise;
  }

  async function hasFeature(featureKey) {
    const key = normalizeKey(featureKey);
    const featureMap = await loadAccess();
    if (featureMap.has(key)) return featureMap.get(key);
    if (!window.supabase?.rpc) return true;
    const { data, error } = await window.supabase.rpc("can_use_feature", { p_feature_key: key });
    if (error) {
      console.warn(`Feature access check failed for ${key}`, error);
      return true;
    }
    const allowed = Boolean(data);
    access.set(key, allowed);
    return allowed;
  }

  function planNavigation() {
    window.dispatchEvent(new CustomEvent("mersalak:upgrade-plan"));
    if (window.Notifications?.info) {
      window.Notifications.info("ترقية الخطة", "سيتم فتح إدارة الخطط هنا عند تفعيلها.");
    }
  }

  function lockedMarkup(featureKey) {
    const item = metadata[featureKey] || {
      title: "الميزة غير متاحة في خطتك",
      description: "قم بالترقية للوصول إلى هذه الميزة.",
      requiredPlan: "Professional",
    };
    return `<div class="locked-feature" role="status" data-locked-feature="${featureKey}">
      <div class="locked-feature-icon" aria-hidden="true"><i data-lucide="lock-keyhole" class="lucide-icon"></i></div>
      <span class="locked-feature-eyebrow">متاحة ابتداءً من خطة ${item.requiredPlan}</span>
      <h3>${item.title}</h3>
      <p>${item.description}</p>
      <div class="locked-feature-actions">
        <button class="button-primary locked-feature-upgrade" type="button">ترقية الخطة</button>
        <button class="button-secondary locked-feature-plans" type="button">عرض الخطط</button>
      </div>
    </div>`;
  }

  function renderLockedFeature(container, featureKey) {
    if (!container) return;
    container.innerHTML = lockedMarkup(featureKey);
    container.querySelector(".locked-feature-upgrade")?.addEventListener("click", planNavigation);
    container.querySelector(".locked-feature-plans")?.addEventListener("click", planNavigation);
    window.lucide?.createIcons?.();
  }

  function lockSection(sectionName, featureKey) {
    const section = document.getElementById(`section-${sectionName}`);
    const stack = section?.querySelector(":scope > .section-stack");
    if (!stack || stack.dataset.featureGateApplied === featureKey) return;
    stack.dataset.featureGateApplied = featureKey;
    const header = stack.firstElementChild;
    if (header) header.querySelectorAll("button, input, select").forEach((node) => { node.hidden = true; });
    Array.from(stack.children).slice(1).forEach((node) => { node.hidden = true; });
    const locked = document.createElement("div");
    locked.className = "locked-feature-slot";
    stack.appendChild(locked);
    renderLockedFeature(locked, featureKey);
  }

  function markSidebarLocked(sectionName, locked) {
    document.querySelectorAll(`.sidebar-link[data-section="${sectionName}"]`).forEach((item) => {
      item.classList.toggle("is-locked", locked);
      item.setAttribute("aria-disabled", locked ? "true" : "false");
      item.title = locked ? `${item.textContent.trim()} — ميزة مقفلة حسب الخطة` : "";
      let badge = item.querySelector(".sidebar-lock-badge");
      if (locked && !badge) {
        badge = document.createElement("span");
        badge.className = "sidebar-lock-badge";
        badge.setAttribute("aria-label", "مقفلة حسب الخطة");
        badge.innerHTML = '<i data-lucide="lock-keyhole" class="lucide-icon"></i>';
        item.appendChild(badge);
      }
      if (!locked && badge) badge.remove();
    });
    window.lucide?.createIcons?.();
  }

  async function apply() {
    await ready;
    for (const [sectionName, featureKey] of Object.entries(gatedSections)) {
      const allowed = await hasFeature(featureKey);
      if (!allowed) lockSection(sectionName, featureKey);
      markSidebarLocked(sectionName, !allowed);
    }
    const customerReportsAllowed = await hasFeature("customer_reports");
    const reportsButton = document.getElementById("reportsCustomersMode");
    reportsButton?.classList.toggle("is-locked", !customerReportsAllowed);
    reportsButton?.setAttribute("title", customerReportsAllowed ? "" : "تقارير العملاء مقفلة حسب الخطة");
    const customerContent = document.getElementById("customerReportsContent");
    if (!customerReportsAllowed && customerContent) renderLockedFeature(customerContent, "customer_reports");
  }

  const ready = loadAccess();
  window.FeatureGate = {
    metadata,
    ready,
    hasFeature,
    renderLockedFeature,
    planNavigation,
    isLocked: (featureKey) => access.has(normalizeKey(featureKey)) && access.get(normalizeKey(featureKey)) === false,
    apply,
  };

  document.addEventListener("DOMContentLoaded", apply);
})();
