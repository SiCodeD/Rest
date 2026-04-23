// Authentication Logic
const Auth = {
    getBasePrefix: function() {
        const path = window.location.pathname.replace(/\\/g, '/');
        const nestedSections = ['/admin/', '/teacher/', '/secretary/', '/parent/', '/shared/', '/super-admin/'];
        return nestedSections.some(section => path.includes(section)) ? '../' : '';
    },

    resolvePath: function(path) {
        return `${this.getBasePrefix()}${path}`;
    },

    login: async function(email, password) {
        try {
            // 1. Supabase Auth Login
            const { data, error } = await supabase.auth.signInWithPassword({
                email: email,
                password: password,
            });

            if (error) throw error;

            // 2. Fetch User Profile from 'profiles' table
            const { data: profile, error: profileError } = await supabase
                .from('profiles')
                .select('*, schools(*)')
                .eq('id', data.user.id)
                .single();

            if (profileError) throw profileError;

            const sessionUser = {
                id: data.user.id,
                email: data.user.email,
                name: profile.full_name,
                role: profile.role,
                schoolId: profile.school_id,
                schoolName: profile.schools ? profile.schools.name : null,
                nationalId: profile.national_id,
                phone: profile.phone
            };

            localStorage.setItem('EduPulse_Session', JSON.stringify(sessionUser));
            return { success: true, user: sessionUser };
        } catch (error) {
            Notifications.error('Login Failed', error.message);
            return { success: false, message: error.message };
        }
    },
    
    logout: async function() {
        await supabase.auth.signOut();
        localStorage.removeItem('EduPulse_Session');
        window.location.href = this.resolvePath('login.html');
    },
    
    getCurrentUser: function() {
        return JSON.parse(localStorage.getItem('EduPulse_Session'));
    },

    getCurrentUserRole: function() {
        const user = this.getCurrentUser();
        return user ? user.role : null;
    },
    
    checkAuth: function() {
        const user = this.getCurrentUser();
        if (!user) {
            window.location.href = this.resolvePath('login.html');
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
    
    redirectByRole: function(user) {
        const routes = {
            'super-admin': 'super-admin/dashboard.html',
            'admin': 'admin/dashboard.html',
            'teacher': 'teacher/dashboard.html',
            'secretary': 'secretary/dashboard.html',
            'parent': 'parent/dashboard.html'
        };
        const target = routes[user.role];

        if (target) {
            window.location.href = this.resolvePath(target);
        }
    },

    init: function() {
        // Listen for Auth State Changes (especially for Invites)
        supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && window.location.hash.includes('type=invite'))) {
                window.location.href = this.resolvePath('setup-password.html');
            }
        });
    }
};

Auth.init();
window.Auth = Auth;
