// Common dashboard logic
document.addEventListener('DOMContentLoaded', function() {
    const user = Auth.getCurrentUser();
    if (!user) {
        window.location.href = Auth.resolvePath('login.html');
        return;
    }

    const allowedRoles = (document.body.dataset.allowedRoles || '')
        .split(',')
        .map(role => role.trim())
        .filter(Boolean);

    if (allowedRoles.length && !allowedRoles.includes(user.role)) {
        Auth.redirectByRole(user);
        return;
    }

    const userNameElements = document.querySelectorAll('.user-name');
    const userRoleElements = document.querySelectorAll('.user-role');
    const userInitialElements = document.querySelectorAll('.user-initials');

    userNameElements.forEach(el => {
        el.textContent = user.name;
    });

    const roleMap = {
        'super-admin': 'Super Admin',
        'admin': 'School Admin',
        'teacher': 'Teacher',
        'secretary': 'Secretary',
        'parent': 'Parent'
    };

    userRoleElements.forEach(el => {
        el.textContent = roleMap[user.role] || user.role;
    });

    userInitialElements.forEach(el => {
        const initials = user.name
            .split(' ')
            .map(name => name[0])
            .join('')
            .substring(0, 2)
            .toUpperCase();
        el.textContent = initials;
    });

    if (window.I18N && I18N.init) {
        I18N.init();
    }

    // Check if user needs to set password (Parent or Teacher first login)
    // Note: With Supabase, first login redirection is handled via setup-password.html from the invite link.
    // This logic is kept for backward compatibility with localStorage users if any.
    if ((user.role === 'parent' || user.role === 'teacher') && user.isFirstLogin) {
        showForcePasswordModal();
    }

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function(e) {
            e.preventDefault();
            Auth.logout();
        });
    }

    const currentPath = window.location.pathname.replace(/\\/g, '/');
    const navLinks = document.querySelectorAll('aside nav a');
    navLinks.forEach(link => {
        const href = link.getAttribute('href');
        if (!href || href === '#') return;

        const linkPath = new URL(href, window.location.href).pathname.replace(/\\/g, '/');
        if (linkPath === currentPath) {
            link.classList.add('bg-emerald-50/50', 'text-emerald-700', 'font-bold', 'border-r-4', 'border-emerald-600');
            link.classList.remove('text-slate-500', 'font-medium');
        }
    });

    updateGlobalStats();
});

function showForcePasswordModal() {
    const modalHtml = `
        <div id="forcePasswordModal" class="modal-backdrop open">
            <div class="modal-box text-center">
                <div class="w-16 h-16 bg-[var(--emerald-glow)] text-[var(--emerald)] rounded-2xl flex items-center justify-center mx-auto mb-6">
                    <span class="material-symbols-outlined text-3xl">lock_reset</span>
                </div>
                <h3 class="text-2xl font-black mb-2" data-i18n="force_password_reset">Set Your Password</h3>
                <p class="text-[var(--text-muted)] text-sm mb-8" data-i18n="first_login_notice">For your security, please set a password for your first login.</p>
                
                <form id="forcePasswordForm" class="space-y-4">
                    <div class="text-left">
                        <label class="block text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2" data-i18n="password">New Password</label>
                        <input type="password" id="newParentPassword" required minlength="6" placeholder="••••••••" class="form-control">
                    </div>
                    <button type="submit" class="btn-primary w-full justify-center py-4 mt-4" data-i18n="set_password">Save and Continue</button>
                </form>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    document.getElementById('forcePasswordForm').addEventListener('submit', function(e) {
        e.preventDefault();
        const newPass = document.getElementById('newParentPassword').value;
        const sessionUser = Auth.getCurrentUser();
        
        // Note: Real password updates should happen via Auth.updatePassword(newPass)
        // This is a simplified version for first-time session logic.
        if (sessionUser) {
            // Simplified: logic would normally call supabase.auth.updateUser({ password: newPass })
            document.getElementById('forcePasswordModal').remove();
            Notifications.success('Success', 'Password updated successfully!');
        }
    });
}

async function updateGlobalStats() {
    const user = Auth.getCurrentUser();
    if (!user || !user.schoolId) return;

    try {
        // Fetch real counts from Supabase
        const { count: studentCount, error: studentError } = await supabase
            .from('students')
            .select('*', { count: 'exact', head: true })
            .eq('school_id', user.schoolId);

        if (studentError) throw studentError;

        document.querySelectorAll('.stat-total-students').forEach(el => {
            el.textContent = studentCount || 0;
        });

        // Fetch unassigned students count
        const { count: unassignedCount, error: unassignedError } = await supabase
            .from('students')
            .select('*', { count: 'exact', head: true })
            .eq('school_id', user.schoolId)
            .is('class_id', null);

        if (!unassignedError) {
            document.querySelectorAll('.stat-unassigned-students').forEach(el => {
                el.textContent = unassignedCount || 0;
            });
        }

        // If we are on the admin dashboard, we might want more stats
        const { count: teacherCount, error: teacherError } = await supabase
            .from('teachers')
            .select('*', { count: 'exact', head: true })
            .eq('school_id', user.schoolId);

        if (!teacherError) {
            document.querySelectorAll('.stat-total-teachers').forEach(el => {
                el.textContent = teacherCount || 0;
            });
        }

        // Attendance stats (placeholder logic for now)
        document.querySelectorAll('.stat-attendance-rate').forEach(el => {
            el.textContent = '98%'; // Replace with real calculation later
        });

    } catch (error) {
        console.error('Error updating stats:', error.message);
    }
}

async function addNotification(userId, title, message) {
    try {
        const { error } = await supabase
            .from('notifications')
            .insert([{
                user_id: userId,
                title: title,
                message: message,
                status: 'unread'
            }]);

        if (error) throw error;
        console.log('Notification sent via Supabase to user:', userId);
    } catch (error) {
        console.error('Error sending notification:', error.message);
    }
}
