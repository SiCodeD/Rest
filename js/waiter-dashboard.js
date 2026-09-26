(function () {
    "use strict";

    const state = {
        session: null,
        orders: [],
        calls: [],
        realtimeChannel: null,
        audioContext: null,
        audioUnlocked: false,
        initialDataLoaded: false,
        notifiedOrderIds: new Set(),
        notifiedCallIds: new Set(),
    };

    const elements = {};

    function cacheElements() {
        [
            "waiterReadyLoading", "waiterReadyEmpty", "waiterReadyError", "waiterReadyErrorMessage",
            "waiterReadyOrders", "waiterReadyCount", "waiterRefreshOrders", "waiterReadyLiveStatus",
            "waiterReadyActionMessage", "waiterCallsLoading", "waiterCallsEmpty", "waiterCallsError",
            "waiterCallsErrorMessage", "waiterCallsList", "waiterCallsCount", "waiterNotificationButton",
            "waiterNotificationToasts",
        ].forEach(function (id) { elements[id] = document.getElementById(id); });
    }

    function escapeHtml(value) {
        return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }

    function formatTime(value) {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("ar-SA", { hour: "2-digit", minute: "2-digit" }).format(date);
    }

    function setView(view) {
        ["waiterReadyLoading", "waiterReadyEmpty", "waiterReadyError", "waiterReadyOrders"].forEach(function (key) {
            if (elements[key]) elements[key].hidden = key !== view;
        });
    }

    function getNotificationStorageKey() {
        return "mazaq_waiter_browser_notifications_" + (state.session?.restaurantId || "unknown");
    }

    function getStoredNotificationChoice() {
        try { return localStorage.getItem(getNotificationStorageKey()); } catch (error) { return null; }
    }

    function saveNotificationChoice(choice) {
        try { localStorage.setItem(getNotificationStorageKey(), choice); } catch (error) { console.warn("Could not save notification preference:", error); }
    }

    function updateNotificationButton() {
        const button = elements.waiterNotificationButton;

        if (!button) return;

        if (!("Notification" in window)) {
            button.hidden = true;
            return;
        }

        const permission = Notification.permission;
        const storedChoice = getStoredNotificationChoice();

        const enabled =
            permission === "granted" &&
            storedChoice === "enabled";

        button.hidden = false;

        button.disabled = permission === "denied";

        button.classList.toggle("is-enabled", enabled);

        if (permission === "denied") {
            button.innerHTML =
                '<span class="material-symbols-outlined">notifications_off</span><span class="waiter-btn-label">الإشعارات محظورة</span>';

        } else if (enabled) {
            button.innerHTML =
                '<span class="material-symbols-outlined">notifications_active</span><span class="waiter-btn-label">إيقاف الإشعارات</span>';

        } else {
            button.innerHTML =
                '<span class="material-symbols-outlined">notifications</span><span class="waiter-btn-label">تفعيل الإشعارات</span>';
        }
    }

    window.WaiterDashboard = Object.assign({}, window.WaiterDashboard, {
        updateNotificationButton: updateNotificationButton,
    });

    async function requestBrowserNotifications() {
        if (!("Notification" in window)) return;

        const toggleButton = elements.waiterNotificationButton;
        if (toggleButton) toggleButton.disabled = true;

        try {
            await handleNotificationToggle();
        } finally {
            await updateNotificationButton();

            if (toggleButton) {
                toggleButton.disabled = false;
            }
        }
    }

    async function handleNotificationToggle() {
        if (!("Notification" in window)) return;

        // 🚫 الإشعارات محظورة من الجهاز أو المتصفح
        if (Notification.permission === "denied") {
            showInAppNotification(
                "إشعارات المتصفح محظورة من إعدادات الجهاز.",
                "error"
            );

            return;
        }

        const isCurrentlyEnabled =
            Notification.permission === "granted" &&
            getStoredNotificationChoice() === "enabled";

        // 🔕 إذا كانت مفعّلة → عطّلها
        if (isCurrentlyEnabled) {
            try {
                await window.WaiterPush.unregisterCurrentDevice(state.session);

                saveNotificationChoice("disabled");

                showInAppNotification(
                    "تم إيقاف إشعارات الخلفية لهذا الجهاز.",
                    "success"
                );

            } catch (error) {
                console.warn("Waiter notification disable failed:", error);

                showInAppNotification(
                    "تعذر إيقاف إشعارات الخلفية. حاول مرة أخرى.",
                    "error"
                );
            }

            return;
        }

        // 🔔 إذا كانت غير مفعّلة → فعّلها
        try {
            const result = await window.WaiterPush.enableForSession(
                state.session
            );

            if (result.pushEnabled) {
                saveNotificationChoice("enabled");

                showInAppNotification(
                    "تم تفعيل إشعارات الخلفية لهذا الجهاز.",
                    "success"
                );
            }

        } catch (error) {
            console.warn("Waiter notification enable failed:", error);

            showInAppNotification(
                "تعذر تفعيل إشعارات الخلفية. حاول مرة أخرى.",
                "error"
            );
        }
    }
    function canShowBrowserNotifications() {
        return "Notification" in window && Notification.permission === "granted" && getStoredNotificationChoice() === "enabled";
    }

    function showBrowserNotification(title, body) {
        if (!canShowBrowserNotifications()) return;
        try {
            const notification = new Notification(title, { body: body, icon: "/waiter-icon.svg", tag: "waiter-" + title + "-" + Date.now() });
            notification.onclick = function () { window.focus(); notification.close(); };
        } catch (error) {
            console.warn("Browser notification unavailable:", error);
        }
    }

    function showInAppNotification(message, type) {
        const container = elements.waiterNotificationToasts;
        if (!container || !message) return;
        const toast = document.createElement("div");
        toast.className = "waiter-notification-toast" + (type ? " is-" + type : "");
        toast.setAttribute("role", "status");
        toast.innerHTML = '<span class="material-symbols-outlined">' + (type === "call" ? "notifications_active" : type === "error" ? "info" : "room_service") + "</span><span></span>";
        toast.lastElementChild.textContent = message;
        container.appendChild(toast);
        window.setTimeout(function () { toast.remove(); }, 6000);
    }

    function unlockAudio() {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext || state.audioUnlocked) return;
        try {
            state.audioContext ||= new AudioContext();
            state.audioContext.resume().then(function () { state.audioUnlocked = state.audioContext.state === "running"; }).catch(function () { });
        } catch (error) {
            console.warn("Waiter notification sound unavailable:", error);
        }
    }

    function playNotificationChime(kind) {
        if (!state.audioUnlocked || !state.audioContext) return;
        try {
            const context = state.audioContext;
            const now = context.currentTime;
            const oscillator = context.createOscillator();
            const gain = context.createGain();
            oscillator.type = kind === "call" ? "triangle" : "sine";
            oscillator.frequency.setValueAtTime(kind === "call" ? 880 : 660, now);
            oscillator.frequency.setValueAtTime(kind === "call" ? 1175 : 988, now + 0.16);
            gain.gain.setValueAtTime(0.16, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
            oscillator.connect(gain);
            gain.connect(context.destination);
            oscillator.start(now);
            oscillator.stop(now + 0.55);
        } catch (error) {
            console.warn("Waiter notification sound unavailable:", error);
        }
    }

    function showActionMessage(message, isError) {
        const element = elements.waiterReadyActionMessage;
        if (!element) return;
        element.textContent = message || "";
        element.hidden = !message;
        element.classList.toggle("is-error", Boolean(isError));
    }

    function renderOrders() {
        const orders = state.orders;
        if (elements.waiterReadyCount) elements.waiterReadyCount.textContent = orders.length;
        if (!orders.length) { setView("waiterReadyEmpty"); return; }
        elements.waiterReadyOrders.innerHTML = orders.map(function (order) {
            const tableName = order.tableName || "طلب سفري";
            const items = Array.isArray(order.items) ? order.items : [];
            const claimedBy = order.claimedBy;
            const claimMarkup = claimedBy
                ? `<div class="waiter-claim-status"><span class="material-symbols-outlined">person_check</span>${claimedBy.employeeId === state.session.employeeId ? "أنت استلمت المهمة" : "القرصون " + escapeHtml(claimedBy.name || "غير معروف") + " استلم المهمة"}</div>`
                : `<button class="waiter-claim-button" type="button" data-claim-order="${escapeHtml(order.id)}"><span class="material-symbols-outlined">touch_app</span>استلام المهمة</button>`;
            return `<article class="waiter-ready-order"><div class="waiter-ready-order-head"><div><span class="waiter-ready-kicker"><span class="material-symbols-outlined">notifications_active</span> جاهز للتسليم</span><h3>طلب #${escapeHtml(order.orderNumber || String(order.id).slice(0, 6))}</h3></div><time>${escapeHtml(formatTime(order.createdAt))}</time></div><div class="waiter-ready-meta"><span><span class="material-symbols-outlined">table_restaurant</span>${escapeHtml(tableName)}</span>${order.customerName ? `<span><span class="material-symbols-outlined">person</span>${escapeHtml(order.customerName)}</span>` : ""}</div><div class="waiter-ready-items">${items.map(function (item) { return `<div><strong>${escapeHtml(item.quantity)}x</strong><span>${escapeHtml(item.itemName)}</span></div>`; }).join("")}</div>${order.notes ? `<p class="waiter-ready-notes"><span class="material-symbols-outlined">sticky_note_2</span>${escapeHtml(order.notes)}</p>` : ""}${claimMarkup}</article>`;
        }).join("");
        setView("waiterReadyOrders");
    }

    function renderCalls() {
        const calls = state.calls;
        if (elements.waiterCallsCount) elements.waiterCallsCount.textContent = calls.length;
        ["waiterCallsLoading", "waiterCallsEmpty", "waiterCallsError", "waiterCallsList"].forEach(function (key) {
            if (elements[key]) elements[key].hidden = key !== (calls.length ? "waiterCallsList" : "waiterCallsEmpty");
        });
        if (!calls.length || !elements.waiterCallsList) return;
        elements.waiterCallsList.innerHTML = calls.map(function (call) {
            const claimedBy = call.claimedBy;
            const claimMarkup = claimedBy
                ? `<div class="waiter-call-claim-status"><span class="material-symbols-outlined">person_check</span>${claimedBy.employeeId === state.session.employeeId ? "أنت استلمت النداء" : "القرصون " + escapeHtml(claimedBy.name || "غير معروف") + " استلم النداء"}</div>`
                : `<button class="waiter-call-claim-button" type="button" data-claim-call="${escapeHtml(call.id)}"><span class="material-symbols-outlined">touch_app</span>استلام النداء</button>`;
            return `<article class="waiter-call-card"><div class="waiter-call-head"><div class="waiter-call-icon"><span class="material-symbols-outlined">notifications_active</span></div><div class="waiter-call-copy"><strong>${call.tableCode ? "طاولة " + escapeHtml(call.tableCode) + " قامت بمناداتك" : "عميل قام بمناداتك"}</strong><span>الضيف: ${escapeHtml(call.guestName || "ضيف")}</span></div><time>${escapeHtml(formatTime(call.createdAt))}</time></div><div class="waiter-call-table-line"><span class="material-symbols-outlined">table_restaurant</span>${call.tableCode ? "طاولة " + escapeHtml(call.tableCode) : "طلب خدمة من الصالة"}</div><div class="waiter-call-claim-wrap">${claimMarkup}</div></article>`;
        }).join("");
    }

    async function claimCall(callId, button) {
        if (!state.session || !button) return;
        button.disabled = true;
        button.innerHTML = '<span class="material-symbols-outlined waiter-spin-icon">progress_activity</span>جاري الاستلام...';
        try {
            const { data, error } = await supabase.rpc("claim_waiter_call", { p_restaurant_id: state.session.restaurantId, p_call_id: callId, p_employee_id: state.session.employeeId, p_session_token: state.session.sessionToken });
            if (error) throw error;
            const result = Array.isArray(data) ? data[0] : data;
            showActionMessage(result?.status === "already_claimed" ? "القرصون " + (result.name || "موظف آخر") + " استلم النداء قبلك." : "تم استلام النداء بنجاح.", result?.status === "already_claimed");
            await loadWaiterCalls();
        } catch (error) {
            console.error("claimCall error:", error);
            showActionMessage("تعذر استلام النداء. حاول مرة أخرى.", true);
            button.disabled = false;
            button.innerHTML = '<span class="material-symbols-outlined">touch_app</span>استلام النداء';
        }
    }

    async function claimOrder(orderId, button) {
        if (!state.session || !button) return;
        button.disabled = true;
        button.innerHTML = '<span class="material-symbols-outlined waiter-spin-icon">progress_activity</span>جاري الاستلام...';
        showActionMessage("");
        try {
            const { data, error } = await supabase.rpc("claim_ready_order", { p_restaurant_id: state.session.restaurantId, p_order_id: orderId, p_employee_id: state.session.employeeId, p_session_token: state.session.sessionToken });
            if (error) throw error;
            const result = Array.isArray(data) ? data[0] : data;
            showActionMessage(result?.status === "already_claimed" ? "القرصون " + (result.name || "موظف آخر") + " استلم المهمة قبلك." : "تم استلام المهمة بنجاح.", result?.status === "already_claimed");
            await loadReadyOrders(false);
        } catch (error) {
            console.error("claimOrder error:", error);
            var errMsg = String((error && error.message) || "");
            if (/not ready/i.test(errMsg)) {
                // Another waiter already picked it up (order is now served).
                showActionMessage("هذا الطلب تم تسليمه بالفعل.", false);
                await loadReadyOrders(false);
            } else {
                showActionMessage("تعذر استلام المهمة. حاول مرة أخرى.", true);
                button.disabled = false;
                button.innerHTML = '<span class="material-symbols-outlined">touch_app</span>استلام المهمة';
            }
        }
    }

    function getErrorMessage(error) {
        const message = String(error?.message || "");
        return /function .*get_waiter_ready_orders.* does not exist|PGRST202/i.test(message)
            ? "لم يتم تفعيل خدمة طلبات القرصون في قاعدة البيانات بعد."
            : "تعذر تحميل الطلبات الجاهزة. حاول مرة أخرى.";
    }

    async function loadWaiterCalls() {
        if (!state.session) return;
        try {
            const { data, error } = await supabase.rpc("get_waiter_calls", { p_restaurant_id: state.session.restaurantId, p_employee_id: state.session.employeeId, p_session_token: state.session.sessionToken });
            if (error) throw error;
            state.calls = Array.isArray(data) ? data : [];
            renderCalls();
        } catch (error) {
            console.error("loadWaiterCalls error:", error);
            if (elements.waiterCallsErrorMessage) elements.waiterCallsErrorMessage.textContent = getErrorMessage(error);
            if (elements.waiterCallsLoading) elements.waiterCallsLoading.hidden = true;
            if (elements.waiterCallsEmpty) elements.waiterCallsEmpty.hidden = true;
            if (elements.waiterCallsList) elements.waiterCallsList.hidden = true;
            if (elements.waiterCallsError) elements.waiterCallsError.hidden = false;
        }
    }

    async function loadReadyOrders(showLoading) {
        if (!state.session) return;
        if (showLoading) setView("waiterReadyLoading");
        try {
            const { data, error } = await supabase.rpc("get_waiter_ready_orders", { p_restaurant_id: state.session.restaurantId, p_employee_id: state.session.employeeId, p_session_token: state.session.sessionToken });
            if (error) throw error;
            state.orders = Array.isArray(data) ? data : [];
            renderOrders();
        } catch (error) {
            console.error("loadReadyOrders error:", error);
            if (elements.waiterReadyErrorMessage) elements.waiterReadyErrorMessage.textContent = getErrorMessage(error);
            setView("waiterReadyError");
        }
    }

    function belongsToCurrentRestaurant(payload) {
        const restaurantId = payload?.new?.restaurant_id || payload?.old?.restaurant_id;
        return Boolean(restaurantId && state.session?.restaurantId && restaurantId === state.session.restaurantId);
    }

    function handleOrderRealtime(payload) {
        if (!belongsToCurrentRestaurant(payload)) return;
        const order = payload.new || {};
        const isNewReadyOrder = order.status === "ready" && order.id && !state.notifiedOrderIds.has(order.id);
        if (isNewReadyOrder) {
            state.notifiedOrderIds.add(order.id);
        }
        if (isNewReadyOrder && state.initialDataLoaded) {
            showInAppNotification("يوجد طلب جديد جاهز للتسليم.", "order");
            playNotificationChime("order");
            showBrowserNotification("طلب جاهز للتسليم", "يوجد طلب جديد جاهز للاستلام.");
        }
        loadReadyOrders(false);
    }

    function handleCallRealtime(payload) {
        console.log("🔥 WAITER CALL REALTIME EVENT:", payload);
        if (!belongsToCurrentRestaurant(payload)) return;
        const call = payload.new || {};
        const isNewCall = payload.eventType === "INSERT" && call.id && !state.notifiedCallIds.has(call.id);
        if (isNewCall) {
            state.notifiedCallIds.add(call.id);
        }
        if (isNewCall && state.initialDataLoaded) {
            const tableLabel = call.table_code ? " — طاولة " + call.table_code : "";
            const guestName = call.guest_name || "ضيف";
            showInAppNotification("نداء جديد من " + guestName + tableLabel, "call");
            playNotificationChime("call");
            showBrowserNotification("نداء جديد", "الضيف: " + guestName + tableLabel);
        }
        loadWaiterCalls();
    }

    function setupRealtime() {
        if (!state.session?.restaurantId || !window.supabase || state.realtimeChannel) {
            console.log("Realtime setup skipped:", {
                restaurantId: state.session?.restaurantId,
                hasSupabase: !!window.supabase,
                hasChannel: !!state.realtimeChannel
            });
            return;
        }

        console.log("Starting Realtime for restaurant:", state.session.restaurantId);

        state.realtimeChannel = window.supabase
            .channel("waiter-live-" + state.session.restaurantId)

            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "waiter_calls"
                },
                function (payload) {
                    console.log("🔥 RAW WAITER CALL EVENT:", payload);

                    handleCallRealtime(payload);
                }
            )

            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "orders"
                },
                function (payload) {
                    console.log("📦 RAW ORDER EVENT:", payload);

                    handleOrderRealtime(payload);
                }
            )

            // 👇 مهم جداً
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "order_waiter_claims"
                },
                function (payload) {
                    console.log("🙋 ORDER CLAIM EVENT:", payload);

                    if (!belongsToCurrentRestaurant(payload)) return;

                    loadReadyOrders(false);
                }
            )

            .subscribe(function (status, err) {
                console.log("Realtime status:", status, err);

                if (!elements.waiterReadyLiveStatus) return;

                elements.waiterReadyLiveStatus.textContent =
                    status === "SUBSCRIBED"
                        ? "متصل مباشر"
                        : status === "CHANNEL_ERROR" || status === "TIMED_OUT"
                            ? "تعذر الاتصال المباشر"
                            : "جاري الاتصال";
            });
    }

    async function init() {
        cacheElements();
        // Object.keys(localStorage)
        //     .filter(function (key) {
        //         return key.startsWith("mazaq_waiter_browser_notifications_");
        //     })
        //     .forEach(function (key) {
        //         localStorage.removeItem(key);
        //     });

        // console.log("تم حذف إعدادات الإشعارات القديمة");
        state.session = await EmployeeAuth.requireSession();
        if (!state.session) return;
        updateNotificationButton();
        // Subscribe first, but keep the first data snapshot completely silent.
        // This closes the race between the initial RPC reads and the live channel.
        setupRealtime();
        await Promise.all([loadReadyOrders(true), loadWaiterCalls()]);
        // Old records are rendered, but never turned into alerts.
        state.orders.forEach(function (order) { state.notifiedOrderIds.add(order.id); });
        state.calls.forEach(function (call) { state.notifiedCallIds.add(call.id); });
        state.initialDataLoaded = true;

        elements.waiterRefreshOrders?.addEventListener("click", function () { loadReadyOrders(true); });
        elements.waiterReadyOrders?.addEventListener("click", function (event) {
            const button = event.target.closest("[data-claim-order]");
            if (button) claimOrder(button.dataset.claimOrder, button);
        });
        elements.waiterCallsList?.addEventListener("click", function (event) {
            const button = event.target.closest("[data-claim-call]");
            if (button) claimCall(button.dataset.claimCall, button);
        });
        elements.waiterNotificationButton?.addEventListener("click", requestBrowserNotifications);
        ["pointerdown", "keydown", "touchstart"].forEach(function (eventName) {
            document.addEventListener(eventName, unlockAudio, { once: true, passive: eventName !== "keydown" });
        });
    }

    window.addEventListener("pagehide", function () {
        if (state.realtimeChannel && window.supabase) window.supabase.removeChannel(state.realtimeChannel);
        if (state.audioContext) state.audioContext.close();
    });

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
})();
