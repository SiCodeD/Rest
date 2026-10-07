// Admin loyalty section: overview, point/XP rules and level management.
// All calculations and authorization happen in Supabase RPCs; this file only renders and submits.
(function () {
    "use strict";

    const SETTING_FIELDS = [
        "order_enabled", "order_points", "order_xp",
        "first_order_enabled", "first_order_points", "first_order_xp",
        "visit_enabled", "visit_points", "visit_xp",
        "review_enabled", "review_points", "review_xp",
    ];

    let loading = false;

    const byId = (id) => document.getElementById(id);
    const fmt = (value) => Number(value || 0).toLocaleString("en-US");

    // Levels are shown as a coloured dot + name instead of the emoji badge.
    // Set to true to bring the emoji badge back everywhere.
    const SHOW_BADGE_EMOJI = false;
    const LEVEL_COLORS = ["#10b981", "#14b8a6", "#3b82f6", "#94a3b8", "#f59e0b", "#8b5cf6", "#ec4899", "#ef4444"];
    let levelColors = new Map();

    // Colour follows the level's rank (lowest XP first), so it stays stable.
    function setLevelColors(levels) {
        levelColors = new Map();
        [...levels]
            .sort((a, b) => Number(a.minimumXp || 0) - Number(b.minimumXp || 0))
            .forEach((level, index) => levelColors.set(level.name, LEVEL_COLORS[index % LEVEL_COLORS.length]));
    }

    function levelColor(name) {
        return levelColors.get(name) || "#94a3b8";
    }

    function levelChip(level) {
        const chip = document.createElement("span");
        chip.className = "lx-level";
        if (!level) {
            chip.textContent = "—";
            return chip;
        }
        if (SHOW_BADGE_EMOJI && level.badge) {
            chip.textContent = `${level.badge} ${level.name}`.trim();
            return chip;
        }
        const dot = document.createElement("span");
        dot.className = "lx-dot";
        dot.style.background = levelColor(level.name);
        const name = document.createElement("span");
        name.textContent = level.name;
        chip.append(dot, name);
        return chip;
    }

    function statusPill(active) {
        const pill = document.createElement("span");
        pill.className = "lx-pill " + (active ? "is-on" : "is-off");
        pill.textContent = active ? "نشط" : "غير نشط";
        return pill;
    }

    // Copies each column header onto its cell so tables can stack as cards on phones.
    function headLabels(body) {
        const table = body.closest("table");
        return table ? [...table.querySelectorAll("thead th")].map((th) => th.textContent.trim()) : [];
    }

    function distribution(levels) {
        const total = levels.reduce((sum, l) => sum + Number(l.customers || 0), 0);
        const wrap = document.createElement("div");
        const bar = document.createElement("div");
        bar.className = "lx-dist-bar";
        bar.setAttribute("role", "img");
        bar.setAttribute("aria-label", "توزيع العملاء حسب المستوى");
        const legend = document.createElement("ul");
        legend.className = "lx-dist-legend";
        levels.forEach((l) => {
            const n = Number(l.customers || 0);
            const color = levelColor(l.name);
            if (n > 0) {
                const seg = document.createElement("div");
                seg.className = "lx-dist-seg";
                seg.style.flex = String(n);
                seg.style.background = color;
                seg.title = `${l.name}: ${fmt(n)}`;
                bar.appendChild(seg);
            }
            const li = document.createElement("li");
            if (!n) li.className = "is-zero";
            const dot = document.createElement("span");
            dot.className = "lx-dot";
            dot.style.background = color;
            const name = document.createElement("span");
            name.textContent = l.name;
            const count = document.createElement("b");
            count.textContent = fmt(n);
            li.append(dot, name, count);
            if (n && total) {
                const pct = document.createElement("span");
                pct.className = "lx-dist-pct";
                pct.textContent = `${Math.round((n / total) * 100)}%`;
                li.appendChild(pct);
            }
            legend.appendChild(li);
        });
        wrap.append(bar, legend);
        return wrap;
    }

    function notify(kind, title, message) {
        if (window.Notifications && typeof Notifications[kind] === "function") {
            Notifications[kind](title, message);
        }
    }

    const LOYALTY_FEATURE_ERROR = "Loyalty is not available on the current plan.";
    const LOYALTY_FEATURE_TITLE = "الميزة غير متاحة في خطتك";
    const LOYALTY_FEATURE_MESSAGE = "برنامج الولاء غير متاح في خطتك الحالية. قم بترقية خطتك للوصول إلى هذه الميزة.";

    function showLoyaltyFeatureError(error) {
        if (!String(error?.message || "").includes(LOYALTY_FEATURE_ERROR)) return false;
        notify("error", LOYALTY_FEATURE_TITLE, LOYALTY_FEATURE_MESSAGE);
        return true;
    }

    function friendlyError(error) {
        const message = String((error && error.message) || "");
        if (/An active level starting at 0 XP/i.test(message)) {
            return /No active 0 XP level existed/i.test(String(error.details || ""))
                ? "لا يوجد مستوى نشط يبدأ من 0 XP حالياً. اجعل أحد المستويات 0 XP ونشطاً."
                : "هذا التعديل سيُلغي المستوى النشط الوحيد الذي يبدأ من 0 XP.";
        }
        if (/duplicate key|loyalty_levels_restaurant_id_minimum_xp_key/i.test(message)) return "يوجد مستوى آخر بنفس الحد الأدنى لـ XP.";
        if (/violates check constraint/i.test(message)) return "القيم المدخلة خارج النطاق المسموح.";
        if (/Not authorized/i.test(message)) return "لا تملك صلاحية تنفيذ هذا الإجراء.";
        if (/Insufficient points balance/i.test(message)) return "الرصيد لا يكفي لهذا الخصم.";
        if (/A reason is required/i.test(message)) return "السبب مطلوب.";
        if (/Customer not found/i.test(message)) return "العميل غير موجود.";
        return "تعذر تنفيذ العملية. حاول مرة أخرى.";
    }

    async function loadAll() {
        if (window.FeatureGate && !(await window.FeatureGate.hasFeature("loyalty"))) return;
        if (loading || !window.supabase) return;
        loading = true;
        try {
            const [overview, config] = await Promise.all([
                supabase.rpc("admin_get_loyalty_overview"),
                supabase.rpc("admin_get_loyalty_config"),
            ]);
            if (overview.error) throw overview.error;
            if (config.error) throw config.error;
            const cfgLevels = (config.data && config.data.levels) || [];
            setLevelColors(cfgLevels.length ? cfgLevels : (overview.data && overview.data.levels) || []);
            renderOverview(overview.data || {});
            renderSettings((config.data && config.data.settings) || {});
            renderLevels(cfgLevels);
            await loadCustomers();
        } catch (error) {
            console.error("Loyalty load failed:", error);
            if (!showLoyaltyFeatureError(error)) notify("error", "خطأ", "تعذر تحميل بيانات الولاء.");
        } finally {
            loading = false;
        }
    }

    function renderOverview(data) {
        byId("loyaltyStatCustomers").textContent = fmt(data.totalCustomers);
        byId("loyaltyStatActive").textContent = fmt(data.customersWithActivity);
        byId("loyaltyStatPoints").textContent = fmt(data.pointsIssued);
        byId("loyaltyStatXp").textContent = fmt(data.xpEarned);

        const levels = Array.isArray(data.levels) ? data.levels : [];
        const note = byId("loyaltyLevelsBreakdown");
        let dist = byId("loyaltyLevelsDist");
        if (!dist) {
            dist = document.createElement("div");
            dist.id = "loyaltyLevelsDist";
            dist.className = "lx-dist";
            note.closest(".table-head").insertAdjacentElement("afterend", dist);
        }
        dist.replaceChildren();
        note.hidden = levels.length > 0;
        if (levels.length) dist.appendChild(distribution(levels));
        else note.textContent = "لا توجد مستويات.";
    }

    function renderSettings(settings) {
        SETTING_FIELDS.forEach((key) => {
            const input = document.querySelector(`[data-loyalty-setting="${key}"]`);
            if (!input || settings[key] === undefined) return;
            if (input.type === "checkbox") input.checked = settings[key] === true;
            else input.value = settings[key];
        });
    }

    function renderLevels(levels) {
        const body = byId("loyaltyLevelsBody");
        body.innerHTML = "";
        const labels = headLabels(body);
        levels.forEach((level) => {
            const row = document.createElement("tr");
            [
                levelChip(level),
                fmt(level.minimumXp),
                fmt(level.customers),
                statusPill(level.isActive),
            ].forEach((content, index) => {
                const td = document.createElement("td");
                td.dataset.label = labels[index] || "";
                if (typeof content === "string") td.textContent = content;
                else td.appendChild(content);
                row.appendChild(td);
            });

            const actions = document.createElement("td");
            actions.dataset.label = "";
            actions.className = "text-right loyalty-actions";
            const edit = document.createElement("button");
            edit.type = "button";
            edit.className = "icon-btn";
            edit.setAttribute("data-tooltip", "تعديل المستوى");
            edit.setAttribute("aria-label", "تعديل المستوى");
            edit.innerHTML = window.lucideIcon("pencil");
            edit.addEventListener("click", () => startEdit(level));
            const remove = document.createElement("button");
            remove.type = "button";
            remove.className = "icon-btn-delete";
            remove.setAttribute("data-tooltip", "حذف المستوى");
            remove.setAttribute("aria-label", "حذف المستوى");
            remove.innerHTML = window.lucideIcon("trash-2");
            remove.addEventListener("click", () => deleteLevel(level));
            actions.append(edit, remove);
            row.appendChild(actions);
            body.appendChild(row);
        });
    }

    function resetLevelForm() {
        byId("loyaltyLevelForm").reset();
        byId("loyaltyLevelId").value = "";
        byId("loyaltyLevelActive").checked = true;
        byId("loyaltyLevelCancel").hidden = true;
    }

    function startEdit(level) {
        byId("loyaltyLevelId").value = level.id;
        byId("loyaltyLevelName").value = level.name;
        byId("loyaltyLevelXp").value = level.minimumXp;
        byId("loyaltyLevelActive").checked = level.isActive === true;
        byId("loyaltyLevelCancel").hidden = false;
        byId("loyaltyLevelName").focus();
    }

    async function withButton(button, task) {
        if (button.disabled) return;
        button.disabled = true;
        try {
            await task();
        } finally {
            button.disabled = false;
        }
    }

    async function saveSettings(event) {
        event.preventDefault();
        const payload = {};
        SETTING_FIELDS.forEach((key) => {
            const input = document.querySelector(`[data-loyalty-setting="${key}"]`);
            if (!input) return;
            payload[key] = input.type === "checkbox" ? input.checked : Number(input.value);
        });
        await withButton(byId("loyaltySettingsSave"), async () => {
            const { error } = await supabase.rpc("admin_save_loyalty_settings", { p_settings: payload });
            if (error) {
                console.error(error);
                if (!showLoyaltyFeatureError(error)) notify("error", "خطأ", friendlyError(error));
                return;
            }
            notify("success", "تم الحفظ", "تم تحديث قواعد الولاء.");
        });
    }

    async function saveLevel(event) {
        event.preventDefault();
        await withButton(byId("loyaltyLevelSave"), async () => {
            const payload = {
                p_id: byId("loyaltyLevelId").value || null,
                p_name: byId("loyaltyLevelName").value,
                p_minimum_xp: Number(byId("loyaltyLevelXp").value),
                p_badge: "",
                p_is_active: byId("loyaltyLevelActive").checked,
            };
            const { error } = await supabase.rpc("admin_save_loyalty_level", payload);
            if (error) {
                console.error(
                    "admin_save_loyalty_level failed " +
                    JSON.stringify({
                        payload,
                        code: error.code,
                        message: error.message,
                        details: error.details,
                        hint: error.hint,
                    }),
                );
                if (!showLoyaltyFeatureError(error)) notify("error", "خطأ", friendlyError(error));
                return;
            }
            notify("success", "تم الحفظ", "تم حفظ المستوى.");
            resetLevelForm();
            await loadAll();
        });
    }

    async function deleteLevel(level) {
        const warning = level.customers > 0
            ? `سيتم إعادة تصنيف ${level.customers} عميل تلقائياً. هل تريد حذف "${level.name}"؟`
            : `هل تريد حذف "${level.name}"؟`;
        const run = async () => {
            const { error } = await supabase.rpc("admin_delete_loyalty_level", { p_id: level.id });
            if (error) {
                console.error(error);
                if (!showLoyaltyFeatureError(error)) notify("error", "خطأ", friendlyError(error));
                return;
            }
            notify("success", "تم الحذف", "تم حذف المستوى.");
            await loadAll();
        };
        if (window.ModalManager?.confirmDelete) window.ModalManager.confirmDelete(run, "حذف المستوى", warning);
        else if (window.confirm(warning)) await run();
    }

    const TYPE_LABELS = {
        earn: "اكتساب",
        adjustment: "تعديل يدوي",
        redeem: "استبدال",
        refund: "استرجاع",
        expiration: "انتهاء صلاحية",
    };
    const MAX_ADJUST_POINTS = 100000;
    let customers = [];
    let selectedCustomer = null;
    let adjusting = false;

    function openModal(id) { byId(id).classList.add("open"); }
    function closeModal(id) { byId(id).classList.remove("open"); }

    async function loadCustomers() {
        // Row access is restricted to the admin's restaurant by RLS.
        const { data, error } = await supabase
            .from("restaurant_customer_accounts")
            .select("id, display_name, points_balance, xp_total, customer_profiles(normalized_phone), loyalty_levels(name, badge)")
            .order("created_at", { ascending: false })
            .limit(500);
        if (error) {
            console.error("Loyalty customers load failed:", error);
            byId("loyaltyCustomersCount").textContent = "تعذر تحميل العملاء.";
            showLoyaltyFeatureError(error);
            return;
        }
        customers = data || [];
        renderCustomers();
    }

    function renderCustomers() {
        const query = byId("loyaltyCustomerSearch").value.trim().toLowerCase();
        const rows = customers.filter((c) => {
            if (!query) return true;
            const phone = (c.customer_profiles && c.customer_profiles.normalized_phone) || "";
            return (c.display_name || "").toLowerCase().includes(query) || phone.includes(query);
        });
        byId("loyaltyCustomersCount").textContent = `${fmt(rows.length)} عميل`;

        const body = byId("loyaltyCustomersBody");
        body.innerHTML = "";
        const labels = headLabels(body);
        if (!rows.length) {
            const row = document.createElement("tr");
            const cell = document.createElement("td");
            cell.colSpan = 6;
            cell.className = "empty-row";
            cell.dataset.label = "";
            cell.textContent = "لا يوجد عملاء.";
            row.appendChild(cell);
            body.appendChild(row);
            return;
        }
        rows.forEach((c) => {
            const row = document.createElement("tr");
            const level = c.loyalty_levels;
            [
                c.display_name || "—",
                (c.customer_profiles && c.customer_profiles.normalized_phone) || "—",
                levelChip(level),
                fmt(c.xp_total),
                fmt(c.points_balance),
            ].forEach((content, index) => {
                const td = document.createElement("td");
                td.dataset.label = labels[index] || "";
                if (typeof content === "string") td.textContent = content;
                else td.appendChild(content);
                if (index === 1) td.dir = "ltr";
                row.appendChild(td);
            });
            const actions = document.createElement("td");
            actions.dataset.label = "";
            actions.className = "text-right loyalty-actions";
            const open = document.createElement("button");
            open.type = "button";
            open.className = "icon-btn";
            open.setAttribute("data-tooltip", "عرض تفاصيل العميل");
            open.setAttribute("aria-label", "عرض تفاصيل العميل");
            open.innerHTML = window.lucideIcon("eye");
            open.addEventListener("click", () => openCustomer(c.id));
            actions.appendChild(open);
            row.appendChild(actions);
            body.appendChild(row);
        });
    }

    async function openCustomer(customerId) {
        selectedCustomer = customers.find((c) => c.id === customerId) || null;
        if (!selectedCustomer) return;
        renderCustomerHeader();
        byId("loyaltyCustomerActivity").innerHTML = "";
        openModal("loyaltyCustomerModal");
        await loadCustomerActivity();
    }

    function renderCustomerHeader() {
        const c = selectedCustomer;
        const level = c.loyalty_levels;
        byId("loyaltyCustomerTitle").textContent = c.display_name || "تفاصيل العميل";
        byId("loyaltyCustomerPhone").textContent = (c.customer_profiles && c.customer_profiles.normalized_phone) || "";
        byId("loyaltyCustomerLevel").replaceChildren(levelChip(level));
        byId("loyaltyCustomerXp").textContent = fmt(c.xp_total);
        byId("loyaltyCustomerPoints").textContent = fmt(c.points_balance);
    }

    async function loadCustomerActivity() {
        const { data, error } = await supabase
            .from("loyalty_transactions")
            .select("points_delta, xp_delta, transaction_type, reason, created_at")
            .eq("restaurant_customer_id", selectedCustomer.id)
            .order("created_at", { ascending: false })
            .limit(30);
        const list = byId("loyaltyCustomerActivity");
        list.innerHTML = "";
        if (error) {
            console.error("Loyalty activity load failed:", error);
            if (!showLoyaltyFeatureError(error)) notify("error", "خطأ", "تعذر تحميل نشاط النقاط.");
            return;
        }
        byId("loyaltyCustomerActivityEmpty").hidden = (data || []).length > 0;
        (data || []).forEach((tx) => {
            const item = document.createElement("li");
            item.className = "card";
            item.style.cssText = "padding: 10px 14px; display: flex; justify-content: space-between; gap: 12px";
            const text = document.createElement("div");
            const label = document.createElement("strong");
            label.textContent = TYPE_LABELS[tx.transaction_type] || tx.transaction_type;
            const reason = document.createElement("div");
            reason.style.color = "var(--muted)";
            reason.textContent = tx.reason;
            text.append(label, reason);
            const amount = document.createElement("strong");
            amount.dir = "ltr";
            const sign = tx.points_delta > 0 ? "+" : "";
            amount.textContent = `${sign}${tx.points_delta} نقطة`;
            amount.style.color = tx.points_delta < 0 ? "var(--danger)" : "var(--primary)";
            item.append(text, amount);
            list.appendChild(item);
        });
    }

    function openAdjustModal() {
        if (!selectedCustomer) return;
        byId("loyaltyAdjustForm").reset();
        openModal("loyaltyAdjustModal");
        byId("loyaltyAdjustAmount").focus();
    }

    async function submitAdjustment(event) {
        event.preventDefault();
        if (adjusting || !selectedCustomer) return;

        const mode = document.querySelector('input[name="loyaltyAdjustMode"]:checked').value;
        const amount = Number(byId("loyaltyAdjustAmount").value);
        const reason = byId("loyaltyAdjustReason").value.trim();

        if (!Number.isInteger(amount) || amount < 1 || amount > MAX_ADJUST_POINTS) {
            notify("error", "خطأ", `أدخل كمية صحيحة بين 1 و ${fmt(MAX_ADJUST_POINTS)}.`);
            return;
        }
        if (reason.length < 3) {
            notify("error", "خطأ", "اكتب سبباً واضحاً للتعديل.");
            return;
        }
        if (mode === "deduct" && amount > Number(selectedCustomer.points_balance)) {
            notify("error", "خطأ", "الرصيد لا يكفي لهذا الخصم.");
            return;
        }

        // The flag is set synchronously so a double click cannot send two requests.
        adjusting = true;
        const submit = byId("loyaltyAdjustSubmit");
        submit.disabled = true;
        try {
            const { error } = await supabase.rpc("admin_adjust_customer_loyalty", {
                p_customer_id: selectedCustomer.id,
                p_points: mode === "deduct" ? -amount : amount,
                p_xp: 0,
                p_reason: reason,
            });
            if (error) {
                console.error("admin_adjust_customer_loyalty failed", error);
                if (!showLoyaltyFeatureError(error)) notify("error", "خطأ", friendlyError(error));
                return;
            }
            notify("success", "تم التعديل", mode === "deduct" ? "تم خصم النقاط." : "تمت إضافة النقاط.");
            closeModal("loyaltyAdjustModal");
            const keepId = selectedCustomer.id;
            await loadAll();
            selectedCustomer = customers.find((c) => c.id === keepId) || null;
            if (selectedCustomer) {
                renderCustomerHeader();
                await loadCustomerActivity();
            }
        } finally {
            adjusting = false;
            submit.disabled = false;
        }
    }

    function init() {
        if (!byId("section-loyalty")) return;
        byId("loyaltyCustomerSearch").addEventListener("input", renderCustomers);
        byId("loyaltyCustomerClose").addEventListener("click", () => closeModal("loyaltyCustomerModal"));
        byId("loyaltyManagePointsBtn").addEventListener("click", openAdjustModal);
        byId("loyaltyAdjustClose").addEventListener("click", () => closeModal("loyaltyAdjustModal"));
        byId("loyaltyAdjustCancel").addEventListener("click", () => closeModal("loyaltyAdjustModal"));
        byId("loyaltyAdjustForm").addEventListener("submit", submitAdjustment);
        byId("loyaltySettingsForm").addEventListener("submit", saveSettings);
        byId("loyaltyLevelForm").addEventListener("submit", saveLevel);
        byId("loyaltyLevelCancel").addEventListener("click", resetLevelForm);
        document.querySelectorAll('.sidebar-link[data-section="loyalty"]').forEach((button) => {
            button.addEventListener("click", loadAll);
        });
    }

    document.addEventListener("DOMContentLoaded", init);
})();   
