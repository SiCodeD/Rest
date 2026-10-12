// Admin loyalty section: overview, point/XP rules and level management.
// All calculations and authorization happen in Supabase RPCs; this file only renders and submits.
(function () {
    "use strict";

    let loading = false;
    let rewardRules = [];

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
    const RULE_EVENT_LABELS = {
        order_completed: "إتمام طلب",
        first_order: "أول طلب",
        visit: "زيارة عند تسليم الطلب",
        review_submitted: "إرسال تقييم",
        manual: "منح يدوي من الإدارة",
    };
    const REPEAT_LABELS = {
        once: "مرة واحدة",
        unlimited: "بلا حد",
        limited: "عدد محدد",
    };

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
            const [overview, config, rules] = await Promise.all([
                supabase.rpc("admin_get_loyalty_overview"),
                supabase.rpc("admin_get_loyalty_config"),
                supabase.rpc("admin_get_loyalty_reward_rules"),
            ]);
            if (overview.error) throw overview.error;
            if (config.error) throw config.error;
            if (rules.error) throw rules.error;
            const cfgLevels = (config.data && config.data.levels) || [];
            rewardRules = Array.isArray(rules.data) ? rules.data : [];
            setLevelColors(cfgLevels.length ? cfgLevels : (overview.data && overview.data.levels) || []);
            renderOverview(overview.data || {});
            renderRewardRules(rewardRules);
            renderLevels(cfgLevels);
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

    function makeRuleCell(label, child) {
        const cell = document.createElement("td");
        cell.dataset.label = label;
        cell.appendChild(child);
        return cell;
    }

    function makeRuleSelect(options, value, disabled) {
        const select = document.createElement("select");
        select.className = "select-modern";
        select.disabled = Boolean(disabled);
        options.forEach(([optionValue, label]) => {
            const option = document.createElement("option");
            option.value = optionValue;
            option.textContent = label;
            option.selected = optionValue === value;
            select.appendChild(option);
        });
        return select;
    }

    function renderRewardRules(rules) {
        const body = byId("loyaltyRulesBody");
        if (!body) return;
        body.replaceChildren();

        rules.forEach((rule) => {
            const row = makeRewardRuleRow(rule);
            body.appendChild(row);
            enhanceRuleSelects(row);
        });
        refreshManualRuleSelect();
    }

    function enhanceRuleSelects(row) {
        row.querySelectorAll("select.select-modern").forEach((select) => {
            window.CustomSelect?.refresh(select);
            const button = select.previousElementSibling?.querySelector(
                ".custom-select-button",
            );
            if (!button) return;
            button.disabled = select.disabled;
            button.setAttribute("aria-label", select.closest("td")?.dataset.label || "");
        });
    }

    function makeRewardRuleRow(rule) {
        const row = document.createElement("tr");
        row.dataset.ruleId = rule.id || "";
        row.dataset.builtin = rule.isBuiltin ? "true" : "false";

        const name = document.createElement(rule.isBuiltin ? "strong" : "input");
        if (rule.isBuiltin) {
            name.textContent = rule.name;
            name.className = "lx-evt";
        } else {
            name.type = "text";
            name.className = "input-modern";
            name.maxLength = 80;
            name.placeholder = "اسم القاعدة";
            name.value = rule.name || "";
            name.dataset.field = "name";
        }
        row.appendChild(makeRuleCell("الحدث", name));

        const event = makeRuleSelect(
            Object.entries(RULE_EVENT_LABELS),
            rule.eventType || "manual",
            rule.isBuiltin,
        );
        event.dataset.field = "eventType";
        row.appendChild(makeRuleCell("التفعيل", event));

        const enabled = document.createElement("input");
        enabled.type = "checkbox";
        enabled.checked = rule.isEnabled === true;
        enabled.dataset.field = "isEnabled";
        row.appendChild(makeRuleCell("مفعّل", enabled));

        ["points", "xp"].forEach((field) => {
            const input = document.createElement("input");
            input.type = "number";
            input.className = "input-modern";
            input.min = "0";
            input.max = "100000";
            input.step = "1";
            input.value = Number(rule[field]) || 0;
            input.dataset.field = field;
            row.appendChild(makeRuleCell(field === "points" ? "نقاط" : "XP", input));
        });

        const frequency = document.createElement("div");
        frequency.style.cssText = "display:grid;gap:6px;min-width:130px";
        const repeat = makeRuleSelect(
            Object.entries(REPEAT_LABELS),
            rule.repeatMode || "unlimited",
            rule.ruleKey === "first_order",
        );
        repeat.dataset.field = "repeatMode";
        const maxAwards = document.createElement("input");
        maxAwards.type = "number";
        maxAwards.className = "input-modern";
        maxAwards.min = "1";
        maxAwards.max = "100000";
        maxAwards.step = "1";
        maxAwards.placeholder = "عدد المرات";
        maxAwards.value = rule.maxAwards || "";
        maxAwards.dataset.field = "maxAwards";
        maxAwards.hidden = repeat.value !== "limited";
        repeat.addEventListener("change", () => {
            maxAwards.hidden = repeat.value !== "limited";
        });
        frequency.append(repeat, maxAwards);
        row.appendChild(makeRuleCell("التكرار / الحد", frequency));

        const actions = document.createElement("td");
        actions.dataset.label = "إجراء";
        actions.className = "text-right loyalty-actions";
        if (!rule.isBuiltin) {
            const remove = document.createElement("button");
            remove.type = "button";
            remove.className = "icon-btn-delete";
            remove.setAttribute("data-tooltip", "حذف القاعدة");
            remove.setAttribute("aria-label", "حذف القاعدة");
            remove.innerHTML = window.lucideIcon("trash-2");
            remove.addEventListener("click", () => deleteRewardRule(row));
            actions.appendChild(remove);
        }
        row.appendChild(actions);
        return row;
    }

    function addRewardRuleRow() {
        const body = byId("loyaltyRulesBody");
        if (!body) return;
        const row = makeRewardRuleRow({
            name: "",
            eventType: "manual",
            isEnabled: true,
            points: 5,
            xp: 0,
            repeatMode: "unlimited",
            isBuiltin: false,
        });
        body.appendChild(row);
        enhanceRuleSelects(row);
        row.querySelector('[data-field="name"]')?.focus();
    }

    function collectRewardRules() {
        return [...byId("loyaltyRulesBody").querySelectorAll("tr")].map((row) => {
            const value = (field) => row.querySelector(`[data-field="${field}"]`);
            const repeatMode = value("repeatMode")?.value || "unlimited";
            const points = Number(value("points")?.value);
            const xp = Number(value("xp")?.value);
            const maxAwards = Number(value("maxAwards")?.value);
            const name = row.querySelector('[data-field="name"]')?.value?.trim()
                || row.querySelector(".lx-evt")?.textContent?.trim()
                || "";

            if (!name || !Number.isInteger(points) || points < 0 || points > 100000
                || !Number.isInteger(xp) || xp < 0 || xp > 100000) {
                throw new Error("أدخل اسمًا ومقادير صحيحة للنقاط وXP.");
            }
            if (repeatMode === "limited"
                && (!Number.isInteger(maxAwards) || maxAwards < 1 || maxAwards > 100000)) {
                throw new Error("أدخل حدًا صحيحًا من 1 إلى 100000.");
            }
            return {
                id: row.dataset.ruleId || null,
                name,
                eventType: value("eventType")?.value || "manual",
                isEnabled: value("isEnabled")?.checked === true,
                points,
                xp,
                repeatMode,
                maxAwards: repeatMode === "limited" ? maxAwards : null,
            };
        });
    }

    function refreshManualRuleSelect() {
        const select = byId("loyaltyManualRuleSelect");
        const button = byId("loyaltyManualRuleAward");
        if (!select || !button) return;
        const selected = select.value;
        select.replaceChildren();
        rewardRules
            .filter((rule) => !rule.isBuiltin && rule.eventType === "manual" && rule.isEnabled)
            .forEach((rule) => {
                const option = document.createElement("option");
                option.value = rule.id;
                option.textContent = rule.name;
                select.appendChild(option);
            });
        if (selected) select.value = selected;
        select.disabled = select.options.length === 0;
        button.disabled = select.disabled;
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
        await withButton(byId("loyaltySettingsSave"), async () => {
            try {
                const rules = collectRewardRules();
                const { error } = await supabase.rpc("admin_save_loyalty_reward_rules", { p_rules: rules });
                if (error) throw error;
                notify("success", "تم الحفظ", "تم تحديث قواعد الولاء.");
                await loadAll();
            } catch (error) {
                console.error("Loyalty rules save failed:", error);
                if (error instanceof Error && !error.code) {
                    notify("error", "خطأ", error.message);
                } else if (!showLoyaltyFeatureError(error)) {
                    notify("error", "خطأ", friendlyError(error));
                }
            }
        });
    }

    async function deleteRewardRule(row) {
        const ruleId = row.dataset.ruleId;
        if (!ruleId) {
            row.remove();
            return;
        }
        const { error } = await supabase.rpc("admin_delete_loyalty_reward_rule", { p_id: ruleId });
        if (error) {
            console.error("Loyalty rule delete failed:", error);
            if (!showLoyaltyFeatureError(error)) notify("error", "خطأ", friendlyError(error));
            return;
        }
        notify("success", "تم الحذف", "تم إيقاف القاعدة.");
        await loadAll();
    }

    async function awardManualRule() {
        if (!selectedCustomer) return;
        const ruleId = byId("loyaltyManualRuleSelect").value;
        if (!ruleId) return;
        const button = byId("loyaltyManualRuleAward");
        await withButton(button, async () => {
            const { data, error } = await supabase.rpc("admin_award_loyalty_rule", {
                p_customer_id: selectedCustomer.id,
                p_rule_id: ruleId,
            });
            if (error) {
                console.error("Manual loyalty rule award failed:", error);
                if (/reward limit reached/i.test(error.message || "")) {
                    notify("error", "تم بلوغ الحد", "استنفد هذا العميل عدد مرات استحقاق القاعدة.");
                } else if (!showLoyaltyFeatureError(error)) {
                    notify("error", "خطأ", friendlyError(error));
                }
                return;
            }
            const awards = Array.isArray(data) ? data : [];
            if (!awards.length) {
                notify("error", "لم تُمنح المكافأة", "لم تنطبق القاعدة على هذا العميل.");
                return;
            }
            notify("success", "تم منح المكافأة", awards.map((award) =>
                `${award.points} نقطة و${award.xp} XP`,
            ).join("، "));
            const keepId = selectedCustomer.id;
            await loadAll();
            selectedCustomer = await fetchCustomer(keepId);
            if (selectedCustomer) {
                renderCustomerHeader();
                await loadCustomerActivity();
                await window.refreshAdminCustomerProfile?.(keepId);
            }
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
    let selectedCustomer = null;
    let adjusting = false;

    function openModal(id) { byId(id).classList.add("open"); }
    function closeModal(id) { byId(id).classList.remove("open"); }

    async function fetchCustomer(customerId) {
        const { data, error } = await supabase
            .from("restaurant_customer_accounts")
            .select("id, display_name, points_balance, xp_total, customer_profiles(normalized_phone), loyalty_levels(name, badge)")
            .eq("id", customerId)
            .maybeSingle();
        if (error) throw error;
        return data;
    }

    async function openCustomer(customerId) {
        try {
            selectedCustomer = await fetchCustomer(customerId);
        } catch (error) {
            console.error("Customer loyalty details load failed:", error);
            if (!showLoyaltyFeatureError(error)) {
                notify("error", "خطأ", "تعذر تحميل سجل الولاء.");
            }
            return;
        }
        if (!selectedCustomer) {
            notify("error", "خطأ", "العميل غير موجود.");
            return;
        }
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

    async function managePointsForCustomer(customerId) {
        try {
            selectedCustomer = await fetchCustomer(customerId);
        } catch (error) {
            console.error("Customer points management lookup failed:", error);
            if (!showLoyaltyFeatureError(error)) {
                notify("error", "خطأ", "تعذر تحميل رصيد العميل.");
            }
            return;
        }
        if (!selectedCustomer) {
            notify("error", "خطأ", "العميل غير موجود.");
            return;
        }
        openAdjustModal();
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
            selectedCustomer = await fetchCustomer(keepId);
            if (selectedCustomer) {
                renderCustomerHeader();
                await loadCustomerActivity();
            }
            await window.refreshAdminCustomerProfile?.(keepId);
        } finally {
            adjusting = false;
            submit.disabled = false;
        }
    }

    function init() {
        if (!byId("section-loyalty")) return;
        byId("loyaltyCustomerClose").addEventListener("click", () => closeModal("loyaltyCustomerModal"));
        byId("loyaltyManagePointsBtn").addEventListener("click", () => {
            closeModal("loyaltyCustomerModal");
            openAdjustModal();
        });
        byId("loyaltyAdjustClose").addEventListener("click", () => closeModal("loyaltyAdjustModal"));
        byId("loyaltyAdjustCancel").addEventListener("click", () => closeModal("loyaltyAdjustModal"));
        byId("loyaltyAdjustForm").addEventListener("submit", submitAdjustment);
        byId("loyaltySettingsForm").addEventListener("submit", saveSettings);
        byId("loyaltyRuleAdd").addEventListener("click", addRewardRuleRow);
        byId("loyaltyManualRuleAward").addEventListener("click", awardManualRule);
        byId("loyaltyLevelForm").addEventListener("submit", saveLevel);
        byId("loyaltyLevelCancel").addEventListener("click", resetLevelForm);
        document.querySelectorAll('.sidebar-link[data-section="loyalty"]').forEach((button) => {
            button.addEventListener("click", loadAll);
        });
    }

    window.LoyaltyAdmin = { managePointsForCustomer, openCustomerDetails: openCustomer };
    document.addEventListener("DOMContentLoaded", init);
})();   
