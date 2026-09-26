// Authentication Logic
const Auth = {
    getBasePrefix: function () {
        const path = window.location.pathname.replace(/\\/g, '/');
        const nestedSections = ['/Pages/', '/admin/', '/teacher/', '/secretary/', '/parent/', '/shared/', '/super-admin/'];
        return nestedSections.some(section => path.includes(section)) ? '../' : '';
    },

    resolvePath: function (path) {
        // If the path already includes 'Pages/' and we are already in 'Pages/', we should avoid doubling it.
        const currentPath = window.location.pathname.replace(/\\/g, '/');
        if (currentPath.includes('/Pages/') && path.startsWith('Pages/')) {
            return path.replace('Pages/', '');
        }
        return `${this.getBasePrefix()}${path}`;
    },

    login: async function (username, password) {
        try {
            const loginValue = String(username || '').trim();
            const email = loginValue.includes('@')
                ? loginValue
                : `${loginValue.toLowerCase()}@auth.internal`;
            // 1. Supabase Auth Login
            const { data, error } = await supabase.auth.signInWithPassword({
                email: email,
                password: password,
            });

            if (error) throw error;

            // 2. Fetch User Profile from 'profiles' table
            const { data: profile, error: profileError } = await supabase
                .from('profiles')
                .select('*, restaurants(*)')
                .eq('id', data.user.id)
                .single();

            if (profileError) throw profileError;

            // Store minimal session info in memory only - no localStorage
            // All role checks now go through Supabase Auth directly
            return { success: true, user: profile };
        } catch (error) {
            Notifications.error('Login Failed', error.message);
            return { success: false, message: error.message };
        }
    },

    logout: async function () {
        // Clear all session and cache data
        localStorage.clear();
        sessionStorage.clear();
        await supabase.auth.signOut();
        window.location.href = this.resolvePath('Pages/Login.html');
    },

    signOut: async function () {
        return await this.logout();
    },

    // Get current session from Supabase Auth (async)
    getSession: async function () {
        const { data: { session } } = await supabase.auth.getSession();
        return session;
    },

    // Get current user profile from Supabase (async)
    getCurrentUser: async function () {
        // Check cache first (valid for 5 minutes)
        const cached = sessionStorage.getItem('EduPulse_UserCache');
        if (cached) {
            try {
                const parsed = JSON.parse(cached);
                if (parsed.expires > Date.now() && parsed.user) {
                    const cachedUser = parsed.user;
                    if (!cachedUser.restaurantId || /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(String(cachedUser.restaurantId))) {
                        return cachedUser;
                    }
                    sessionStorage.removeItem('EduPulse_UserCache');
                }
            } catch (e) {
                sessionStorage.removeItem('EduPulse_UserCache');
            }
        }

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return null;

        // Fetch fresh profile from Supabase
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('*, restaurants(*)')
            .eq('id', session.user.id)
            .single();

        if (error || !profile) return null;

        const restaurantId = profile.restaurant_id;
        const validRestaurantId = restaurantId && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(String(restaurantId)) ? restaurantId : null;

        const user = {
            id: session.user.id,
            email: session.user.email,
            username: profile.username || (session.user.email?.endsWith('@auth.internal') ? session.user.email.split('@')[0] : null),
            name: profile.full_name,
            role: profile.role,
            restaurantId: validRestaurantId,
            restaurantName: profile.restaurants ? profile.restaurants.name : null,
            nationalId: profile.national_id,
            phone: profile.phone
        };

        // Cache for 5 minutes
        sessionStorage.setItem('EduPulse_UserCache', JSON.stringify({
            user: user,
            expires: Date.now() + (5 * 60 * 1000)
        }));

        return user;
    },

    getCurrentUserRole: async function () {
        const user = await this.getCurrentUser();
        return user ? user.role : null;
    },

    checkAuth: async function () {
        const user = await this.getCurrentUser();
        if (!user) {
            window.location.href = this.resolvePath('Pages/Login.html');
            return null;
        }

        // Check if the current page is allowed for the user's role
        const allowedRolesAttr = document.body.getAttribute('data-allowed-roles');
        if (allowedRolesAttr) {
            const allowedRoles = allowedRolesAttr.split(',').map(r => r.trim());
            if (!allowedRoles.includes(user.role)) {
                Notifications.warning('Access Denied', 'You do not have permission to view this page.');
                this.redirectByRole(user);
                return null;
            }
        }
        return user;
    },

    redirectByRole: function (user) {
        const routes = {
            'super-admin': 'Pages/SuperAdminDashboard.html',
            'admin': 'Pages/AdminDashboard.html'
        };
        const target = routes[user.role] || routes.admin;

        if (target) {
            window.location.href = this.resolvePath(target);
        }
    },

    init: function () {
        // Listen for Auth State Changes (especially for Invites)
        supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && window.location.hash.includes('type=invite'))) {
                window.location.href = this.resolvePath('Pages/SetupPassword.html');
            }
        });
    }
};

Auth.init();
window.Auth = Auth;
