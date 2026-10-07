/* Customer-side Rewards (Menu page).
   All balances, eligibility and redemption results come from the server RPCs
   get_customer_rewards / redeem_reward. The browser never changes points. */
(function () {
    "use strict";

    const ERROR_MESSAGES = {
        INSUFFICIENT_POINTS: "رصيد نقاطك غير كافٍ لهذه المكافأة.",
        REWARD_UNAVAILABLE: "هذه المكافأة غير متاحة حاليًا.",
        REWARD_EXPIRED: "انتهت صلاحية هذه المكافأة.",
        REWARD_SOLD_OUT: "نفدت هذه المكافأة.",
        CUSTOMER_LIMIT_REACHED: "وصلت إلى الحد الأقصى لاستبدال هذه المكافأة.",
        CUSTOMER_NOT_FOUND: "تعذر العثور على حسابك.",
        REQUEST_ID_REQUIRED: "حدث خطأ. حاول مرة أخرى.",
    };
    const UNAVAILABLE_LABELS = {
        REWARD_UNAVAILABLE: "غير متاحة حاليًا",
        REWARD_SOLD_OUT: "نفدت الكمية",
        CUSTOMER_LIMIT_REACHED: "وصلت للحد الأقصى",
    };
    const STATUS_LABELS = {
        active: "فعّال",
        used: "مستخدم",
        expired: "منتهي",
        cancelled: "ملغى",
    };

    const state = {
        data: null,
        tab: "available",
        selected: null,
        requestId: null,
        loading: false,
        redeeming: false,
        loadToken: 0,
    };

    const $ = (id) => document.getElementById(id);
    const setText = (id, value) => {
        const el = $(id);
        if (el) el.textContent = value;
    };
    const show = (id, visible) => $(id)?.classList.toggle("hidden", !visible);

    function newRequestId() {
        if (window.crypto?.randomUUID) return window.crypto.randomUUID();
        return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
            const r = (Math.random() * 16) | 0;
            return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
        });
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

    function errorCode(error) {
        const text = `${error?.message || ""} ${error?.details || ""}`;
        const match = text.match(/[A-Z]+(?:_[A-Z]+)+/);
        return match ? match[0] : "";
    }

    function formatNumber(value) {
        return (Number(value) || 0).toLocaleString("en-US");
    }

    function formatDate(value) {
        if (!value) return "";
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return "";
        return date.toLocaleDateString("ar", { year: "numeric", month: "short", day: "numeric" });
    }

    function describeReward(reward) {
        const value = Number(reward.value);
        if (reward.type === "percentage_discount") return `خصم ${value}%`;
        if (reward.type === "fixed_discount") return `خصم ${formatNumber(value)}`;
        if (reward.type === "free_item") {
            return reward.menuItemName ? `${reward.menuItemName} مجانًا` : "عنصر مجاني";
        }
        return "";
    }

    function describeRedemption(item) {
        const value = Number(item.rewardValue);
        if (item.rewardType === "percentage_discount") return `خصم ${value}%`;
        if (item.rewardType === "fixed_discount") return `خصم ${formatNumber(value)}`;
        if (item.rewardType === "free_item") {
            return item.menuItemName ? `${item.menuItemName} مجانًا` : "عنصر مجاني";
        }
        return "";
    }

    function setBalance(points) {
        const value = formatNumber(points);
        setText("rewards-balance", value);
        // keep the already-open loyalty summary in sync
        setText("loyalty-points", String(Number(points) || 0));
    }

    function showView(view) {
        show("rewards-loading", view === "loading");
        show("rewards-error", view === "error");
        show("rewards-list-view", view === "list");
        show("rewards-confirm-view", view === "confirm");
        show("rewards-result-view", view === "result");
    }

    function renderTabs() {
        const available = state.tab === "available";
        [
            ["rewards-tab-available", available],
            ["rewards-tab-mine", !available],
        ].forEach(([id, active]) => {
            const el = $(id);
            if (!el) return;
            el.classList.toggle("bg-primary", active);
            el.classList.toggle("text-on-primary", active);
            el.setAttribute("aria-pressed", String(active));
        });
        show("rewards-available", available);
        show("rewards-mine", !available);
    }

    function renderEmpty(count) {
        const empty = $("rewards-empty");
        if (!empty) return;
        empty.classList.toggle("hidden", count > 0);
        if (count === 0) {
            empty.textContent =
                state.tab === "available"
                    ? "لا توجد مكافآت متاحة حاليًا."
                    : "لم تستبدل أي مكافأة بعد.";
        }
    }

    function renderAvailable() {
        const list = $("rewards-available");
        if (!list) return;
        list.innerHTML = "";
        const rewards = state.data?.rewards || [];
        rewards.forEach((reward) => {
            const row = document.createElement("li");
            row.className =
                "rounded-2xl bg-surface-container-low border border-outline-variant/30 p-4 space-y-2 text-right";

            const title = document.createElement("strong");
            title.className = "block text-on-surface";
            title.textContent = reward.name || "";
            row.appendChild(title);

            const summary = describeReward(reward);
            if (summary) {
                const tag = document.createElement("p");
                tag.className = "text-xs text-primary font-bold";
                tag.textContent = summary;
                row.appendChild(tag);
            }
            if (reward.description) {
                const desc = document.createElement("p");
                desc.className = "text-xs text-on-surface-variant";
                desc.textContent = reward.description;
                row.appendChild(desc);
            }

            const footer = document.createElement("div");
            footer.className = "flex items-center justify-between gap-3";
            const cost = document.createElement("span");
            cost.className = "text-sm font-bold text-primary";
            cost.textContent = `${formatNumber(reward.pointsCost)} نقطة`;

            const button = document.createElement("button");
            button.type = "button";
            const reason = reward.unavailableReason;
            const blocked = Boolean(reason) || !reward.canAfford;
            button.disabled = blocked;
            button.className = blocked
                ? "rounded-xl px-4 py-2 text-xs font-bold border border-outline-variant/30 text-on-surface-variant opacity-60 cursor-not-allowed"
                : "rounded-xl px-4 py-2 text-xs font-bold bg-primary text-on-primary";
            button.textContent = reason
                ? UNAVAILABLE_LABELS[reason] || "غير متاحة"
                : reward.canAfford
                  ? "استبدال"
                  : "نقاط غير كافية";
            if (!blocked) button.addEventListener("click", () => openConfirm(reward));

            footer.append(cost, button);
            row.appendChild(footer);
            list.appendChild(row);
        });
    }

    function renderMine() {
        const list = $("rewards-mine");
        if (!list) return;
        list.innerHTML = "";
        const items = state.data?.redemptions || [];
        items.forEach((item) => {
            const row = document.createElement("li");
            row.className =
                "rounded-2xl bg-surface-container-low border border-outline-variant/30 p-4 space-y-2 text-right";

            const head = document.createElement("div");
            head.className = "flex items-center justify-between gap-3";
            const name = document.createElement("strong");
            name.className = "text-on-surface";
            name.textContent = item.rewardName || "";
            const status = document.createElement("span");
            const isActive = item.status === "active";
            status.className = isActive
                ? "text-[10px] font-bold text-primary"
                : "text-[10px] font-bold text-on-surface-variant";
            status.textContent = STATUS_LABELS[item.status] || item.status || "";
            head.append(name, status);
            row.appendChild(head);

            const summary = describeRedemption(item);
            if (summary) {
                const tag = document.createElement("p");
                tag.className = "text-xs text-primary font-bold";
                tag.textContent = summary;
                row.appendChild(tag);
            }

            const code = document.createElement("p");
            code.dir = "ltr";
            code.className = isActive
                ? "text-lg font-bold tracking-widest text-primary select-all"
                : "text-lg font-bold tracking-widest text-on-surface-variant line-through select-all";
            code.textContent = item.code || "";
            row.appendChild(code);

            const meta = document.createElement("p");
            meta.className = "text-[11px] text-on-surface-variant";
            const parts = [`${formatNumber(item.pointsCost)} نقطة`];
            if (item.status === "used" && item.usedAt) parts.push(`استُخدمت ${formatDate(item.usedAt)}`);
            else if (item.expiresAt) parts.push(`${item.status === "expired" ? "انتهت" : "تنتهي"} ${formatDate(item.expiresAt)}`);
            meta.textContent = parts.join(" • ");
            row.appendChild(meta);

            list.appendChild(row);
        });
    }

    function renderList() {
        renderTabs();
        renderAvailable();
        renderMine();
        const count =
            state.tab === "available"
                ? (state.data?.rewards || []).length
                : (state.data?.redemptions || []).length;
        renderEmpty(count);
        setBalance(state.data?.points);
        showView("list");
    }

    async function loadRewards() {
        const { restaurantId, orderId, trackingToken, sessionToken } = getContext();
        if (!restaurantId || (!sessionToken && (!orderId || !trackingToken)) || !window.supabase) return false;

        const token = ++state.loadToken;
        state.loading = true;
        try {
            const { data, error } = sessionToken
                ? await window.supabase.rpc("get_customer_rewards_by_session", { p_restaurant_id: restaurantId, p_session_token: sessionToken })
                : await window.supabase.rpc("get_customer_rewards", { p_restaurant_id: restaurantId, p_order_id: orderId, p_tracking_token: trackingToken });
            if (token !== state.loadToken) return false;
            if (error) throw error;
            if (!data?.linked) {
                try {
                    localStorage.removeItem(getLoyaltyStorageKey());
                } catch (_) {}
                if (typeof refreshLoyaltyButton === "function") refreshLoyaltyButton();
                window.closeRewardsModal();
                return false;
            }
            state.data = data;
            return true;
        } finally {
            if (token === state.loadToken) state.loading = false;
        }
    }

    window.openRewardsModal = async function openRewardsModal() {
        const { restaurantId, orderId, trackingToken, sessionToken } = getContext();
        if (!restaurantId || (!sessionToken && (!orderId || !trackingToken)) || !window.supabase) return;

        state.tab = "available";
        state.selected = null;
        state.requestId = null;
        $("rewards-modal")?.classList.remove("opacity-0", "pointer-events-none");
        setBalance(state.data?.points ?? "");
        showView("loading");

        try {
            if (await loadRewards()) renderList();
        } catch (error) {
            console.error("Rewards load failed:", error);
            showView("error");
        }
    };

    window.closeRewardsModal = function closeRewardsModal() {
        $("rewards-modal")?.classList.add("opacity-0", "pointer-events-none");
    };

    window.showRewardsTab = function showRewardsTab(tab) {
        if (!state.data || state.redeeming) return;
        state.tab = tab === "mine" ? "mine" : "available";
        renderList();
    };

    window.backToRewardsList = async function backToRewardsList() {
        if (state.redeeming) return;
        state.selected = null;
        state.requestId = null;
        if (state.data) renderList();
        else showView("loading");
        try {
            if (await loadRewards()) renderList();
        } catch (error) {
            console.error("Rewards refresh failed:", error);
            if (!state.data) showView("error");
        }
    };

    function openConfirm(reward) {
        const balance = Number(state.data?.points) || 0;
        const cost = Number(reward.pointsCost) || 0;
        state.selected = reward;
        state.requestId = newRequestId();

        const detail = [reward.name, describeReward(reward)].filter(Boolean).join(" — ");
        setText("rewards-confirm-name", detail);
        setText("rewards-confirm-cost", `${formatNumber(cost)} نقطة`);
        setText("rewards-confirm-balance", `${formatNumber(balance)} نقطة`);
        setText("rewards-confirm-after", `${formatNumber(balance - cost)} نقطة`);
        show("rewards-confirm-error", false);
        setConfirmBusy(false);
        showView("confirm");
    }

    function setConfirmBusy(busy) {
        const button = $("rewards-confirm-btn");
        if (!button) return;
        button.disabled = busy;
        button.classList.toggle("opacity-60", busy);
        button.textContent = busy ? "جاري الاستبدال..." : "تأكيد الاستبدال";
    }

    window.cancelRewardConfirm = function cancelRewardConfirm() {
        if (state.redeeming) return;
        state.selected = null;
        state.requestId = null;
        if (state.data) renderList();
    };

    function showConfirmError(message) {
        const el = $("rewards-confirm-error");
        if (!el) return;
        el.textContent = message;
        el.classList.remove("hidden");
    }

    window.confirmRewardRedemption = async function confirmRewardRedemption() {
        if (state.redeeming || !state.selected) return;
        const { restaurantId, orderId, trackingToken, sessionToken } = getContext();
        if (!restaurantId || (!sessionToken && (!orderId || !trackingToken)) || !window.supabase) return;

        state.redeeming = true;
        setConfirmBusy(true);
        show("rewards-confirm-error", false);

        const reward = state.selected;
        // the same request id is kept across retries so a retry can never double-charge
        const requestId = state.requestId || (state.requestId = newRequestId());

        try {
            const { data, error } = sessionToken
                ? await window.supabase.rpc("redeem_reward_by_session", { p_restaurant_id: restaurantId, p_session_token: sessionToken, p_reward_id: reward.id, p_request_id: requestId })
                : await window.supabase.rpc("redeem_reward", { p_restaurant_id: restaurantId, p_order_id: orderId, p_reward_id: reward.id, p_request_id: requestId, p_tracking_token: trackingToken });
            if (error) throw error;

            const redemption = data?.redemption;
            if (!redemption) throw new Error("EMPTY_REDEMPTION");

            setText("rewards-result-name", redemption.rewardName || reward.name || "");
            setText("rewards-result-code", redemption.code || "");
            setText(
                "rewards-result-expiry",
                redemption.expiresAt ? `صالح حتى ${formatDate(redemption.expiresAt)}` : "",
            );
            if (data.points !== undefined && state.data) state.data.points = data.points;
            setBalance(data.points);
            state.selected = null;
            state.requestId = null;
            state.tab = "mine";
            showView("result");

            // refresh the lists and balance from the server in the background
            loadRewards().catch((err) => console.error("Rewards refresh failed:", err));
        } catch (error) {
            console.error("Reward redemption failed:", error);
            const code = errorCode(error);
            if (code && ERROR_MESSAGES[code]) {
                // definitive server rejection: a new attempt needs a new request id
                state.requestId = null;
                showConfirmError(ERROR_MESSAGES[code]);
                loadRewards().catch(() => {});
            } else {
                showConfirmError("تعذر إتمام الاستبدال. تحقق من اتصالك وحاول مرة أخرى.");
            }
        } finally {
            state.redeeming = false;
            if (state.selected) setConfirmBusy(false);
        }
    };
})();
