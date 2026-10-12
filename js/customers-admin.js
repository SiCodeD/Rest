// Phase 8 admin customer list and detail view. All customer data is returned by scoped admin RPCs.
(function () {
  "use strict";

  const byId = (id) => document.getElementById(id);
  const fmt = (value) => Number(value || 0).toLocaleString("en-US");
  const date = (value) => value ? new Date(value).toLocaleString("ar", { dateStyle: "medium", timeStyle: "short" }) : "—";
  const money = (value) => `${Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const status = { new: "جديد", accepted: "مقبول", preparing: "قيد التحضير", ready: "جاهز", served: "تم التقديم", cancelled: "ملغى" };
  const activity = { completed_order: "طلب مكتمل", loyalty_transaction: "حركة نقاط", mission_completed: "إكمال مهمة", reward_redeemed: "استبدال مكافأة" };
  const feedback = { excellent: "ممتاز", good: "جيد", acceptable: "مقبول", poor: "سيئ" };

  let page = 0;
  const pageSize = 25;
  let total = 0;
  let loading = false;
  let searchTimer = null;
  let activeProfileCustomerId = null;
  let profileLoadToken = 0;
  let selectedCustomerRating = 0;
  let ratingSaving = false;

  function notify(kind, title, message) {
    if (window.Notifications && typeof Notifications[kind] === "function") Notifications[kind](title, message);
  }

  const CUSTOMER_MANAGEMENT_ERROR = "Customer management is not available on the current plan.";
  const CUSTOMER_MANAGEMENT_TITLE = "الميزة غير متاحة في خطتك";
  const CUSTOMER_MANAGEMENT_MESSAGE = "إدارة العملاء غير متاحة في خطتك الحالية. قم بترقية الخطة للوصول إلى هذه الميزة.";
  const CUSTOMER_PROFILE_ERROR = "Customer profile is not available on the current plan.";
  const CUSTOMER_PROFILE_MESSAGE = "الملف الشخصي للعملاء غير متاح في خطتك الحالية. قم بترقية الخطة للوصول إلى هذه الميزة.";

  function isCustomerManagementUnavailable(error) {
    return String(error?.message || "").includes(CUSTOMER_MANAGEMENT_ERROR);
  }

  function showCustomerError(error, target) {
    if (isCustomerManagementUnavailable(error)) {
      if (target) target.textContent = CUSTOMER_MANAGEMENT_MESSAGE;
      notify("error", CUSTOMER_MANAGEMENT_TITLE, CUSTOMER_MANAGEMENT_MESSAGE);
      return true;
    }
    if (String(error?.message || "").includes(CUSTOMER_PROFILE_ERROR)) {
      if (target) target.textContent = CUSTOMER_PROFILE_MESSAGE;
      notify("error", CUSTOMER_MANAGEMENT_TITLE, CUSTOMER_PROFILE_MESSAGE);
      return true;
    }
    return false;
  }

  function setText(id, value) { const node = byId(id); if (node) node.textContent = value == null ? "—" : value; }

  async function loadCustomers(resetPage) {
    if (!window.supabase || loading) return;
    if (window.FeatureGate && !(await window.FeatureGate.hasFeature("customer_management"))) return;
    if (resetPage) page = 0;
    loading = true;
    const body = byId("customersBody");
    body.innerHTML = '<tr><td colspan="9" class="empty-row">جاري التحميل...</td></tr>';
    try {
      const ordersValue = byId("customersOrdersFilter").value;
      const { data, error } = await supabase.rpc("admin_get_customers", {
        p_search: byId("customersSearch").value.trim() || null,
        p_level_id: byId("customersLevelFilter").value === "all" ? null : byId("customersLevelFilter").value,
        p_activity_filter: byId("customersActivityFilter").value,
        p_has_orders: ordersValue === "all" ? null : ordersValue === "yes",
        p_limit: pageSize,
        p_offset: page * pageSize,
      });
      if (error) throw error;
      const payload = data || {};
      total = Number(payload.total || 0);
      renderCustomers(Array.isArray(payload.customers) ? payload.customers : []);
    } catch (error) {
      console.error("Admin customers load failed", error);
      total = 0;
      body.innerHTML = '<tr><td colspan="9" class="empty-row">تعذر تحميل العملاء. حاول مرة أخرى.</td></tr>';
      if (!showCustomerError(error, body.querySelector(".empty-row"))) {
        notify("error", "خطأ", "تعذر تحميل قائمة العملاء.");
      }
    } finally {
      loading = false;
      updatePager();
    }
  }

  function renderCustomers(rows) {
    const body = byId("customersBody");
    body.innerHTML = "";
    setText("customersCountText", `${fmt(total)} عميل`);
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="9" class="empty-row">لا يوجد عملاء حتى الآن</td></tr>';
      return;
    }
    rows.forEach((customer) => {
      const tr = document.createElement("tr");
      const level = customer.level ? (customer.level.name || "") : "—";
      [customer.displayName || "—", customer.phone || "—", level, fmt(customer.points), fmt(customer.xp), fmt(customer.completedOrders), money(customer.totalSpending), date(customer.lastActivityAt)].forEach((value, index) => {
        const td = document.createElement("td");
        td.textContent = value;
        if (index === 1) td.dir = "ltr";
        tr.appendChild(td);
      });
      const action = document.createElement("td");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "icon-btn";
      button.setAttribute("data-tooltip", "فتح ملف العميل");
      button.setAttribute("aria-label", "فتح ملف العميل");
      button.innerHTML = window.lucideIcon("eye");
      button.addEventListener("click", () => openProfile(customer.id));
      action.appendChild(button);
      tr.appendChild(action);
      body.appendChild(tr);
    });
  }

  function updatePager() {
    const maxPage = Math.max(0, Math.ceil(total / pageSize) - 1);
    setText("customersPageText", total ? `صفحة ${page + 1} من ${maxPage + 1}` : "");
    byId("customersPrevBtn").disabled = page <= 0 || loading;
    byId("customersNextBtn").disabled = page >= maxPage || loading;
  }

  function openModal(id) { byId(id).classList.add("open"); }
  function closeModal(id) { byId(id).classList.remove("open"); }

  async function openProfile(customerId) {
    activeProfileCustomerId = customerId;
    const loadToken = ++profileLoadToken;
    openModal("adminCustomerProfileModal");
    const profileEnabled =
      !window.FeatureGate ||
      (await window.FeatureGate.hasFeature("customer_profile"));
    if (loadToken !== profileLoadToken) return;
    if (!profileEnabled) {
      byId("adminCustomerProfileLoading").hidden = true;
      byId("adminCustomerProfileError").hidden = true;
      byId("adminCustomerProfileContent").hidden = false;
      window.FeatureGate.renderLockedFeature(byId("adminCustomerProfileContent"), "customer_profile");
      return;
    }
    byId("adminCustomerProfileLoading").hidden = false;
    byId("adminCustomerProfileError").hidden = true;
    byId("adminCustomerProfileContent").hidden = true;
    try {
      const [profileResult, ratingResult] = await Promise.all([
        supabase.rpc("admin_get_customer_profile", {
          p_customer_id: customerId,
        }),
        supabase.rpc("admin_get_customer_restaurant_rating", {
          p_customer_id: customerId,
        }),
      ]);
      if (
        loadToken !== profileLoadToken ||
        activeProfileCustomerId !== customerId
      ) return;
      if (profileResult.error || !profileResult.data) {
        throw profileResult.error || new Error("Customer profile not found");
      }
      renderProfile(profileResult.data);
      if (ratingResult.error) {
        console.error("Admin customer rating history load failed", ratingResult.error);
        renderCustomerRestaurantRating(null);
        setCustomerRatingMessage(
          "تعذر تحميل سجل التقييمات. تحقق من تطبيق تحديث قاعدة البيانات ثم أعد المحاولة.",
          true,
        );
      } else {
        renderCustomerRestaurantRating(ratingResult.data);
      }
      byId("adminCustomerProfileLoading").hidden = true;
      byId("adminCustomerProfileContent").hidden = false;
    } catch (error) {
      if (
        loadToken !== profileLoadToken ||
        activeProfileCustomerId !== customerId
      ) return;
      console.error("Admin customer profile load failed", error);
      byId("adminCustomerProfileLoading").hidden = true;
      byId("adminCustomerProfileError").hidden = false;
      if (!showCustomerError(error, byId("adminCustomerProfileError"))) {
        byId("adminCustomerProfileError").textContent =
          "تعذر تحميل ملف العميل وتقييم المطعم. حاول مرة أخرى.";
        notify("error", "خطأ", "تعذر تحميل ملف العميل.");
      }
    }
  }

  function renderCustomerRestaurantRating(rating) {
    selectedCustomerRating = Number(rating?.rating) || 0;
    byId("adminCustomerRatingNote").value = "";
    document.querySelectorAll("[data-customer-rating]").forEach((button) => {
      const value = Number(button.dataset.customerRating);
      const selected = value <= selectedCustomerRating;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", String(value === selectedCustomerRating));
    });

    const meta = byId("adminCustomerRatingMeta");
    meta.textContent = rating?.rating
      ? `أحدث تقييم: ${rating.rating} من 5${rating.ratedAt ? ` · ${date(rating.ratedAt)}` : ""}`
      : "لم يقيّم المطعم هذا العميل بعد.";
    byId("adminCustomerRatingSave").disabled = !selectedCustomerRating || ratingSaving;
    renderCustomerRatingHistory(rating?.history);
    setCustomerRatingMessage("");
  }

  function renderCustomerRatingHistory(history) {
    const list = byId("adminCustomerRatingHistory");
    const empty = byId("adminCustomerRatingHistoryEmpty");
    list.replaceChildren();
    const entries = Array.isArray(history) ? history : [];
    entries.forEach((entry) => {
      const item = document.createElement("li");
      item.className = "cpm-rating-history-item";

      const stars = document.createElement("span");
      stars.className = "cpm-rating-history-stars";
      stars.setAttribute("aria-label", `التقييم ${entry.rating} من 5`);
      stars.textContent = `${"★".repeat(Number(entry.rating) || 0)}${"☆".repeat(5 - (Number(entry.rating) || 0))}`;

      const ratedAt = document.createElement("span");
      ratedAt.textContent = date(entry.ratedAt);

      const details = document.createElement("span");
      details.textContent = [
        entry.ratedBy || "المطعم",
        entry.note || "بدون ملاحظة",
      ].join(" · ");

      item.append(stars, ratedAt, details);
      list.appendChild(item);
    });
    empty.hidden = entries.length > 0;
    list.hidden = entries.length === 0;
  }

  function setCustomerRatingMessage(message, isError) {
    const node = byId("adminCustomerRatingMessage");
    node.textContent = message;
    node.hidden = !message;
    node.classList.toggle("is-error", Boolean(isError));
  }

  async function saveCustomerRating() {
    if (!activeProfileCustomerId || !selectedCustomerRating || ratingSaving) return;
    const customerId = activeProfileCustomerId;
    ratingSaving = true;
    const button = byId("adminCustomerRatingSave");
    button.disabled = true;
    button.textContent = "جاري الحفظ...";
    setCustomerRatingMessage("");
    try {
      const { data, error } = await supabase.rpc(
        "admin_save_customer_restaurant_rating",
        {
          p_customer_id: customerId,
          p_rating: selectedCustomerRating,
          p_note: byId("adminCustomerRatingNote").value,
        },
      );
      if (error) throw error;
      if (activeProfileCustomerId === customerId) {
        renderCustomerRestaurantRating(data);
      }
      notify("success", "تم الحفظ", "تمت إضافة التقييم إلى السجل وسيظهر أحدث تقييم في ملف العميل.");
    } catch (error) {
      console.error("Customer restaurant rating save failed", error);
      if (activeProfileCustomerId !== customerId) return;
      const message = String(error?.message || "").includes("Customer profile")
        ? CUSTOMER_PROFILE_MESSAGE
        : "تعذر حفظ تقييم العميل. حاول مرة أخرى.";
      setCustomerRatingMessage(message, true);
      if (String(error?.message || "").includes("Customer profile")) {
        notify("error", CUSTOMER_MANAGEMENT_TITLE, message);
      } else {
        notify("error", "خطأ", message);
      }
    } finally {
      ratingSaving = false;
      button.disabled = !selectedCustomerRating;
      button.textContent = "إضافة تقييم";
    }
  }

  function renderProfile(data) {
    const customer = data.customer || {};
    const level = customer.level || {};
    const next = customer.nextLevel || {};
    const progressData = customer.levelProgress || {};
    const progress = Number(progressData.percent || 0);
    setText("adminCustomerProfileTitle", customer.displayName || "ملف العميل");
    setText("adminCustomerProfilePhone", customer.phone || "");
    setText("adminCustomerLevel", (level.name || "—"));
    setText("adminCustomerCurrentLevel", level.name || "المستوى الحالي");
    setText("adminCustomerNextLevel", next.name || "أعلى مستوى");
    setText("adminCustomerPoints", fmt(customer.points));
    setText("adminCustomerXp", fmt(customer.xp));
    setText("adminCustomerLifetimePoints", fmt(customer.lifetimePoints));
    setText("adminCustomerCompletedOrders", fmt(data.stats && data.stats.completedOrders));
    setText("adminCustomerSpending", money(data.stats && data.stats.totalSpending));
    setText("adminCustomerActiveMissions", fmt(data.missions && data.missions.active));
    setText("adminCustomerCompletedMissions", fmt(data.missions && data.missions.completed));
    setText("adminCustomerAvailableRewards", fmt(data.rewards && data.rewards.available));
    setText("adminCustomerRedeemedRewards", fmt(data.rewards && data.rewards.redeemed));
    byId("adminCustomerProgress").style.width = `${Math.min(100, Math.max(0, progress))}%`;
    setText("adminCustomerProgressText", `${progress}% من التقدم · داخل المستوى: ${fmt(progressData.xpIntoLevel)} XP · المتبقي: ${fmt(progressData.xpToNextLevel)} XP`);

    const orders = byId("adminCustomerOrders");
    orders.innerHTML = "";
    (data.recentOrders || []).forEach((order) => {
      const tr = document.createElement("tr");
      [order.orderNumber ? `#${order.orderNumber}` : order.id, date(order.createdAt), status[order.status] || order.status || "—", money(order.total)].forEach((value) => { const td = document.createElement("td"); td.textContent = value; tr.appendChild(td); });
      orders.appendChild(tr);
    });
    if (!orders.children.length) orders.innerHTML = '<tr><td colspan="4" class="empty-row">لا توجد طلبات.</td></tr>';

    const activityList = byId("adminCustomerActivity");
    activityList.innerHTML = "";
    (data.recentActivity || []).forEach((event) => {
      const li = document.createElement("li");
      li.className = "card";
      li.style.cssText = "padding:10px 14px;display:flex;justify-content:space-between;gap:12px";
      const label = activity[event.type] || "نشاط";
      const detail = event.reason || event.missionTitle || event.rewardName || (event.orderNumber ? `#${event.orderNumber}` : "");
      li.textContent = `${label}${detail ? ` — ${detail}` : ""} · ${date(event.createdAt)}`;
      activityList.appendChild(li);
    });
    if (!activityList.children.length) activityList.innerHTML = '<li style="color:var(--muted)">لا يوجد نشاط بعد.</li>';

    const feedbackList = byId("adminCustomerFeedback");
    feedbackList.innerHTML = "";
    (data.feedback || []).forEach((item) => {
      const card = document.createElement("div");
      card.className = "card";
      card.style.padding = "12px 14px";
      const orderLabel = item.orderNumber ? `#${item.orderNumber}` : "طلب";
      card.textContent = `${orderLabel} · سهولة الطلب: ${feedback[item.easeOfOrder] || "—"} · وضوح الأصناف والأسعار: ${feedback[item.menuClarity] || "—"} · استخدام المنيو: ${feedback[item.menuUsability] || "—"} · التقييم العام: ${feedback[item.overallExperience] || "—"}${item.comment ? ` · ${item.comment}` : ""} · ${date(item.createdAt)}`;
      feedbackList.appendChild(card);
    });
    if (!feedbackList.children.length) feedbackList.innerHTML = '<p style="color:var(--muted)">لا يوجد تقييمات مسجلة.</p>';
  }

  function init() {
    if (!byId("section-customers")) return;
    byId("customersSearch").addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => loadCustomers(true), 300); });
    byId("customersActivityFilter").addEventListener("change", () => loadCustomers(true));
    byId("customersLevelFilter").addEventListener("change", () => loadCustomers(true));
    byId("customersOrdersFilter").addEventListener("change", () => loadCustomers(true));
    byId("customersRefreshBtn").addEventListener("click", () => loadCustomers(false));
    byId("customersPrevBtn").addEventListener("click", () => { if (page > 0) { page -= 1; loadCustomers(false); } });
    byId("customersNextBtn").addEventListener("click", () => { if ((page + 1) * pageSize < total) { page += 1; loadCustomers(false); } });
    byId("adminCustomerProfileClose").addEventListener("click", closeCustomerProfile);
    document.querySelectorAll("[data-customer-rating]").forEach((button) => {
      button.addEventListener("click", () => {
        selectedCustomerRating = Number(button.dataset.customerRating);
        document.querySelectorAll("[data-customer-rating]").forEach((star) => {
          const value = Number(star.dataset.customerRating);
          star.classList.toggle("is-selected", value <= selectedCustomerRating);
          star.setAttribute(
            "aria-pressed",
            String(value === selectedCustomerRating),
          );
        });
        byId("adminCustomerRatingSave").disabled = ratingSaving;
        setCustomerRatingMessage("");
      });
    });
    byId("adminCustomerRatingSave").addEventListener("click", saveCustomerRating);
    byId("adminCustomerManagePoints").addEventListener("click", () => {
      if (!activeProfileCustomerId) return;
      if (window.LoyaltyAdmin?.managePointsForCustomer) {
        window.LoyaltyAdmin.managePointsForCustomer(activeProfileCustomerId);
      } else {
        notify("error", "خطأ", "تعذر فتح إدارة النقاط.");
      }
    });
    byId("adminCustomerLoyaltyHistory").addEventListener("click", () => {
      if (!activeProfileCustomerId) return;
      if (window.LoyaltyAdmin?.openCustomerDetails) {
        window.LoyaltyAdmin.openCustomerDetails(activeProfileCustomerId);
      } else {
        notify("error", "خطأ", "تعذر فتح سجل الولاء.");
      }
    });
    document.querySelectorAll('.sidebar-link[data-section="customers"]').forEach((button) => button.addEventListener("click", () => loadCustomers(true)));
    loadLevels();
  }

  function closeCustomerProfile() {
    activeProfileCustomerId = null;
    profileLoadToken += 1;
    closeModal("adminCustomerProfileModal");
  }

  window.refreshAdminCustomerProfile = async (customerId) => {
    if (
      activeProfileCustomerId === customerId
      && byId("adminCustomerProfileModal")?.classList.contains("open")
    ) {
      await openProfile(customerId);
    }
  };

  async function loadLevels() {
    if (window.FeatureGate && !(await window.FeatureGate.hasFeature("customer_management"))) return;
    const { data, error } = await supabase.rpc("admin_get_loyalty_config");
    if (error || !data || !Array.isArray(data.levels)) return;
    const select = byId("customersLevelFilter");
    data.levels.forEach((level) => {
      const option = document.createElement("option");
      option.value = level.id;
      option.textContent = level.name;
      select.appendChild(option);
    });
    window.CustomSelect?.refresh?.(select);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
