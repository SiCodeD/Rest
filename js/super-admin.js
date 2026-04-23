// Super Admin Logic
const SuperAdmin = {
    sectionMeta: {
        schools: {
            title: 'Network Overview',
            subtitle: 'Manage schools, plans, support, and global settings.'
        },
        subscriptions: {
            title: 'Billing Ecosystem',
            subtitle: 'Review active plans and revenue estimates.'
        },
        support: {
            title: 'Systems Intelligence',
            subtitle: 'Track platform support and school requests.'
        },
        settings: {
            title: 'Core Protocol',
            subtitle: 'Update global defaults for the platform.'
        }
    },

    getRevenueForPlan: function (plan) {
        const priceMap = {
            Starter: 49,
            Professional: 129,
            Enterprise: 850
        };
        return priceMap[plan] || 0;
    },

    addSchool: async function (schoolData) {
        try {
            const btn = document.querySelector('#addSchoolForm button[type="submit"]');
            const originalText = btn.textContent;
            btn.disabled = true;
            btn.textContent = 'Initializing...';

            const { data: { session } } = await supabase.auth.getSession();

            const res = await fetch(
                "https://jnwpnohdlavbgwjvupvc.supabase.co/functions/v1/invite-admin",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${session.access_token}`,
                    },
                    body: JSON.stringify({
                        school_name: schoolData.name,
                        admin_email: schoolData.email,
                        location: schoolData.location,
                        plan: schoolData.plan
                    }),
                }
            );

            const data = await res.json();
            if (!res.ok) throw new Error(JSON.stringify(data));

            Notifications.success('Deployment Success', `Node initialized for ${schoolData.email}`);
            btn.disabled = false;
            btn.textContent = originalText;

            document.getElementById('addSchoolModal').classList.remove('open');
            this.renderAll();
        } catch (error) {
            console.error('Error:', error.message);
            Notifications.error('Deployment Failed', error.message);
            const btn = document.querySelector('#addSchoolForm button[type="submit"]');
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Initialize Deployment';
            }
        }
    },

    deleteSchool: async function (id, name) {
        if (!confirm(`Are you sure you want to terminate node access for: ${name}?`)) return;

        try {
            const { error } = await supabase
                .from('schools')
                .delete()
                .eq('id', id);

            if (error) throw error;

            Notifications.success('Terminated', `Access for "${name}" has been revoked.`);
            this.renderAll();
        } catch (error) {
            Notifications.error('Error', error.message);
        }
    },

    renderSchools: async function (statusFilter = 'Active') {
        const tableBody = document.getElementById('schoolsTableBody');
        if (!tableBody) return;

        try {
            let query = supabase
                .from('schools')
                .select('*')
                .order('created_at', { ascending: false });
            
            if (statusFilter) {
                query = query.eq('status', statusFilter);
            }

            const { data: schools, error } = await query;
            if (error) throw error;

            tableBody.innerHTML = '';
            if (schools.length === 0) {
                tableBody.innerHTML = `<tr><td colspan="6" class="empty-state">No ${statusFilter.toLowerCase()} nodes found.</td></tr>`;
                return;
            }

            const avatarColors = [['#10b981','#022c22'], ['#3b82f6','#0f1f3a'], ['#a855f7','#1e0a3c']];

            schools.forEach((school, i) => {
                const [bg, fg] = avatarColors[i % avatarColors.length];
                const initial = school.name[0].toUpperCase();
                
                // Map plans to new design system badges
                const planBadge = school.plan === 'Enterprise' ? 'badge-purple' : school.plan === 'Professional' ? 'badge-blue' : 'badge-gray';
                const statusBadge = school.status === 'Active' ? 'badge-green' : 'badge-yellow';
                const rev = this.getRevenueForPlan(school.plan);

                const row = `
                    <tr>
                        <td>
                            <div class="cell-with-avatar">
                                <div class="avatar" style="background:${bg}; color:${fg}">${initial}</div>
                                <div>
                                    <div class="font-bold text-xs" style="color:var(--text)">${school.name}</div>
                                    <div class="text-[10px] text-[var(--text-muted)]">${school.location || 'Distributed'}</div>
                                </div>
                            </div>
                        </td>
                        <td class="text-xs text-[var(--text-muted)]">${school.director_name || school.admin_email}</td>
                        <td><span class="badge ${planBadge}">${school.plan}</span></td>
                        <td><span class="badge ${statusBadge}">${school.status}</span></td>
                        <td style="text-align:right" class="mono text-emerald">$${rev}</td>
                        <td>
                            <div class="flex justify-center gap-2">
                                <button onclick="SuperAdmin.deleteSchool('${school.id}', '${school.name}')" class="icon-btn hover:text-red-500">
                                    <span class="material-symbols-outlined">delete</span>
                                </button>
                            </div>
                        </td>
                    </tr>
                `;
                tableBody.insertAdjacentHTML('beforeend', row);
            });
        } catch (error) {
            console.error('Error fetching schools:', error.message);
        }
    },

    renderStats: async function() {
        const { data: schools } = await supabase.from('schools').select('status, plan');
        if (!schools) return;

        const total = schools.length;
        const active = schools.filter(s => s.status === 'Active').length;
        const pending = schools.filter(s => s.status === 'Pending').length;
        let totalRev = 0;
        
        let starter = 0;
        let pro = 0;
        let ent = 0;

        schools.forEach(s => {
            totalRev += this.getRevenueForPlan(s.plan);
            if(s.plan === 'Starter') starter++;
            else if(s.plan === 'Professional') pro++;
            else if(s.plan === 'Enterprise') ent++;
        });

        // Set counters
        document.getElementById('statTotalSchools').textContent = total;
        document.getElementById('statActiveSchools').textContent = active;
        document.getElementById('statPendingSchools').textContent = pending;
        document.getElementById('statMRR').textContent = `$${totalRev.toLocaleString()}`;
        document.getElementById('totalMRRDisplay').textContent = `$${totalRev.toLocaleString()}`;

        // Set Breakdown if elements exist
        if(document.getElementById('subStarter')) document.getElementById('subStarter').textContent = starter;
        if(document.getElementById('subPro')) document.getElementById('subPro').textContent = pro;
        if(document.getElementById('subEnt')) document.getElementById('subEnt').textContent = ent;
    },

    renderSubscriptions: async function () {
        const tableBody = document.getElementById('subscriptionsTableBody');
        if (!tableBody) return;

        try {
            const { data: schools, error } = await supabase.from('schools').select('*');
            if (error) throw error;

            let totalRev = 0;
            tableBody.innerHTML = '';
            const avatarColors = [['#10b981','#022c22'], ['#3b82f6','#0f1f3a'], ['#a855f7','#1e0a3c']];

            schools.forEach((school, i) => {
                totalRev += this.getRevenueForPlan(school.plan);
                const [bg, fg] = avatarColors[i % avatarColors.length];
                const planBadge = school.plan === 'Enterprise' ? 'badge-purple' : school.plan === 'Professional' ? 'badge-blue' : 'badge-gray';
                const statusBadge = school.status === 'Active' ? 'badge-green' : 'badge-yellow';

                tableBody.insertAdjacentHTML('beforeend', `
                    <tr>
                        <td>
                            <div class="cell-with-avatar">
                                <div class="avatar" style="background:${bg}; color:${fg}">${school.name[0]}</div>
                                <div class="font-semibold" style="color:var(--text)">${school.name}</div>
                            </div>
                        </td>
                        <td><span class="badge ${planBadge}">${school.plan}</span></td>
                        <td><span class="badge ${statusBadge}">${school.status}</span></td>
                        <td style="text-align:right" class="mono text-emerald">$${this.getRevenueForPlan(school.plan)}</td>
                    </tr>
                `);
            });

            if(document.getElementById('subscriptionRevenueEstimate')) {
                document.getElementById('subscriptionRevenueEstimate').textContent = `$${totalRev.toLocaleString()}`;
            }
        } catch (error) {
            console.error('Error fetching subscriptions:', error.message);
        }
    },

    renderSupportTickets: async function () {
        const tableBody = document.getElementById('supportTicketsTableBody');
        if (!tableBody) return;

        try {
            const { data: tickets, error } = await supabase.from('support_tickets').select('*');
            if (error || !tickets) throw new Error('No tickets');

            tableBody.innerHTML = '';
            tickets.forEach(ticket => {
                const prBadge = ticket.priority === 'High' ? 'badge-red' : ticket.priority === 'Medium' ? 'badge-yellow' : 'badge-blue';
                const stBadge = ticket.status === 'Resolved' ? 'badge-green' : 'badge-yellow';

                tableBody.insertAdjacentHTML('beforeend', `
                    <tr>
                        <td class="font-bold text-xs" style="color:var(--text)">${ticket.school_name || 'Global Node'}</td>
                        <td class="text-xs text-[var(--text-muted)]">${ticket.subject}</td>
                        <td><span class="badge ${prBadge}">${ticket.priority}</span></td>
                        <td><span class="badge ${stBadge}">${ticket.status}</span></td>
                    </tr>
                `);
            });
        } catch (error) {
            tableBody.innerHTML = '<tr><td colspan="4" class="empty-state">No active payloads in queue</td></tr>';
        }
    },

    renderSettings: async function () {
        try {
            const { data: settings } = await supabase.from('platform_settings').select('*').single();
            if (settings) {
                if(document.getElementById('platformDefaultPlan')) document.getElementById('platformDefaultPlan').value = settings.default_plan;
                if(document.getElementById('platformTrialDays')) document.getElementById('platformTrialDays').value = settings.trial_days;
                if(document.getElementById('platformSupportEmail')) document.getElementById('platformSupportEmail').value = settings.support_email;
            }
        } catch (error) {
            console.warn('Platform protocol table not found');
        }
    },

    renderAll: async function () {
        await this.renderSchools();
        await this.renderSubscriptions();
        await this.renderSupportTickets();
        await this.renderSettings();
        await this.renderStats();
    },

    setActiveSection: function (section) {
        document.querySelectorAll('.super-admin-section').forEach(panel => {
            panel.classList.toggle('hidden', panel.dataset.superSection !== section);
        });

        document.querySelectorAll('.super-admin-nav').forEach(button => {
            button.classList.toggle('active', button.dataset.superSectionTarget === section);
        });

        const meta = this.sectionMeta[section];
        if (meta) {
            document.getElementById('superAdminPageTitle').textContent = meta.title;
            document.getElementById('superAdminPageSubtitle').textContent = meta.subtitle;
        }
    },

    init: function () {
        this.renderAll();
        
        // Navigation
        document.querySelectorAll('[data-super-section-target]').forEach(button => {
            button.addEventListener('click', () => this.setActiveSection(button.dataset.superSectionTarget));
        });

        // Tabs
        document.getElementById('btnFilterActive')?.addEventListener('click', (e) => {
            document.querySelectorAll('.tab-group .btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            this.renderSchools('Active');
        });
        document.getElementById('btnFilterPending')?.addEventListener('click', (e) => {
            document.querySelectorAll('.tab-group .btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            this.renderSchools('Pending');
        });

        // Modals
        document.getElementById('addSchoolBtn')?.addEventListener('click', () => {
            document.getElementById('addSchoolModal').classList.add('open');
        });
        document.getElementById('closeAddSchoolModal')?.addEventListener('click', () => {
            document.getElementById('addSchoolModal').classList.remove('open');
        });
        document.getElementById('addSchoolModal')?.addEventListener('click', (e) => {
            if (e.target === e.currentTarget) e.currentTarget.classList.remove('open');
        });

        // Forms
        document.getElementById('addSchoolForm')?.addEventListener('submit', event => {
            event.preventDefault();
            this.addSchool({
                name: document.getElementById('schoolName').value,
                email: document.getElementById('schoolEmail').value,
                plan: document.getElementById('schoolPlan').value,
                location: document.getElementById('schoolLocation').value
            });
        });

        document.getElementById('platformSettingsForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveSettings(e);
        });

        document.getElementById('logoutBtn')?.addEventListener('click', () => Auth.logout());

        this.setActiveSection('schools');
    },

    saveSettings: async function (e) {
        const settingsData = {
            default_plan: document.getElementById('platformDefaultPlan').value,
            trial_days: parseInt(document.getElementById('platformTrialDays').value),
            support_email: document.getElementById('platformSupportEmail').value
        };

        try {
            Notifications.info('Saving...', 'Updating platform protocol');
            const { data: existing } = await supabase.from('platform_settings').select('id').single();

            if (existing) {
                await supabase.from('platform_settings').update(settingsData).eq('id', existing.id);
            } else {
                await supabase.from('platform_settings').insert([settingsData]);
            }

            Notifications.success('Success', 'Platform protocol updated');
        } catch (error) {
            Notifications.error('Save Failed', error.message);
        }
    }
};

document.addEventListener('DOMContentLoaded', () => SuperAdmin.init());
