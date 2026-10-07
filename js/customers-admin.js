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
    openModal("adminCustomerProfileModal");
    if (window.FeatureGate && !(await window.FeatureGate.hasFeature("customer_profile"))) {
      byId("adminCustomerProfileLoading").hidden = true;
      byId("adminCustomerProfileError").hidden = true;
      byId("adminCustomerProfileContent").hidden = false;
      window.FeatureGate.renderLockedFeature(byId("adminCustomerProfileContent"), "customer_profile");
      return;
    }
    byId("adminCustomerProfileLoading").hidden = false;
    byId("adminCustomerProfileError").hidden = true;
    byId("adminCustomerProfileContent").hidden = true;
    const { data, error } = await supabase.rpc("admin_get_customer_profile", { p_customer_id: customerId });
    if (error || !data) {
      console.error("Admin customer profile load failed", error);
      byId("adminCustomerProfileLoading").hidden = true;
      byId("adminCustomerProfileError").hidden = false;
      if (error && showCustomerError(error, byId("adminCustomerProfileError"))) return;
      return;
    }
    renderProfile(data);
    byId("adminCustomerProfileLoading").hidden = true;
    byId("adminCustomerProfileContent").hidden = false;
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
    byId("adminCustomerProfileClose").addEventListener("click", () => closeModal("adminCustomerProfileModal"));
    document.querySelectorAll('.sidebar-link[data-section="customers"]').forEach((button) => button.addEventListener("click", () => loadCustomers(true)));
    loadLevels();
  }

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
