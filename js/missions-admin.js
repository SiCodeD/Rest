// Admin missions: mission management and basic statistics.
// Validation, progress and rewards are enforced server-side by the Phase 4 RPCs.
(function () {
    "use strict";

    const TYPE_LABELS = { one_time: "مرة واحدة", daily: "يومية", weekly: "أسبوعية", monthly: "شهرية" };
    const ERROR_MESSAGES = {
        MISSION_REWARD_REQUIRED: "حدّد نقاطًا أو خبرة كمكافأة.",
        MISSION_INVALID_WINDOW: "تاريخ الانتهاء يجب أن يكون بعد تاريخ البداية.",
        MISSION_HAS_PROGRESS: "لا يمكن تغيير نوع المهمة أو شرطها أو صنفها بعد بدء تقدّم العملاء.",
        MISSION_ITEM_REQUIRED: "اختر الصنف المطلوب.",
        MISSION_ITEM_NOT_FOUND: "الصنف المحدد غير موجود في مطعمك.",
        "Mission not found": "المهمة غير موجودة.",
        "Not authorized": "لا تملك صلاحية تنفيذ هذا الإجراء.",
    };

    let missions = [];
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let saving = false;
    let menuItemsLoaded = false;

    const byId = (id) => document.getElementById(id);
    const fmt = (value) => Number(value || 0).toLocaleString("en-US");

    function notify(kind, title, message) {
        if (window.Notifications && typeof Notifications[kind] === "function") Notifications[kind](title, message);
    }

    const MISSIONS_FEATURE_ERROR = "Missions are not available on the current plan.";
    const MISSIONS_FEATURE_TITLE = "الميزة غير متاحة في خطتك";
    const MISSIONS_FEATURE_MESSAGE = "المهام غير متاحة في خطتك الحالية. قم بترقية الخطة للوصول إلى هذه الميزة.";

    function showMissionsFeatureError(error) {
        if (!String(error?.message || "").includes(MISSIONS_FEATURE_ERROR)) return false;
        notify("error", MISSIONS_FEATURE_TITLE, MISSIONS_FEATURE_MESSAGE);
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

    function rewardLabel(mission) {
        const parts = [];
        if (Number(mission.rewardPoints) > 0) parts.push(`${fmt(mission.rewardPoints)} نقطة`);
        if (Number(mission.rewardXp) > 0) parts.push(`${fmt(mission.rewardXp)} XP`);
        return parts.join(" + ") || "—";
    }

    // ------------------------------------------------------------------ data
    async function loadStats() {
        const { data, error } = await supabase.rpc("admin_get_mission_stats");
        if (error) {
            console.error("admin_get_mission_stats failed", error);
            showMissionsFeatureError(error);
            return;
        }
        const stats = data || {};
        byId("missionStatTotal").textContent = fmt(stats.totalMissions);
        byId("missionStatActive").textContent = fmt(stats.activeMissions);
        byId("missionStatCompletions").textContent = fmt(stats.totalCompletions);
        byId("missionStatCustomers").textContent = fmt(stats.customersCompleted);
        byId("missionStatPoints").textContent = fmt(stats.pointsAwarded);
        byId("missionStatXp").textContent = fmt(stats.xpAwarded);
    }

    async function loadMissions() {
        const { data, error } = await supabase.rpc("admin_get_missions");
        if (error) {
            console.error("admin_get_missions failed", error);
            if (!showMissionsFeatureError(error)) notify("error", "خطأ", "تعذر تحميل المهام.");
            return;
        }
        missions = data || [];
        renderMissions();
    }

    function renderMissions() {
        byId("missionsCountText").textContent = `${fmt(missions.length)} مهمة`;
        const body = byId("missionsBody");
        body.innerHTML = "";
        if (!missions.length) {
            const row = document.createElement("tr");
            const td = document.createElement("td");
            td.colSpan = 7;
            td.className = "empty-row";
            td.textContent = "لا توجد مهام بعد.";
            row.appendChild(td);
            body.appendChild(row);
            return;
        }

        missions.forEach((mission) => {
            const row = document.createElement("tr");
            const name = cell(row, `${mission.icon ? mission.icon + " " : ""}${mission.title}`);
            if (mission.description) {
                const small = document.createElement("div");
                small.style.color = "var(--muted)";
                small.textContent = mission.description;
                name.appendChild(small);
            }
            cell(row, TYPE_LABELS[mission.missionType] || mission.missionType);
            cell(row, `${fmt(mission.target)} ${mission.conditionType === "item_quantity" ? "قطعة" : "طلب"}`);
            if (mission.conditionType === "item_quantity") {
                const small = document.createElement("div");
                small.style.color = "var(--muted)";
                small.textContent = mission.menuItemName || "صنف غير متاح";
                row.lastElementChild.appendChild(small);
            }
            cell(row, rewardLabel(mission));
            cell(row, mission.isActive ? "فعّالة" : "غير فعّالة");
            cell(row, `${fmt(mission.completions)} (${fmt(mission.customersCompleted)} عميل)`);

            const actions = document.createElement("td");
            actions.className = "text-right loyalty-actions";
            [
                ["icon-btn", "pencil", "تعديل المهمة", () => openForm(mission)],
                ["icon-btn", "power", mission.isActive ? "تعطيل المهمة" : "تفعيل المهمة", () => toggleActive(mission)],
                ["icon-btn-delete", "trash-2", "حذف المهمة", () => removeMission(mission)],
            ].forEach(([className, icon, label, handler]) => {
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

    async function refreshAll() {
        if (window.FeatureGate && !(await window.FeatureGate.hasFeature("missions"))) return;
        await Promise.all([loadMissions(), loadStats()]);
    }

    // ------------------------------------------------------------------ form
    function toLocalInput(value) {
        if (!value) return "";
        const date = new Date(value);
        const offset = date.getTimezoneOffset() * 60000;
        return new Date(date.getTime() - offset).toISOString().slice(0, 16);
    }

    const dateOrNull = (id) => (byId(id).value ? new Date(byId(id).value).toISOString() : null);

    // Scoped to the admin's own restaurant; menu_items is publicly readable across restaurants.
    async function loadMenuItems() {
        if (menuItemsLoaded) return;
        let restaurantId = null;
        try {
            const user = await Auth.getCurrentUser();
            restaurantId = user && user.restaurantId;
        } catch (error) {
            console.error("restaurant context failed", error);
        }
        if (!restaurantId || !UUID_RE.test(String(restaurantId))) {
            notify("error", "خطأ", "تعذر تحديد المطعم الحالي.");
            return;
        }
        const { data, error } = await supabase
            .from("menu_items")
            .select("id, name, menu_categories(name)")
            .eq("restaurant_id", restaurantId)
            .eq("active", true)
            .order("name");
        if (error) {
            console.error("menu items load failed", error);
            notify("error", "خطأ", "تعذر تحميل أصناف المنيو.");
            return;
        }
        const select = byId("missionItem");
        (data || []).forEach((item) => {
            const option = document.createElement("option");
            option.value = item.id;
            const category = item.menu_categories && item.menu_categories.name;
            option.textContent = category ? `${item.name} — ${category}` : item.name;
            select.appendChild(option);
        });
        menuItemsLoaded = true;
        refreshSelect("missionItem");
    }

    function refreshSelect(id) {
        if (window.CustomSelect) window.CustomSelect.refresh(id);
    }

    function updateConditionFields() {
        const isItem = byId("missionCondition").value === "item_quantity";
        byId("missionItemWrap").hidden = !isItem;
        byId("missionItem").required = isItem;
        if (!isItem) {
            byId("missionItem").value = "";
            refreshSelect("missionItem");
        }
        byId("missionTargetLabel").firstChild.textContent = isItem ? "الكمية المطلوبة " : "الهدف (عدد الطلبات) ";
    }

    async function openForm(mission) {
        await loadMenuItems();
        byId("missionForm").reset();
        byId("missionId").value = mission ? mission.id : "";
        byId("missionModalTitle").textContent = mission ? "تعديل المهمة" : "إضافة مهمة";
        if (mission) {
            byId("missionTitle").value = mission.title;
            byId("missionDescription").value = mission.description || "";
            byId("missionIcon").value = mission.icon || "";
            byId("missionType").value = mission.missionType;
            byId("missionCondition").value = mission.conditionType || "orders_count";
            byId("missionItem").value = mission.menuItemId || "";
            byId("missionTarget").value = mission.target;
            byId("missionRewardPoints").value = mission.rewardPoints;
            byId("missionRewardXp").value = mission.rewardXp;
            byId("missionStartsAt").value = toLocalInput(mission.startsAt);
            byId("missionEndsAt").value = toLocalInput(mission.endsAt);
            byId("missionActive").checked = mission.isActive;
        }
        window.syncMissionDateTimePicker?.("missionStartsAt");
        window.syncMissionDateTimePicker?.("missionEndsAt");
        updateConditionFields();
        ["missionType", "missionCondition", "missionItem"].forEach(refreshSelect);
        byId("missionModal").classList.add("open");
        byId("missionTitle").focus();
    }

    function closeForm() {
        byId("missionModal").classList.remove("open");
    }

    async function saveMission(event) {
        event.preventDefault();
        if (saving) return;

        const title = byId("missionTitle").value.trim();
        const condition = byId("missionCondition").value;
        const itemId = byId("missionItem").value;
        const target = Number(byId("missionTarget").value);
        const points = Number(byId("missionRewardPoints").value || 0);
        const xp = Number(byId("missionRewardXp").value || 0);
        const startsAt = dateOrNull("missionStartsAt");
        const endsAt = dateOrNull("missionEndsAt");

        if (!title) return notify("error", "خطأ", "أدخل عنوان المهمة.");
        if (condition !== "orders_count" && condition !== "item_quantity") {
            return notify("error", "خطأ", "شرط المهمة غير مدعوم.");
        }
        if (condition === "item_quantity" && !UUID_RE.test(itemId)) {
            return notify("error", "خطأ", "اختر الصنف المطلوب.");
        }
        if (!Number.isInteger(target) || target < 1 || target > 100000) {
            return notify("error", "خطأ", "أدخل هدفًا صحيحًا بين 1 و100000.");
        }
        if (!Number.isInteger(points) || !Number.isInteger(xp) || points < 0 || xp < 0) {
            return notify("error", "خطأ", "أدخل قيم مكافأة صحيحة.");
        }
        if (points <= 0 && xp <= 0) return notify("error", "خطأ", "حدّد نقاطًا أو خبرة كمكافأة.");
        if (startsAt && endsAt && new Date(startsAt) >= new Date(endsAt)) {
            return notify("error", "خطأ", "تاريخ الانتهاء يجب أن يكون بعد تاريخ البداية.");
        }

        saving = true;
        byId("missionSave").disabled = true;
        try {
            const { error } = await supabase.rpc("admin_save_mission", {
                p_id: byId("missionId").value || null,
                p_title: title,
                p_description: byId("missionDescription").value,
                p_icon: byId("missionIcon").value,
                p_mission_type: byId("missionType").value,
                p_condition_type: condition,
                p_condition_config: condition === "item_quantity" ? { menu_item_id: itemId } : {},
                p_target_value: target,
                p_reward_points: points,
                p_reward_xp: xp,
                p_starts_at: startsAt,
                p_ends_at: endsAt,
                p_is_active: byId("missionActive").checked,
            });
            if (error) {
                console.error("admin_save_mission failed", error);
                if (!showMissionsFeatureError(error)) notify("error", "خطأ", friendlyError(error));
                return;
            }
            notify("success", "تم الحفظ", "تم حفظ المهمة.");
            closeForm();
            await refreshAll();
        } finally {
            saving = false;
            byId("missionSave").disabled = false;
        }
    }

    async function toggleActive(mission) {
        const { error } = await supabase.rpc("admin_set_mission_active", { p_id: mission.id, p_active: !mission.isActive });
        if (error) {
            console.error(error);
            if (showMissionsFeatureError(error)) return;
            return notify("error", "خطأ", friendlyError(error));
        }
        notify("success", "تم التحديث", mission.isActive ? "تم تعطيل المهمة." : "تم تفعيل المهمة.");
        await refreshAll();
    }

    async function removeMission(mission) {
        const note = Number(mission.completions) > 0
            ? "لها إنجازات سابقة، لذلك ستتم أرشفتها."
            : "إذا لم يكن لها تقدّم عملاء سيتم حذفها نهائيًا، وإلا ستتم أرشفتها.";
        const message = `حذف "${mission.title}"؟ ${note}`;
        const run = async () => {
            const { data, error } = await supabase.rpc("admin_delete_mission", { p_id: mission.id });
            if (error) {
                console.error(error);
                if (showMissionsFeatureError(error)) return;
                return notify("error", "خطأ", friendlyError(error));
            }
            notify("success", "تم", data === "archived" ? "تمت أرشفة المهمة." : "تم حذف المهمة.");
            await refreshAll();
        };
        if (window.ModalManager?.confirmDelete) window.ModalManager.confirmDelete(run, "حذف المهمة", message);
        else if (window.confirm(message)) await run();
    }

    function init() {
        if (!byId("section-missions")) return;
        byId("missionAddBtn").addEventListener("click", () => openForm(null));
        byId("missionModalClose").addEventListener("click", closeForm);
        byId("missionCancel").addEventListener("click", closeForm);
        byId("missionCondition").addEventListener("change", updateConditionFields);
        byId("missionForm").addEventListener("submit", saveMission);
        document.querySelectorAll('.sidebar-link[data-section="missions"]').forEach((button) =>
            button.addEventListener("click", refreshAll));
    }

    document.addEventListener("DOMContentLoaded", init);
})();
