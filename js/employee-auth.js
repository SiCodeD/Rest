(function () {
    "use strict";

    const SESSION_KEY = "EduPulse_EmployeeSession";
    const WAITER_ROLE = "waiter";

    function getSession() {
        try {
            // Waiters commonly use this as an installed PWA. localStorage keeps
            // their authenticated device session across closing and reopening it.
            let raw = localStorage.getItem(SESSION_KEY);
            if (!raw) {
                raw = sessionStorage.getItem(SESSION_KEY);
                if (raw) {
                    localStorage.setItem(SESSION_KEY, raw);
                    sessionStorage.removeItem(SESSION_KEY);
                    console.info("Waiter session migrated to persistent storage.");
                }
            }
            if (!raw) return null;
            const session = JSON.parse(raw);
            if (!session || session.role !== WAITER_ROLE || !session.employeeId || !session.restaurantId) {
                clearSession();
                return null;
            }
            console.info("Waiter session restored.", {
                employeeId: session.employeeId,
                restaurantId: session.restaurantId,
            });
            return session;
        } catch (error) {
            clearSession();
            return null;
        }
    }

    function setSession(employee) {
        const session = {
            employeeId: employee.employeeId,
            name: employee.name,
            username: employee.username,
            role: employee.role,
            restaurantId: employee.restaurantId,
            sessionToken: employee.sessionToken || null,
            createdAt: new Date().toISOString(),
        };
        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
        sessionStorage.removeItem(SESSION_KEY);
        console.info("Waiter session saved for this device.", {
            employeeId: session.employeeId,
            restaurantId: session.restaurantId,
        });
        return session;
    }

    function clearSession() {
        localStorage.removeItem(SESSION_KEY);
        sessionStorage.removeItem(SESSION_KEY);
        console.info("Waiter session cleared from this device.");
    }

    function getLoginPath() {
        const path = window.location.pathname.replace(/\\/g, "/");
        return path.includes("/Pages/") ? "WaiterLogin.html" : "Pages/WaiterLogin.html";
    }

    function getDashboardPath() {
        const path = window.location.pathname.replace(/\\/g, "/");
        return path.includes("/Pages/") ? "WaiterDashboard.html" : "Pages/WaiterDashboard.html";
    }

    function normalizeError(error) {
        const message = String(error?.message || "");
        if (/function .*authenticate_employee.* does not exist|PGRST202/i.test(message)) {
            return "لم يتم تفعيل خدمة دخول الموظفين في قاعدة البيانات بعد.";
        }
        return "تعذر الاتصال بالخدمة. حاول مرة أخرى.";
    }

    async function login(username, pin) {
        const cleanUsername = String(username || "").trim().toLowerCase();
        const cleanPin = String(pin || "").trim();
        if (!cleanUsername || !cleanPin) {
            return { success: false, code: "invalid", message: "أدخل اسم المستخدم ورمز PIN." };
        }

        try {
            const { data, error } = await supabase.rpc("authenticate_employee", {
                p_username: cleanUsername,
                p_pin: cleanPin,
            });
            if (error) throw error;

            const result = Array.isArray(data) ? data[0] : data;
            if (!result || result.status === "invalid") {
                return { success: false, code: "invalid", message: "اسم المستخدم أو رمز PIN غير صحيح." };
            }
            if (result.status === "disabled") {
                return { success: false, code: "disabled", message: "تم تعطيل حسابك، يرجى التواصل مع الإدارة." };
            }
            if (result.status !== "authenticated" || result.role !== WAITER_ROLE) {
                return { success: false, code: "invalid", message: "اسم المستخدم أو رمز PIN غير صحيح." };
            }
            const session = setSession(result);
            return { success: true, session };
        } catch (error) {
            console.error("Employee login error:", error);
            return { success: false, code: "error", message: normalizeError(error) };
        }
    }

    async function logout() {
        const session = getSession();
        try {
            if (session?.sessionToken && window.WaiterPush?.unregisterCurrentDevice) {
                await window.WaiterPush.unregisterCurrentDevice(session);
            }
        } catch (error) {
            console.warn("Waiter Push cleanup during logout failed:", error);
        }
        try {
            if (session?.sessionToken && window.supabase) {
                const { error } = await supabase.rpc("revoke_waiter_device_session", {
                    p_restaurant_id: session.restaurantId,
                    p_employee_id: session.employeeId,
                    p_session_token: session.sessionToken,
                });
                if (error) throw error;
                console.info("Waiter device session revoked on the server.");
            }
        } catch (error) {
            // Logout must always finish locally even if the device is offline.
            console.warn("Waiter device session cleanup during logout failed:", error);
        }
        clearSession();
        window.location.replace(getLoginPath());
    }

    async function requireSession() {
        const session = getSession();
        if (!session) {
            window.location.replace(getLoginPath());
            return null;
        }
        return session;
    }

    window.EmployeeAuth = {
        login,
        logout,
        getSession,
        requireSession,
        clearSession,
        getDashboardPath,
    };
})();
