/**
 * Admin Daily Reports Management Logic
 */

const AdminReports = {
    currentDate: new Date().toISOString().split('T')[0],

    init: async function() {
        // Set default date filter to today
        const dateFilter = document.getElementById('reportDateFilter');
        if (dateFilter) {
            dateFilter.value = this.currentDate;
            dateFilter.addEventListener('change', (e) => {
                this.currentDate = e.target.value;
                this.loadReports();
            });
        }

        const refreshBtn = document.getElementById('refreshReportsBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.loadReports());
        }

        const feedbackForm = document.getElementById('feedbackForm');
        if (feedbackForm) {
            feedbackForm.addEventListener('submit', (e) => this.submitFeedback(e));
        }

        await this.loadReports();
    },

    loadReports: async function() {
        const user = Auth.getCurrentUser();
        const tableBody = document.getElementById('reportsTableBody');
        const noReports = document.getElementById('noReportsMessage');

        if (!tableBody) return;

        tableBody.innerHTML = '<tr><td colspan="5" class="py-12 text-center text-slate-400">Loading reports...</td></tr>';
        noReports.classList.add('hidden');

        try {
            const { data, error } = await supabase
                .from('daily_reports')
                .select(`
                    *,
                    teacher:profiles!teacher_id (full_name)
                `)
                .eq('school_id', user.school_id || user.schoolId)
                .eq('report_date', this.currentDate);

            if (error) throw error;

            if (!data || data.length === 0) {
                tableBody.innerHTML = '';
                noReports.classList.remove('hidden');
                return;
            }

            tableBody.innerHTML = data.map(report => `
                <tr class="hover:bg-slate-50/50 transition-colors">
                    <td class="px-6 py-4">
                        <div class="flex items-center gap-3">
                            <div class="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center font-bold text-emerald-600 text-xs">
                                ${report.teacher?.full_name?.substring(0, 2).toUpperCase() || 'TR'}
                            </div>
                            <span class="font-bold text-slate-700">${report.teacher?.full_name || 'Unknown Teacher'}</span>
                        </div>
                    </td>
                    <td class="px-6 py-4 text-sm text-slate-600 max-w-xs truncate" title="${report.tasks_completed}">
                        ${report.tasks_completed}
                    </td>
                    <td class="px-6 py-4 text-sm text-slate-500 italic">
                        ${report.challenges || '<span class="text-slate-300">No challenges</span>'}
                    </td>
                    <td class="px-6 py-4 text-sm text-slate-600">
                        ${report.next_steps || '-'}
                    </td>
                    <td class="px-6 py-4">
                        <div class="flex items-center justify-between gap-4">
                            <p class="text-xs text-emerald-600 font-medium italic truncate max-w-[150px]">
                                ${report.admin_feedback || 'No feedback yet'}
                            </p>
                            <button onclick="AdminReports.openFeedbackModal('${report.id}', '${report.admin_feedback || ''}')" 
                                    class="p-2 text-slate-400 hover:text-emerald-600 transition-colors">
                                <span class="material-symbols-outlined text-lg">edit_note</span>
                            </button>
                        </div>
                    </td>
                </tr>
            `).join('');

        } catch (error) {
            console.error('Error loading reports:', error.message);
            Notifications.error('Error', 'Failed to load reports: ' + error.message);
        }
    },

    openFeedbackModal: function(reportId, existingFeedback) {
        document.getElementById('feedbackReportId').value = reportId;
        document.getElementById('adminFeedbackText').value = existingFeedback;
        const modal = document.getElementById('feedbackModal');
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    },

    submitFeedback: async function(e) {
        e.preventDefault();
        const reportId = document.getElementById('feedbackReportId').value;
        const feedback = document.getElementById('adminFeedbackText').value;

        try {
            const { error } = await supabase
                .from('daily_reports')
                .update({ admin_feedback: feedback })
                .eq('id', reportId);

            if (error) throw error;

            Notifications.success('Success', 'Feedback saved successfully.');
            document.getElementById('feedbackModal').classList.add('hidden');
            await this.loadReports();
        } catch (error) {
            console.error('Error saving feedback:', error.message);
            Notifications.error('Error', 'Failed to save feedback: ' + error.message);
        }
    }
};

document.addEventListener('DOMContentLoaded', () => AdminReports.init());