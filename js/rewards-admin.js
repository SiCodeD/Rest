// Admin rewards: reward management, redemption history and staff code verification.
// Eligibility, balances and code state are all decided server-side by Supabase RPCs.
(function () {
    "use strict";

    const TYPE_LABELS = {
        free_item: "منتج مجاني",
        percentage_discount: "خصم نسبة",
        fixed_discount: "خصم ثابت",
    };
    const STATUS_LABELS = { active: "صالحة", used: "مستخدمة", expired: "منتهية", cancelled: "ملغاة" };
    const ERROR_MESSAGES = {
        REWARD_CODE_INVALID: "رمز المكافأة غير صالح.",
        REWARD_ALREADY_USED: "تم استخدام هذه المكافأة مسبقًا.",
        REWARD_CODE_EXPIRED: "انتهت صلاحية هذا الرمز.",
        "Reward not found": "المكافأة غير موجودة.",
        "Menu item not found": "الصنف المحدد غير موجود.",
        "Not authorized": "لا تملك صلاحية تنفيذ هذا الإجراء.",
    };

    let rewards = [];
    let menuItemsLoaded = false;
    let saving = false;
    let verifying = false;
    let using = false;
    let filterTimer = null;

    const byId = (id) => document.getElementById(id);
    const fmt = (value) => Number(value || 0).toLocaleString("en-US");
    const fmtDate = (value) => (value ? new Date(value).toLocaleDateString("ar", { year: "numeric", month: "short", day: "numeric" }) : "—");

    function notify(kind, title, message) {
        if (window.Notifications && typeof Notifications[kind] === "function") Notifications[kind](title, message);
    }

    const REWARDS_FEATURE_ERROR = "Rewards are not available on the current plan.";
    const REWARDS_FEATURE_TITLE = "الميزة غير متاحة في خطتك";
    const REWARDS_FEATURE_MESSAGE = "المكافآت غير متاحة في خطتك الحالية. قم بترقية خطتك للوصول إلى هذه الميزة.";

    function showRewardsFeatureError(error) {
        if (!String(error?.message || "").includes(REWARDS_FEATURE_ERROR)) return false;
        notify("error", REWARDS_FEATURE_TITLE, REWARDS_FEATURE_MESSAGE);
        return true;
    }

    function friendlyError(error) {
        const message = String((error && error.message) || "");
        for (const key of Object.keys(ERROR_MESSAGES)) {
            if (message.indexOf(key) !== -1) return ERROR_MESSAGES[key];
        }
        if (/violates check constraint/i.test(message)) return "القيم المدخلة خارج النطاق المسموح.";
        return "تعذر تنفيذ العملية. حاول مرة أخرى.";
    }

    function cell(row, text) {
        const td = document.createElement("td");
        td.textContent = text;
        row.appendChild(td);
        return td;
    }

    function emptyRow(body, colSpan, text) {
        const row = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = colSpan;
        td.className = "empty-row";
        td.textContent = text;
        row.appendChild(td);
        body.appendChild(row);
    }

    function rewardCostLabel(reward) {
        if (reward.type === "percentage_discount") return `${reward.value}%`;
        if (reward.type === "fixed_discount") return fmt(reward.value);
        return reward.menuItemName || "";
    }

    // ------------------------------------------------------------------ data
    async function loadRewards() {
        const { data, error } = await supabase.rpc("admin_get_rewards");
        if (error) {
            console.error("admin_get_rewards failed", error);
            if (!showRewardsFeatureError(error)) notify("error", "خطأ", "تعذر تحميل المكافآت.");
            return;
        }
        const stats = data.stats || {};
        byId("rewardStatTotal").textContent = fmt(stats.totalRewards);
        byId("rewardStatActive").textContent = fmt(stats.activeRewards);
        byId("rewardStatRedemptions").textContent = fmt(stats.totalRedemptions);
        byId("rewardStatPending").textContent = fmt(stats.activeRedemptions);
        byId("rewardStatUsed").textContent = fmt(stats.usedRedemptions);
        byId("rewardStatPoints").textContent = fmt(stats.pointsSpent);
        rewards = data.rewards || [];
        renderRewards();
        renderRewardFilter();
    }

    function renderRewards() {
        byId("rewardsCountText").textContent = `${fmt(rewards.length)} مكافأة`;
        const body = byId("rewardsBody");
        body.innerHTML = "";
        if (!rewards.length) return emptyRow(body, 6, "لا توجد مكافآت بعد.");

        rewards.forEach((reward) => {
            const row = document.createElement("tr");
            const name = cell(row, reward.name);
            const detail = rewardCostLabel(reward);
            if (detail) {
                const small = document.createElement("div");
                small.style.color = "var(--muted)";
                small.textContent = detail;
                name.appendChild(small);
            }
            cell(row, TYPE_LABELS[reward.type] || reward.type);
            cell(row, fmt(reward.pointsCost));
            cell(row, reward.isActive ? "فعّالة" : "غير فعّالة");
            cell(row, fmt(reward.redemptions));

            const actions = document.createElement("td");
            actions.className = "text-right loyalty-actions";
            const buttons = [
                ["icon-btn", "pencil", "تعديل المكافأة", () => openForm(reward)],
                ["icon-btn", "power", reward.isActive ? "تعطيل المكافأة" : "تفعيل المكافأة", () => toggleActive(reward)],
                ["icon-btn-delete", "trash-2", "حذف المكافأة", () => removeReward(reward)],
            ];
            buttons.forEach(([className, icon, label, handler]) => {
                const button = document.createElement("button");
                button.type = "button";
                button.className = className;
                button.setAttribute("data-tooltip", label);
                button.setAttribute("aria-label", label);
                button.innerHTML = window.lucideIcon(icon);
                button.addEventListener("click", handler);
                actions.appendChild(button);
            });
            row.appendChild(actions);
            body.appendChild(row);
        });
    }

    function renderRewardFilter() {
        const select = byId("redemptionRewardFilter");
        const current = select.value;
        select.innerHTML = "";
        const all = document.createElement("option");
        all.value = "";
        all.textContent = "كل المكافآت";
        select.appendChild(all);
        rewards.forEach((reward) => {
            const option = document.createElement("option");
            option.value = reward.id;
            option.textContent = reward.name;
            select.appendChild(option);
        });
        select.value = rewards.some((r) => r.id === current) ? current : "";
    }

    async function loadRedemptions() {
        const { data, error } = await supabase.rpc("admin_get_reward_redemptions", {
            p_status: byId("redemptionStatusFilter").value || null,
            p_reward_id: byId("redemptionRewardFilter").value || null,
            p_search: byId("redemptionSearch").value || null,
            p_from: byId("redemptionFrom").value || null,
            p_to: byId("redemptionTo").value || null,
        });
        if (error) {
            console.error("admin_get_reward_redemptions failed", error);
            if (!showRewardsFeatureError(error)) {
                byId("redemptionsCountText").textContent = "تعذر تحميل السجل.";
            }
            return;
        }
        const rows = data || [];
        byId("redemptionsCountText").textContent = `${fmt(rows.length)} استبدال`;
        const body = byId("redemptionsBody");
        body.innerHTML = "";
        if (!rows.length) return emptyRow(body, 8, "لا توجد استبدالات.");
        rows.forEach((item) => {
            const row = document.createElement("tr");
            const customer = cell(row, item.customerName || "—");
            const phone = document.createElement("div");
            phone.dir = "ltr";
            phone.style.color = "var(--muted)";
            phone.textContent = item.customerPhone || "";
            customer.appendChild(phone);
            cell(row, item.rewardName);
            cell(row, item.code).dir = "ltr";
            cell(row, fmt(item.pointsCost));
            cell(row, STATUS_LABELS[item.status] || item.status);
            cell(row, fmtDate(item.createdAt));
            cell(row, fmtDate(item.usedAt));
            cell(row, item.usedBy || "—");
            body.appendChild(row);
        });
    }

    async function refreshAll() {
        if (window.FeatureGate && !(await window.FeatureGate.hasFeature("rewards"))) return;
        await Promise.all([loadRewards(), loadRedemptions()]);
    }

    // ------------------------------------------------------------ reward form
    async function loadMenuItems() {
        if (menuItemsLoaded) return;
        const { data, error } = await supabase
            .from("menu_items")
            .select("id, name")
            .eq("active", true)
            .order("name");
        if (error) {
            console.error("menu items load failed", error);
            return;
        }
        const select = byId("rewardMenuItem");
        (data || []).forEach((item) => {
            const option = document.createElement("option");
            option.value = item.id;
            option.textContent = item.name;
            select.appendChild(option);
        });
        menuItemsLoaded = true;
    }

    function toLocalInput(value) {
        if (!value) return "";
        const date = new Date(value);
        const offset = date.getTimezoneOffset() * 60000;
        return new Date(date.getTime() - offset).toISOString().slice(0, 16);
    }

    function updateTypeFields() {
        const type = byId("rewardType").value;
        byId("rewardMenuItemWrap").hidden = type !== "free_item";
        byId("rewardValueWrap").hidden = type === "free_item";
        byId("rewardValue").required = type !== "free_item";
        byId("rewardValue").max = type === "percentage_discount" ? "100" : "";
        byId("rewardValueLabel").textContent = type === "percentage_discount" ? "نسبة الخصم (%)" : "مبلغ الخصم";
    }

    async function openForm(reward) {
        await loadMenuItems();
        byId("rewardForm").reset();
        byId("rewardId").value = reward ? reward.id : "";
        byId("rewardModalTitle").textContent = reward ? "تعديل المكافأة" : "إضافة مكافأة";
        if (reward) {
            byId("rewardName").value = reward.name;
            byId("rewardDescription").value = reward.description || "";
            byId("rewardType").value = reward.type;
            byId("rewardMenuItem").value = reward.menuItemId || "";
            byId("rewardValue").value = reward.value || "";
            byId("rewardCost").value = reward.pointsCost;
            byId("rewardStartsAt").value = toLocalInput(reward.startsAt);
            byId("rewardExpiresAt").value = toLocalInput(reward.expiresAt);
            byId("rewardUsageLimit").value = reward.usageLimit || "";
            byId("rewardPerCustomer").value = reward.perCustomerLimit || "";
            byId("rewardValidDays").value = reward.redemptionValidDays;
            byId("rewardActive").checked = reward.isActive;
        }
        window.syncMissionDateTimePicker?.("rewardStartsAt");
        window.syncMissionDateTimePicker?.("rewardExpiresAt");
        updateTypeFields();
        byId("rewardModal").classList.add("open");
        byId("rewardName").focus();
    }

    function closeForm() {
        byId("rewardModal").classList.remove("open");
    }

    const intOrNull = (id) => (byId(id).value === "" ? null : Number(byId(id).value));
    const dateOrNull = (id) => (byId(id).value ? new Date(byId(id).value).toISOString() : null);

    async function saveReward(event) {
        event.preventDefault();
        if (saving) return;

        const type = byId("rewardType").value;
        const cost = Number(byId("rewardCost").value);
        const value = byId("rewardValue").value === "" ? null : Number(byId("rewardValue").value);
        const startsAt = dateOrNull("rewardStartsAt");
        const expiresAt = dateOrNull("rewardExpiresAt");

        if (!Number.isInteger(cost) || cost < 1) return notify("error", "خطأ", "أدخل تكلفة نقاط صحيحة.");
        if (type !== "free_item" && (value === null || value <= 0 || (type === "percentage_discount" && value > 100))) {
            return notify("error", "خطأ", "أدخل قيمة خصم صحيحة.");
        }
        if (startsAt && expiresAt && new Date(startsAt) >= new Date(expiresAt)) {
            return notify("error", "خطأ", "تاريخ الانتهاء يجب أن يكون بعد تاريخ البداية.");
        }

        saving = true;
        byId("rewardSave").disabled = true;
        try {
            const { error } = await supabase.rpc("admin_save_reward", {
                p_id: byId("rewardId").value || null,
                p_name: byId("rewardName").value,
                p_description: byId("rewardDescription").value,
                p_reward_type: type,
                p_value: type === "free_item" ? null : value,
                p_menu_item_id: type === "free_item" ? byId("rewardMenuItem").value || null : null,
                p_points_cost: cost,
                p_starts_at: startsAt,
                p_expires_at: expiresAt,
                p_redemption_valid_days: intOrNull("rewardValidDays") || 14,
                p_usage_limit: intOrNull("rewardUsageLimit"),
                p_per_customer_limit: intOrNull("rewardPerCustomer"),
                p_is_active: byId("rewardActive").checked,
            });
            if (error) {
                console.error("admin_save_reward failed", error);
                if (!showRewardsFeatureError(error)) notify("error", "خطأ", friendlyError(error));
                return;
            }
            notify("success", "تم الحفظ", "تم حفظ المكافأة.");
            closeForm();
            await refreshAll();
        } finally {
            saving = false;
            byId("rewardSave").disabled = false;
        }
    }

    async function toggleActive(reward) {
        const { error } = await supabase.rpc("admin_set_reward_active", { p_id: reward.id, p_active: !reward.isActive });
        if (error) {
            console.error(error);
            if (showRewardsFeatureError(error)) return;
            return notify("error", "خطأ", friendlyError(error));
        }
        notify("success", "تم التحديث", reward.isActive ? "تم تعطيل المكافأة." : "تم تفعيل المكافأة.");
        await loadRewards();
    }

    async function removeReward(reward) {
        const note = reward.redemptions > 0
            ? "لها استبدالات سابقة، لذلك ستتم أرشفتها بدل حذفها."
            : "سيتم حذفها نهائيًا.";
        const message = `حذف "${reward.name}"؟ ${note}`;
        const run = async () => {
            const { data, error } = await supabase.rpc("admin_delete_reward", { p_id: reward.id });
            if (error) {
                console.error(error);
                if (showRewardsFeatureError(error)) return;
                return notify("error", "خطأ", friendlyError(error));
            }
            notify("success", "تم", data === "archived" ? "تمت أرشفة المكافأة." : "تم حذف المكافأة.");
            await refreshAll();
        };
        if (window.ModalManager?.confirmDelete) window.ModalManager.confirmDelete(run, "حذف المكافأة", message);
        else if (window.confirm(message)) await run();
    }

    // ------------------------------------------------------ code verification
    function renderVerifyResult(result, code) {
        const box = byId("rewardVerifyResult");
        box.innerHTML = "";
        box.hidden = false;

        const heading = document.createElement("strong");
        heading.style.display = "block";
        heading.style.marginBottom = "8px";

        if (!result.valid) {
            heading.textContent = "❌ " + (ERROR_MESSAGES[result.reason] || "الرمز غير صالح.");
            box.appendChild(heading);
            if (result.redemption) box.appendChild(detailLines(result));
            return;
        }

        heading.textContent = "✅ المكافأة صالحة";
        box.appendChild(heading);
        box.appendChild(detailLines(result));

        const useBtn = document.createElement("button");
        useBtn.type = "button";
        useBtn.className = "button-primary";
        useBtn.style.marginTop = "12px";
        useBtn.textContent = "استخدام المكافأة";
        useBtn.addEventListener("click", () => useCode(code, useBtn));
        box.appendChild(useBtn);
    }

    function detailLines(result) {
        const redemption = result.redemption;
        const wrap = document.createElement("div");
        wrap.style.display = "grid";
        wrap.style.gap = "4px";
        [
            ["العميل", result.customerName || "—"],
            ["المكافأة", redemption.rewardName],
            ["الحالة", STATUS_LABELS[redemption.status] || redemption.status],
            ["تنتهي", fmtDate(redemption.expiresAt)],
        ].forEach(([label, value]) => {
            const line = document.createElement("div");
            line.textContent = `${label}: ${value}`;
            wrap.appendChild(line);
        });
        return wrap;
    }

    async function verifyCode(event) {
        event.preventDefault();
        if (verifying) return;
        const code = byId("rewardVerifyCode").value.trim();
        if (!code) return;
        verifying = true;
        byId("rewardVerifyBtn").disabled = true;
        try {
            const { data, error } = await supabase.rpc("verify_reward_code", { p_code: code });
            if (error) {
                console.error(error);
                if (showRewardsFeatureError(error)) return;
                return notify("error", "خطأ", friendlyError(error));
            }
            renderVerifyResult(data, code);
        } finally {
            verifying = false;
            byId("rewardVerifyBtn").disabled = false;
        }
    }

    async function useCode(code, button) {
        if (using) return;
        using = true;
        button.disabled = true;
        try {
            const { error } = await supabase.rpc("use_reward_code", { p_code: code });
            const box = byId("rewardVerifyResult");
            if (error) {
                console.error(error);
                if (!showRewardsFeatureError(error)) notify("error", "خطأ", friendlyError(error));
                box.hidden = true;
                return;
            }
            notify("success", "تم", "تم استخدام المكافأة.");
            box.hidden = true;
            byId("rewardVerifyCode").value = "";
            await refreshAll();
        } finally {
            using = false;
            button.disabled = false;
        }
    }

    function scheduleRedemptions() {
        clearTimeout(filterTimer);
        filterTimer = setTimeout(loadRedemptions, 250);
    }

    function init() {
        if (!byId("section-rewards")) return;
        byId("rewardAddBtn").addEventListener("click", () => openForm(null));
        byId("rewardModalClose").addEventListener("click", closeForm);
        byId("rewardCancel").addEventListener("click", closeForm);
        byId("rewardType").addEventListener("change", updateTypeFields);
        byId("rewardForm").addEventListener("submit", saveReward);
        byId("rewardVerifyForm").addEventListener("submit", verifyCode);
        ["redemptionStatusFilter", "redemptionRewardFilter", "redemptionFrom", "redemptionTo"].forEach((id) =>
            byId(id).addEventListener("change", loadRedemptions));
        byId("redemptionSearch").addEventListener("input", scheduleRedemptions);
        document.querySelectorAll('.sidebar-link[data-section="rewards"]').forEach((button) =>
            button.addEventListener("click", refreshAll));
    }

    document.addEventListener("DOMContentLoaded", init);
})();
