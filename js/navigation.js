(function () {
    const navigationByRole = {
        admin: {
            subtitle: 'School Management',
            links: [
                { href: 'admin/dashboard.html', icon: 'dashboard', label: 'Dashboard', id: 'dashboard' },
                { href: 'admin/teachers.html', icon: 'groups', label: 'Teachers', id: 'teachers' },
                { href: 'admin/secretaries.html', icon: 'badge', label: 'Secretaries', id: 'secretaries' },
                { href: 'admin/students.html', icon: 'school', label: 'Students', id: 'students' },
                // { href: 'admin/parents.html', icon: 'family_restroom', label: 'Parents', id: 'parents' },
                { href: 'admin/manage.html', icon: 'class', label: 'Classes', id: 'classes' },
                { href: 'admin/daily-reports.html', icon: 'assignment_turned_in', label: 'Daily Reports', id: 'daily_reports_admin' },
                { href: 'admin/reports.html', icon: 'analytics', label: 'Reports', id: 'reports' },
                { href: 'shared/messages.html', icon: 'mail', label: 'Messages', id: 'messages' }
            ],
            footer: [
                { href: 'shared/settings.html', icon: 'settings', label: 'Settings', id: 'settings' }
            ]
        },
        teacher: {
            subtitle: 'Teacher Workspace',
            links: [
                { href: 'teacher/dashboard.html', icon: 'dashboard', label: 'Dashboard', id: 'dashboard' },
                { href: 'teacher/classdetails.html', icon: 'menu_book', label: 'Class Details', id: 'class_details' },
                { href: 'shared/messages.html', icon: 'mail', label: 'Messages', id: 'messages' }
            ],
            footer: [
                { href: 'shared/settings.html', icon: 'settings', label: 'Settings', id: 'settings' }
            ]
        },
        secretary: {
            subtitle: 'Secretary Office',
            links: [
                { href: 'secretary/dashboard.html', icon: 'dashboard', label: 'Dashboard', id: 'dashboard' },
                { href: 'secretary/students.html', icon: 'school', label: 'Students', id: 'students' },
                { href: 'secretary/manage.html', icon: 'class', label: 'Class Placement', id: 'manage' },
                { href: 'secretary/attendance.html', icon: 'how_to_reg', label: 'Attendance', id: 'attendance' },
                { href: 'shared/messages.html', icon: 'mail', label: 'Messages', id: 'messages' }
            ],
            footer: [
                { href: 'shared/settings.html', icon: 'settings', label: 'Settings', id: 'settings' }
            ]
        },
        parent: {
            subtitle: 'Parent Portal',
            links: [
                { href: 'parent/dashboard.html', icon: 'dashboard', label: 'Dashboard', id: 'dashboard' },
                { href: 'shared/messages.html', icon: 'mail', label: 'Messages', id: 'messages' }
            ],
            footer: [
                { href: 'shared/settings.html', icon: 'settings', label: 'Settings', id: 'settings' }
            ]
        }
    };

    function isActiveLink(targetPath) {
        const resolved = new URL(Auth.resolvePath(targetPath), window.location.href);
        return resolved.pathname.replace(/\\/g, '/') === window.location.pathname.replace(/\\/g, '/');
    }

    function buildLink(link) {
        const isActive = isActiveLink(link.href);
        const i18nKey = link.i18n || link.label.toLowerCase().replace(/\s+/g, '_');
        const translatedLabel = (window.I18N && I18N.t) ? I18N.t(i18nKey) : link.label;

        // Define data-spa-target if the link belongs to an SPA-capable dashboard
        const spaPage = window.location.pathname.includes('dashboard.html');
        const spaAttr = (link.id && spaPage) ? `data-spa-target="${link.id}"` : '';

        return `
            <a class="sidebar-link ${isActive ? 'active' : ''}" href="${Auth.resolvePath(link.href)}" ${spaAttr}>
                <span class="material-symbols-outlined">${link.icon}</span>
                <span data-i18n="${i18nKey}">${translatedLabel}</span>
            </a>
        `;
    }

    function renderRoleSidebar() {
        if (!document.getElementById('main-styles')) {
            const link = document.createElement('link');
            link.id = 'main-styles';
            link.rel = 'stylesheet';
            link.href = Auth.resolvePath('shared/main.css');
            document.head.appendChild(link);
        }

        const sidebarSlot = document.querySelector('[data-role-sidebar]');
        if (!sidebarSlot) return;

        const role = Auth.getCurrentUserRole();
        const config = navigationByRole[role];
        if (!config) return;

        const subtitleKey = config.subtitle.toLowerCase().replace(/\s+/g, '_');
        const translatedSubtitle = (window.I18N && I18N.t) ? I18N.t(subtitleKey) : config.subtitle;

        const links = config.links.map(link => buildLink(link)).join('');
        const footerLinks = (config.footer || []).map(link => buildLink(link)).join('');

        const isDark = document.documentElement.classList.contains('dark');
        const darkModeToggle = `
            <button onclick="DarkMode.toggle(); location.reload();" class="sidebar-link w-full">
                <span class="material-symbols-outlined dark-mode-icon">${isDark ? 'light_mode' : 'dark_mode'}</span>
                <span class="dark-mode-label" data-i18n="${isDark ? 'light_mode' : 'dark_mode'}">${isDark ? 'Light Mode' : 'Dark Mode'}</span>
            </button>
        `;

        sidebarSlot.outerHTML = `
            <aside class="sidebar">
                <div class="sidebar-logo">
                    <div class="brand">EduPulse</div>
                    <div class="sub" data-i18n="${subtitleKey}">${translatedSubtitle}</div>
                </div>

                <div class="nav-label" data-i18n="menu">Navigation System</div>
                <nav style="flex: 1; overflow-y: auto;">
                    ${links}
                </nav>

                <div style="margin-top: auto; padding-top: 20px; border-top: 1px solid var(--border);">
                    ${darkModeToggle}
                    ${footerLinks}
                    
                    <div class="sidebar-revenue" style="margin-top: 16px;">
                        <div class="label" data-i18n="system_status">Core Status</div>
                        <div class="value" style="font-size: 14px; font-family: 'JetBrains Mono';">v3.2.0-stable</div>
                        <div style="display: flex; align-items: center; gap: 8px; margin-top: 8px;">
                            <div style="width: 8px; height: 8px; background: var(--emerald); border-radius: 50%; box-shadow: 0 0 10px var(--emerald); animation: pulse 2s infinite;"></div>
                            <span style="font-size: 10px; font-weight: 700; color: var(--emerald); text-transform: uppercase;">All Systems Active</span>
                        </div>
                    </div>
                </div>
            </aside>
        `;

        // Handle Global SPA Switching
        document.querySelectorAll('[data-spa-target]').forEach(link => {
            link.addEventListener('click', (e) => {
                if (window.DashboardSPA) {
                    e.preventDefault();
                    window.DashboardSPA.switch(link.dataset.spaTarget);
                }
            });
        });
    }

    document.addEventListener('DOMContentLoaded', renderRoleSidebar);
})();
