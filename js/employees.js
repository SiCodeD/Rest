(function () {
    "use strict";

    const state = {
        restaurantId: null,
        restaurantCode: null,
        employees: [],
        editingId: null,
        loaded: false,
    };

    const elements = {};

    function cacheElements() {
        [
            "employeeModal",
            "employeeModalTitle",
            "employeeForm",
            "employeeId",
            "employeeName",
            "employeeUsername",
            "employeePin",
            "employeeRole",
            "employeeActive",
            "employeeFormError",
            "saveEmployeeBtn",
            "employeesLoadingState",
            "employeesEmptyState",
            "employeesErrorState",
            "employeesErrorMessage",
            "employeesTableWrap",
            "employeesTableBody",
            "employeesListHint",
            "employeesTotalCount",
            "employeesActiveCount",
            "employeesInactiveCount",
            "shareWaiterLoginLinkBtn",
            "employeeUsernamePrefix",
            "employeeCredentialsModal",
            "createdEmployeeName",
            "createdEmployeeUsername",
            "createdEmployeePin",
        ].forEach(function (id) {
            elements[id] = document.getElementById(id);
        });
    }

    function escapeHtml(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function formatDate(value) {
        if (!value) return "—";
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return "—";
        return new Intl.DateTimeFormat("ar-SA", {
            day: "2-digit",
            month: "short",
            year: "numeric",
        }).format(date);
    }

    function showState(name) {
        ["employeesLoadingState", "employeesEmptyState", "employeesErrorState", "employeesTableWrap"].forEach(function (key) {
            if (elements[key]) elements[key].hidden = key !== name;
        });
    }

    function updateMetrics() {
        const total = state.employees.length;
        const active = state.employees.filter(function (employee) { return employee.is_active !== false; }).length;
        if (elements.employeesTotalCount) elements.employeesTotalCount.textContent = total;
        if (elements.employeesActiveCount) elements.employeesActiveCount.textContent = active;
        if (elements.employeesInactiveCount) elements.employeesInactiveCount.textContent = total - active;
        if (elements.employeesListHint) {
            elements.employeesListHint.textContent = total ? total + " موظف مسجل في مطعمك" : "أضف أعضاء فريقك وابدأ بتنظيم الوصول.";
        }
    }

    function getWaiterLoginUrl() {
        if (!state.restaurantCode) return null;
        const loginUrl = new URL("WaiterLogin.html", window.location.href);
        loginUrl.search = "";
        return loginUrl.toString();
    }

    async function copyTextToClipboard(text) {
        if (navigator.clipboard?.writeText && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
            return;
        }

        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();

        const copied = document.execCommand("copy");
        textarea.remove();
        if (!copied) throw new Error("Clipboard copy was rejected");
    }

    async function shareWaiterLoginLink() {
        const loginUrl = getWaiterLoginUrl();
        if (!loginUrl) {
            Notifications.error("تعذر إنشاء الرابط", "لم يتم العثور على المطعم الحالي بعد.");
            return;
        }
        try {
            if (navigator.share) {
                await navigator.share({
                    title: "رابط دخول موظفي المطعم",
                    text: "استخدم هذا الرابط لتسجيل دخول موظفي المطعم.",
                    url: loginUrl,
                });
                Notifications.success("تمت المشاركة", "تمت مشاركة رابط صفحة الموظفين.");
                return;
            }

            await copyTextToClipboard(loginUrl);
            Notifications.success("تم نسخ الرابط", "لا يدعم هذا الجهاز المشاركة المباشرة، فتم نسخ الرابط ويمكنك إرساله للموظفين.");
        } catch (error) {
            if (error?.name === "AbortError") return;
            console.error("copyWaiterLoginLink error:", error);
            Notifications.error("تعذر مشاركة الرابط", "حاول مرة أخرى أو انسخ الرابط يدويًا.");
        }
    }

    function renderEmployees() {
        const body = elements.employeesTableBody;
        if (!body) return;
        updateMetrics();
        if (!state.employees.length) {
            showState("employeesEmptyState");
            return;
        }

        body.innerHTML = state.employees.map(function (employee) {
            const isActive = employee.is_active !== false;
            const statusClass = isActive ? "active" : "inactive";
            const statusText = isActive ? "نشط" : "غير نشط";
            return `
                                <tr>
                                    <td><div class="employee-identity"><span class="employee-avatar">${escapeHtml((employee.name || "م").trim().slice(0, 1))}</span><div><strong>${escapeHtml(employee.name || "بدون اسم")}</strong><small>عضو في فريق المطعم</small></div></div></td>
                                    <td><code class="employee-username" dir="ltr">${escapeHtml(employee.username || "—")}</code></td>
                                    <td><span class="pill light"><i data-lucide="concierge-bell" class="lucide-icon"></i>قرصون</span></td>
                                    <td><span class="employee-status ${statusClass}"><span></span>${statusText}</span></td>
                                    <td class="employee-date">${formatDate(employee.created_at)}</td>
                                    <td><div class="employee-actions"><button class="icon-btn" type="button" data-edit-employee="${escapeHtml(employee.id)}" data-tooltip="تعديل الموظف" aria-label="تعديل الموظف"><i data-lucide="pencil" class="lucide-icon"></i></button><button class="icon-btn employee-toggle-btn" type="button" data-toggle-employee="${escapeHtml(employee.id)}" data-tooltip="${isActive ? "تعطيل الموظف" : "تفعيل الموظف"}" aria-label="${isActive ? "تعطيل الموظف" : "تفعيل الموظف"}">${window.lucideIcon(isActive ? "person_off" : "person_check")}</button><button class="icon-btn-delete" type="button" data-delete-employee="${escapeHtml(employee.id)}" data-tooltip="حذف الموظف" aria-label="حذف الموظف"><i data-lucide="trash-2" class="lucide-icon"></i></button></div></td>
                                </tr>`;
        }).join("");
        showState("employeesTableWrap");
    }

    function getErrorMessage(error) {
        const raw = String(error?.message || "");
        if (error?.code === "23505" || /duplicate key|already exists|unique/i.test(raw)) {
            return "اسم المستخدم مستخدم مسبقًا في هذا المطعم. اختر اسمًا آخر.";
        }
        if (/permission|row-level security|not authorized/i.test(raw)) {
            return "ليس لديك صلاحية لتنفيذ هذه العملية.";
        }
        return raw || "تعذر تنفيذ العملية. حاول مرة أخرى.";
    }

    async function getRestaurantId() {
        const user = await Auth.getCurrentUser();
        return user?.restaurantId || null;
    }

    async function loadEmployees() {
        if (!elements.employeesLoadingState) return;
        showState("employeesLoadingState");
        try {
            state.restaurantId = await getRestaurantId();
            if (!state.restaurantId) throw new Error("لم يتم العثور على المطعم المرتبط بالمستخدم الحالي.");
            const restaurantResult = await supabase
                .from("restaurants")
                .select("restaurant_code")
                .eq("id", state.restaurantId)
                .single();
            if (restaurantResult.error || !restaurantResult.data?.restaurant_code) {
                throw restaurantResult.error || new Error("لم يتم العثور على كود المطعم الحالي.");
            }
            state.restaurantCode = restaurantResult.data.restaurant_code;
            const result = await supabase.from("employees").select("id, restaurant_id, name, username, role, is_active, created_at, updated_at").eq("restaurant_id", state.restaurantId).order("created_at", { ascending: false });
            if (result.error) throw result.error;
            state.employees = result.data || [];
            state.loaded = true;
            renderEmployees();
        } catch (error) {
            console.error("loadEmployees error:", error);
            updateMetrics();
            if (elements.employeesErrorMessage) elements.employeesErrorMessage.textContent = getErrorMessage(error);
            showState("employeesErrorState");
        }
    }

    function setFormError(message) {
        if (!elements.employeeFormError) return;
        elements.employeeFormError.textContent = message || "";
        elements.employeeFormError.hidden = !message;
    }

    function getLocalUsername(username) {
        const value = String(username || "").trim();
        if (!state.restaurantCode) return value.toLowerCase();
        const prefix = state.restaurantCode.toLowerCase() + "-";
        return value.toLowerCase().startsWith(prefix) ? value.slice(prefix.length).toLowerCase() : value.toLowerCase();
    }

    function showEmployeeCredentials(employee) {
        elements.createdEmployeeName.textContent = employee.name || "—";
        elements.createdEmployeeUsername.textContent = employee.username || "—";
        elements.createdEmployeePin.textContent = employee.pin || "—";
        elements.employeeCredentialsModal.classList.add("open");
        elements.employeeCredentialsModal.setAttribute("aria-hidden", "false");
    }

    function closeEmployeeCredentials() {
        elements.employeeCredentialsModal.classList.remove("open");
        elements.employeeCredentialsModal.setAttribute("aria-hidden", "true");
    }

    async function copyCredential(id) {
        const value = document.getElementById(id)?.textContent || "";
        if (!value || value === "—") return;
        try {
            await navigator.clipboard.writeText(value);
            Notifications.success("تم النسخ", "تم نسخ البيانات إلى الحافظة.");
        } catch (error) {
            Notifications.error("تعذر النسخ", "انسخ البيانات يدويًا من النافذة.");
        }
    }

    function openEmployeeModal(employee) {
        state.editingId = employee?.id || null;
        elements.employeeForm.reset();
        elements.employeeId.value = employee?.id || "";
        elements.employeeName.value = employee?.name || "";
        elements.employeeUsername.value = getLocalUsername(employee?.username || "");
        elements.employeeUsernamePrefix.textContent = state.restaurantCode ? state.restaurantCode + "-" : "...-";
        elements.employeePin.value = employee?.pin || "";
        elements.employeeRole.value = employee?.role || "waiter";
        elements.employeeActive.checked = employee ? employee.is_active !== false : true;
        elements.employeeModalTitle.textContent = employee ? "تعديل بيانات الموظف" : "إضافة موظف جديد";
        elements.saveEmployeeBtn.innerHTML = '<i data-lucide="save" class="lucide-icon"></i>' + (employee ? "حفظ التعديلات" : "حفظ الموظف");
        setFormError("");
        elements.employeeModal.classList.add("open");
        elements.employeeModal.setAttribute("aria-hidden", "false");
        elements.employeeName.focus();
    }

    function closeEmployeeModal() {
        elements.employeeModal.classList.remove("open");
        elements.employeeModal.setAttribute("aria-hidden", "true");
        state.editingId = null;
    }

    async function saveEmployee(event) {
        event.preventDefault();
        setFormError("");
        const name = elements.employeeName.value.trim();
        const localUsername = getLocalUsername(elements.employeeUsername.value);
        const username = state.restaurantCode ? state.restaurantCode + "-" + localUsername : "";
        const pin = elements.employeePin.value.trim();
        if (!name || !localUsername || !pin || !state.restaurantCode) {
            setFormError("يرجى تعبئة جميع الحقول المطلوبة.");
            return;
        }
        if (!/^\d{4,8}$/.test(pin)) {
            setFormError("يجب أن يتكون PIN من 4 إلى 8 أرقام.");
            return;
        }

        const isEditing = Boolean(state.editingId);
        const payload = { name, username, pin, role: elements.employeeRole.value || "waiter", is_active: elements.employeeActive.checked, updated_at: new Date().toISOString() };
        if (!isEditing) payload.restaurant_id = state.restaurantId || await getRestaurantId();
        if (!payload.restaurant_id && !state.restaurantId) {
            setFormError("لم يتم العثور على المطعم المرتبط بالمستخدم الحالي.");
            return;
        }
        if (!state.restaurantId) state.restaurantId = payload.restaurant_id;

        const duplicateQuery = await supabase
            .from("employees")
            .select("id")
            .eq("restaurant_id", state.restaurantId)
            .eq("username", username)
            .neq("id", state.editingId || "00000000-0000-0000-0000-000000000000")
            .maybeSingle();
        if (duplicateQuery.error) {
            setFormError(getErrorMessage(duplicateQuery.error));
            return;
        }
        if (duplicateQuery.data) {
            setFormError("اسم المستخدم مستخدم مسبقًا في هذا المطعم. اختر اسمًا آخر.");
            return;
        }

        elements.saveEmployeeBtn.disabled = true;
        elements.saveEmployeeBtn.dataset.originalText = elements.saveEmployeeBtn.textContent;
        elements.saveEmployeeBtn.textContent = "جاري الحفظ...";
        try {
            const query = isEditing
                ? supabase.from("employees").update(payload).eq("id", state.editingId).eq("restaurant_id", state.restaurantId)
                : supabase.from("employees").insert(payload).select().single();
            const result = await query;
            if (result.error) throw result.error;
            closeEmployeeModal();
            await loadEmployees();
            if (!isEditing) showEmployeeCredentials({ name, username, pin });
            Notifications.success(isEditing ? "تم تحديث الموظف" : "تمت إضافة الموظف", isEditing ? "تم حفظ بيانات الموظف بنجاح." : "تمت إضافة الموظف إلى فريق المطعم.");
        } catch (error) {
            console.error("saveEmployee error:", error);
            setFormError(getErrorMessage(error));
        } finally {
            elements.saveEmployeeBtn.disabled = false;
            elements.saveEmployeeBtn.innerHTML = '<i data-lucide="save" class="lucide-icon"></i>' + (isEditing ? "حفظ التعديلات" : "حفظ الموظف");
        }
    }

    async function toggleEmployee(id) {
        const employee = state.employees.find(function (item) { return String(item.id) === String(id); });
        if (!employee) return;
        try {
            const nextActive = employee.is_active === false;
            const result = await supabase.from("employees").update({ is_active: nextActive, updated_at: new Date().toISOString() }).eq("id", employee.id).eq("restaurant_id", state.restaurantId);
            if (result.error) throw result.error;
            employee.is_active = nextActive;
            employee.updated_at = new Date().toISOString();
            renderEmployees();
            Notifications.success(nextActive ? "تم تفعيل الموظف" : "تم تعطيل الموظف", nextActive ? "أصبح الموظف متاحًا للاستخدام." : "تم إيقاف دخول الموظف مؤقتًا.");
        } catch (error) {
            console.error("toggleEmployee error:", error);
            Notifications.error("تعذر تحديث الحالة", getErrorMessage(error));
        }
    }

    async function deleteEmployee(id) {
        const employee = state.employees.find(function (item) { return String(item.id) === String(id); });
        if (!employee) return;
        const remove = async function () {
            const result = await supabase.from("employees").delete().eq("id", employee.id).eq("restaurant_id", state.restaurantId);
            if (result.error) throw result.error;
            state.employees = state.employees.filter(function (item) { return String(item.id) !== String(id); });
            renderEmployees();
            Notifications.success("تم حذف الموظف", "تم حذف " + employee.name + " من قائمة الموظفين.");
        };
        if (window.ModalManager?.confirmDelete) {
            window.ModalManager.confirmDelete(remove, "حذف الموظف", "هل أنت متأكد من حذف " + employee.name + "؟ لا يمكن التراجع عن هذه الخطوة.");
        } else if (window.confirm("هل أنت متأكد من حذف الموظف؟")) {
            try { await remove(); } catch (error) { Notifications.error("فشل الحذف", getErrorMessage(error)); }
        }
    }

    function handleTableClick(event) {
        const editButton = event.target.closest("[data-edit-employee]");
        const toggleButton = event.target.closest("[data-toggle-employee]");
        const deleteButton = event.target.closest("[data-delete-employee]");
        if (editButton) {
            const employee = state.employees.find(function (item) { return String(item.id) === String(editButton.dataset.editEmployee); });
            if (employee) openEmployeeModal(employee);
        } else if (toggleButton) {
            toggleEmployee(toggleButton.dataset.toggleEmployee);
        } else if (deleteButton) {
            deleteEmployee(deleteButton.dataset.deleteEmployee);
        }
    }

    function init() {
        cacheElements();
        if (!elements.employeeForm) return;
        document.getElementById("openEmployeeModalBtn")?.addEventListener("click", function () { openEmployeeModal(); });
        document.querySelectorAll("[data-open-employee-modal]").forEach(function (button) { button.addEventListener("click", function () { openEmployeeModal(); }); });
        document.getElementById("closeEmployeeModalBtn")?.addEventListener("click", closeEmployeeModal);
        document.getElementById("cancelEmployeeBtn")?.addEventListener("click", closeEmployeeModal);
        document.getElementById("closeEmployeeCredentialsBtn")?.addEventListener("click", closeEmployeeCredentials);
        document.getElementById("employeeCredentialsModal")?.addEventListener("click", function (event) { if (event.target === elements.employeeCredentialsModal) closeEmployeeCredentials(); });
        document.querySelectorAll("[data-copy-credential]").forEach(function (button) { button.addEventListener("click", function () { copyCredential(button.dataset.copyCredential); }); });
        document.getElementById("copyEmployeeCredentialsBtn")?.addEventListener("click", async function () {
            const text = "اسم الموظف: " + elements.createdEmployeeName.textContent + "\nاسم المستخدم: " + elements.createdEmployeeUsername.textContent + "\nPIN: " + elements.createdEmployeePin.textContent;
            try { await navigator.clipboard.writeText(text); Notifications.success("تم النسخ", "تم نسخ بيانات الدخول كاملة."); } catch (error) { Notifications.error("تعذر النسخ", "انسخ البيانات من النافذة يدويًا."); }
        });
        document.getElementById("refreshEmployeesBtn")?.addEventListener("click", loadEmployees);
        elements.shareWaiterLoginLinkBtn?.addEventListener("click", shareWaiterLoginLink);
        document.getElementById("retryEmployeesBtn")?.addEventListener("click", loadEmployees);
        elements.employeeForm.addEventListener("submit", saveEmployee);
        elements.employeesTableBody?.addEventListener("click", handleTableClick);
        elements.employeeModal.addEventListener("click", function (event) { if (event.target === elements.employeeModal) closeEmployeeModal(); });
        document.addEventListener("keydown", function (event) { if (event.key === "Escape" && elements.employeeModal.classList.contains("open")) closeEmployeeModal(); });
        document.querySelectorAll('[data-section="employees"]').forEach(function (button) { button.addEventListener("click", loadEmployees); });
        loadEmployees();
    }

    window.Employees = { load: loadEmployees, open: openEmployeeModal };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
