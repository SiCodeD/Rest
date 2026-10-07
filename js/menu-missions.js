/* Customer-side Missions (Menu page).
   Progress, completion and rewards are computed and paid by the server.
   This file only reads get_customer_missions and renders the result. */
(function () {
    "use strict";

    const TYPE_LABELS = {
        one_time: "مرة واحدة",
        daily: "يومية",
        weekly: "أسبوعية",
        monthly: "شهرية",
    };
    const STATUS_LABELS = {
        in_progress: "قيد التقدم",
        completed: "مكتملة",
        expired: "غير متاحة / منتهية",
    };
    const STATUS_CLASSES = {
        in_progress: "text-primary",
        completed: "text-green-500",
        expired: "text-on-surface-variant",
    };

    const state = { data: null, loadToken: 0 };

    const $ = (id) => document.getElementById(id);
    const show = (id, visible) => $(id)?.classList.toggle("hidden", !visible);
    const formatNumber = (value) => (Number(value) || 0).toLocaleString("en-US");

    function formatDate(value) {
        if (!value) return "";
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return "";
        return date.toLocaleDateString("ar", { year: "numeric", month: "short", day: "numeric" });
    }

    function getContext() {
        let restaurantId = "";
        let orderId = null;
        let trackingToken = null;
        let sessionToken = null;
        try {
            restaurantId = typeof MENU_RESTAURANT_ID !== "undefined" ? MENU_RESTAURANT_ID : "";
            sessionToken = typeof getCustomerSessionToken === "function" ? getCustomerSessionToken() : null;
            if (restaurantId && typeof getLoyaltyStorageKey === "function") {
                orderId = localStorage.getItem(getLoyaltyStorageKey());
                trackingToken = typeof getCustomerTrackingToken === "function"
                    ? getCustomerTrackingToken(orderId)
                    : null;
            }
        } catch (_) {}
        return { restaurantId, orderId, trackingToken, sessionToken };
    }

    function showView(view) {
        show("missions-loading", view === "loading");
        show("missions-error", view === "error");
        show("missions-list-view", view === "list");
    }

    function isModalOpen() {
        const modal = $("missions-modal");
        return Boolean(modal) && !modal.classList.contains("pointer-events-none");
    }

    function renderMission(mission) {
        const status = STATUS_LABELS[mission.status] ? mission.status : "in_progress";
        const target = Number(mission.target) || 0;
        const progress = Math.min(Number(mission.progress) || 0, target);
        const percent = Math.max(0, Math.min(100, Number(mission.percent) || 0));

        const row = document.createElement("li");
        row.className =
            "rounded-2xl bg-surface-container-low border border-outline-variant/30 p-4 space-y-2 text-right" +
            (status === "expired" ? " opacity-60" : "");

        const head = document.createElement("div");
        head.className = "flex items-start justify-between gap-3";
        const title = document.createElement("strong");
        title.className = "text-on-surface";
        title.textContent = `${mission.icon ? mission.icon + " " : ""}${mission.title || ""}`;
        const badge = document.createElement("span");
        badge.className = `text-[10px] font-bold whitespace-nowrap ${STATUS_CLASSES[status]}`;
        badge.textContent = STATUS_LABELS[status];
        head.append(title, badge);
        row.appendChild(head);

        if (mission.description) {
            const desc = document.createElement("p");
            desc.className = "text-xs text-on-surface-variant";
            desc.textContent = mission.description;
            row.appendChild(desc);
        }

        const type = document.createElement("p");
        type.className = "text-[11px] text-on-surface-variant";
        const typeParts = [TYPE_LABELS[mission.missionType] || ""];
        if (mission.conditionType === "item_quantity" && mission.menuItemName) {
            typeParts.unshift(`اطلب ${formatNumber(target)} × ${mission.menuItemName}`);
        }
        if (mission.endsAt) {
            typeParts.push(`${status === "expired" ? "انتهت" : "تنتهي"} ${formatDate(mission.endsAt)}`);
        }
        type.textContent = typeParts.filter(Boolean).join(" • ");
        row.appendChild(type);

        const bar = document.createElement("div");
        bar.className = "h-2 rounded-full bg-surface-container-highest overflow-hidden";
        bar.setAttribute("role", "progressbar");
        bar.setAttribute("aria-valuemin", "0");
        bar.setAttribute("aria-valuemax", "100");
        bar.setAttribute("aria-valuenow", String(percent));
        const fill = document.createElement("div");
        fill.className = "h-full rounded-full bg-primary transition-all duration-500";
        fill.style.width = `${status === "completed" ? 100 : percent}%`;
        bar.appendChild(fill);
        row.appendChild(bar);

        const footer = document.createElement("div");
        footer.className = "flex items-center justify-between gap-3 text-xs";
        const count = document.createElement("span");
        count.className = "text-on-surface-variant";
        count.textContent = `${formatNumber(progress)} / ${formatNumber(target)}`;
        const rewards = [];
        if (Number(mission.rewardPoints) > 0) rewards.push(`${formatNumber(mission.rewardPoints)} نقطة`);
        if (Number(mission.rewardXp) > 0) rewards.push(`${formatNumber(mission.rewardXp)} XP`);
        const reward = document.createElement("span");
        reward.className = "font-bold text-primary";
        reward.textContent = rewards.length ? `المكافأة: ${rewards.join(" + ")}` : "";
        footer.append(count, reward);
        row.appendChild(footer);

        if (status === "completed" && mission.completedAt) {
            const done = document.createElement("p");
            done.className = "text-[11px] text-green-500";
            done.textContent = `أُنجزت ${formatDate(mission.completedAt)}`;
            row.appendChild(done);
        }
        return row;
    }

    function render() {
        const list = $("missions-list");
        if (!list) return;
        list.innerHTML = "";
        const missions = state.data?.missions || [];
        missions.forEach((mission) => list.appendChild(renderMission(mission)));
        show("missions-empty", missions.length === 0);
        showView("list");
    }

    async function load() {
        const { restaurantId, orderId, trackingToken, sessionToken } = getContext();
        if (!restaurantId || (!sessionToken && (!orderId || !trackingToken)) || !window.supabase) return false;

        const token = ++state.loadToken;
        const { data, error } = sessionToken
            ? await window.supabase.rpc("get_customer_missions_by_session", { p_restaurant_id: restaurantId, p_session_token: sessionToken })
            : await window.supabase.rpc("get_customer_missions", { p_restaurant_id: restaurantId, p_order_id: orderId, p_tracking_token: trackingToken });
        if (token !== state.loadToken) return false;
        if (error) throw error;
        if (!data?.linked) {
            window.closeMissionsModal();
            return false;
        }
        state.data = data;
        return true;
    }

    window.openMissionsModal = async function openMissionsModal() {
        const { restaurantId, orderId, sessionToken } = getContext();
        if (!restaurantId || (!sessionToken && !orderId) || !window.supabase) return;

        $("missions-modal")?.classList.remove("opacity-0", "pointer-events-none");
        if (state.data) render();
        else showView("loading");

        try {
            if (await load()) render();
        } catch (error) {
            console.error("Missions load failed:", error);
            if (!state.data) showView("error");
        }
    };

    window.closeMissionsModal = function closeMissionsModal() {
        $("missions-modal")?.classList.add("opacity-0", "pointer-events-none");
    };

    // Called whenever loyalty data is refreshed; re-renders only if the modal is open.
    window.refreshCustomerMissions = async function refreshCustomerMissions() {
        try {
            if ((await load()) && isModalOpen()) render();
        } catch (error) {
            console.error("Missions refresh failed:", error);
        }
    };
})();
