// Parent Dashboard Specific Logic
const ParentPortal = {
    children: [],
    performanceChart: null,
    attendanceChart: null,
    
    init: async function() {
        const user = Auth.getCurrentUser();
        if (!user || user.role !== 'parent') return;

        await this.loadInitialData();
        await this.renderNotifications();
        
        // تفعيل الإشعارات في الوقت الحقيقي (Real-time)
        Notifications.db.subscribe(user.id, (newNotification) => {
            // 1. عرض تنبيه منبثق (Toast)
            Notifications.success(newNotification.title, newNotification.message);
            
            // 2. تحديث قائمة الإشعارات في الواجهة
            this.renderNotifications();
        });
    },

    loadInitialData: async function() {
        const user = Auth.getCurrentUser();
        try {
            // 1. Load Children
            const { data: children, error: childError } = await supabase
                .from('students')
                .select('*')
                .eq('parent_id', user.id);

            if (childError) throw childError;
            this.children = children || [];

            if (this.children.length > 0) {
                this.selectedChildId = this.children[0].id;
                
                // 2. Load Stats from Views (Performance & Attendance)
                const [perfRes, attrRes] = await Promise.all([
                    supabase.from('student_performance_summary').select('*').eq('student_id', this.selectedChildId).single(),
                    supabase.from('student_attendance_summary').select('*').eq('student_id', this.selectedChildId).single()
                ]);

                // Update UI with real stats from DB Views
                this.updateStatsUI(perfRes.data, attrRes.data);
            }

            this.renderChildren();
            this.populateFilters();
            await this.renderRecentGrades();
            
            // البحث التلقائي عن العلامات عند تحميل الصفحة لأول مرة
            if (this.children.length > 0) {
                this.onFilterChange();
            }
        } catch (error) {
            console.error('Error loading parent data:', error.message);
        }
    },

    updateStatsUI: function(perfData, attrData) {
        const avgGradeElem = document.getElementById('averageGrade');
        const attendanceRateElem = document.getElementById('attendanceRate');
        
        if (avgGradeElem && perfData) {
            avgGradeElem.textContent = `${Math.round(perfData.average_grade)}%`;
        }
        
        if (attendanceRateElem && attrData) {
            attendanceRateElem.textContent = `${attrData.attendance_percentage}%`;
        }
    },

    renderChildren: function() {
        const container = document.getElementById('childrenContainer');
        if (!container) return;
        container.innerHTML = '';

        if (this.children.length === 0) {
            container.innerHTML = '<div class="col-span-full p-8 text-center text-slate-400 italic">No registered children found.</div>';
            return;
        }

        this.children.forEach(child => {
            const card = `
                <div class="dashboard-card p-6 border border-transparent hover:border-[var(--emerald-border)] transition-all group">
                    <div class="flex items-center gap-4 mb-6">
                        <img src="${child.image || '../assets/default-avatar.png'}" class="w-16 h-16 rounded-2xl object-cover ring-2 ring-[var(--emerald-glow)]" alt="${child.name}">
                        <div>
                            <h4 class="font-bold text-lg text-[var(--text)]">${child.name}</h4>
                            <p class="text-xs text-[var(--text-muted)] font-medium">${child.grade || 'N/A'}</p>
                        </div>
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        <button onclick="ParentPortal.viewChildGrades('${child.id}')" class="btn-secondary py-2 text-[10px] font-bold" data-i18n="view_grades">View Grades</button>
                        <button class="bg-[var(--bg)] text-[var(--text-muted)] rounded-xl py-2 text-[10px] font-bold hover:bg-[var(--emerald-glow)] hover:text-[var(--emerald)] transition-all" data-i18n="attendance_log">Attendance Log</button>
                    </div>
                </div>
            `;
            container.insertAdjacentHTML('beforeend', card);
        });
    },

    populateFilters: function() {
        const childSelect = document.getElementById('childSelect');
        const subjectSelect = document.getElementById('subjectSelect');
        if (!childSelect || !subjectSelect) return;

        childSelect.innerHTML = this.children.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
        
        // Default subjects - in a real app, these would come from the class curriculum
        const subjects = ['Mathematics', 'Science', 'English', 'Arabic', 'History', 'Physics'];
        subjectSelect.innerHTML = '<option value="">All Subjects</option>' + 
            subjects.map(s => `<option value="${s}">${s}</option>`).join('');
    },

    onFilterChange: async function() {
        const studentId = document.getElementById('childSelect').value;
        const subject = document.getElementById('subjectSelect').value;
        const tableBody = document.getElementById('detailedGradesBody');
        const attendanceBody = document.getElementById('attendanceLogBody');
        
        if (!studentId) return;
        tableBody.innerHTML = '<tr><td colspan="4" class="py-8 text-center text-slate-400 italic">Loading grades...</td></tr>';
        attendanceBody.innerHTML = '<tr><td colspan="3" class="py-8 text-center text-slate-400 italic">Loading attendance...</td></tr>';

        try {
            // 1. Fetch Grades
            let query = supabase
                .from('grades')
                .select('*, assessments!inner(*)')
                .eq('student_id', studentId);

            // إذا تم اختيار مادة محددة، نقوم بالفلترة باستخدام النقطة (.) للربط بين الجداول
            if (subject && subject !== "") {
                query = query.eq('assessments.subject', subject);
            }

            const { data: grades, error } = await query;
            
            if (error) {
                console.error('Database Error:', error);
                tableBody.innerHTML = `<tr><td colspan="4" class="py-8 text-center text-red-500 italic">حدث خطأ أثناء جلب البيانات: ${error.message}</td></tr>`;
            } else {
                const filteredGrades = grades.filter(g => g.assessments);
                if (filteredGrades.length === 0) {
                    tableBody.innerHTML = '<tr><td colspan="4" class="py-8 text-center text-slate-400 italic">No grades found for this selection</td></tr>';
                } else {
                    tableBody.innerHTML = filteredGrades.map(g => {
                        const maxScore = g.assessments.max_score || 100;
                        const isPassed = g.score >= (maxScore / 2); // النجاح من نصف الدرجة العظمى

                        return `
                            <tr class="text-sm">
                                <td class="py-4">
                                    <p class="font-bold text-slate-700">${g.assessments.title}</p>
                                    <p class="text-[10px] text-slate-400">${g.assessments.subject || 'General'}</p>
                                </td>
                                <td class="py-4 text-slate-500">${new Date(g.assessments.date).toLocaleDateString()}</td>
                                <td class="py-4 text-center">
                                    <span class="font-bold ${isPassed ? 'text-emerald-600' : 'text-red-500'}">${g.score}</span>
                                    <span class="text-slate-400">/${maxScore}</span>
                                    ${g.remarks ? `<p class="text-[10px] text-slate-400 italic mt-1">${g.remarks}</p>` : ''}
                                </td>
                                <td class="py-4 text-right">
                                    <span class="px-2 py-1 rounded-full text-[10px] font-bold ${isPassed ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}">
                                        ${isPassed ? 'Passed' : 'Failed'}
                                    </span>
                                </td>
                            </tr>
                        `;
                    }).join('');
                }
            }

            // 2. Fetch Attendance
            const { data: attendance, error: attError } = await supabase
                .from('attendance')
                .select('*')
                .eq('student_id', studentId)
                .order('date', { ascending: false });

            if (attError) throw attError;

            // Update Charts
            this.updatePerformanceChart(grades || []);
            this.updateAttendanceChart(attendance || []);

            if (attendance.length === 0) {
                attendanceBody.innerHTML = '<tr><td colspan="3" class="py-8 text-center text-slate-400 italic">No attendance records found</td></tr>';
            } else {
                attendanceBody.innerHTML = attendance.map(a => {
                    const statusColors = {
                        present: 'bg-emerald-50 text-emerald-600',
                        absent: 'bg-red-50 text-red-600',
                        late: 'bg-amber-50 text-amber-600'
                    };
                    return `
                        <tr class="text-sm">
                            <td class="py-4 text-slate-700 font-medium">${new Date(a.date).toLocaleDateString()}</td>
                            <td class="py-4 text-center">
                                <span class="px-3 py-1 rounded-full text-[10px] font-bold uppercase ${statusColors[a.status.toLowerCase()] || 'bg-slate-50'}">
                                    ${a.status}
                                </span>
                            </td>
                            <td class="py-4 text-right text-slate-400 italic text-xs">${a.note || '---'}</td>
                        </tr>
                    `;
                }).join('');
            }

        } catch (error) {
            console.error('Error fetching data:', error.message);
        }
    },

    viewChildGrades: function(studentId) {
        const childSelect = document.getElementById('childSelect');
        if (childSelect) {
            childSelect.value = studentId;
            this.onFilterChange();
            // Scroll to explorer
            document.getElementById('childSelect').scrollIntoView({ behavior: 'smooth' });
        }
    },

    renderNotifications: async function() {
        const user = Auth.getCurrentUser();
        const container = document.getElementById('notificationsContainer');
        if (!container) return;

        try {
            const { data: notifications, error } = await supabase
                .from('notifications')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })
                .limit(5);

            if (error) throw error;

            if (!notifications || notifications.length === 0) {
                container.innerHTML = `<p class="text-sm text-slate-400 text-center py-4" data-i18n="no_notifications">No new notifications</p>`;
                return;
            }

            container.innerHTML = notifications.map(n => {
                const safeTitle = Security.sanitize(n.title);
                const safeMessage = Security.sanitize(n.message);
                return `
                    <div class="p-4 bg-slate-50 rounded-xl border-l-4 ${n.status === 'unread' ? 'border-emerald-500' : 'border-slate-200'}">
                        <div class="flex justify-between items-start mb-1">
                            <h4 class="text-sm font-bold text-slate-800">${safeTitle}</h4>
                            <span class="text-[10px] text-slate-400">${new Date(n.created_at).toLocaleDateString()}</span>
                        </div>
                        <p class="text-xs text-slate-600">${safeMessage}</p>
                    </div>
                `;
            }).join('');
        } catch (error) {
            console.error('Error rendering notifications:', error.message);
        }
    },

    renderRecentGrades: async function() {
        const container = document.getElementById('recentGrades');
        if (!container || this.children.length === 0) return;

        try {
            const { data: grades, error } = await supabase
                .from('grades')
                .select('*, assessments(*)')
                .in('student_id', this.children.map(c => c.id))
                .order('created_at', { ascending: false })
                .limit(4);

            if (error) throw error;

            if (!grades || grades.length === 0) {
                container.innerHTML = `<p class="text-sm text-slate-400 text-center py-4" data-i18n="no_recent_grades">No recent grades yet</p>`;
                return;
            }

            container.innerHTML = grades.map(g => {
                const student = this.children.find(c => c.id === g.student_id);
                return `
                    <div class="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                        <div class="flex items-center gap-3">
                            <div class="w-8 h-8 rounded-lg bg-white flex items-center justify-center font-bold text-emerald-600 text-xs">${student.name[0]}</div>
                            <div>
                                <p class="text-sm font-bold text-slate-800">${g.assessments.title}</p>
                                <p class="text-[10px] text-slate-500">${student.name} • ${g.assessments.subject || 'General'}</p>
                            </div>
                        </div>
                        <div class="text-left">
                            <span class="text-lg font-black text-emerald-600">${g.score}%</span>
                        </div>
                    </div>
                `;
            }).join('');
        } catch (error) {
            console.error('Error rendering recent grades:', error.message);
        }
    },

    /**
     * Analytics & Charts
     */
    updatePerformanceChart: function(grades) {
        const ctx = document.getElementById('performanceChart');
        if (!ctx) return;

        // Destroy old chart if exists
        if (this.performanceChart) this.performanceChart.destroy();

        // Prepare data: filter by assessment dates and sort
        const chartData = grades
            .filter(g => g.assessments)
            .map(g => ({
                label: g.assessments.title,
                score: (g.score / (g.assessments.max_score || 100)) * 100,
                date: new Date(g.assessments.date)
            }))
            .sort((a, b) => a.date - b.date);

        this.performanceChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: chartData.map(d => d.label),
                datasets: [{
                    label: 'Score %',
                    data: chartData.map(d => d.score),
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    fill: true,
                    tension: 0.4,
                    borderWidth: 3,
                    pointBackgroundColor: '#fff',
                    pointBorderColor: '#10b981',
                    pointBorderWidth: 2,
                    pointRadius: 4
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false } },
                scales: {
                    y: { min: 0, max: 100, ticks: { callback: value => value + '%' } },
                    x: { grid: { display: false } }
                }
            }
        });
    },

    updateAttendanceChart: function(attendance) {
        const ctx = document.getElementById('attendanceChart');
        if (!ctx) return;

        if (this.attendanceChart) this.attendanceChart.destroy();

        const stats = {
            Present: attendance.filter(a => a.status.toLowerCase() === 'present').length,
            Absent: attendance.filter(a => a.status.toLowerCase() === 'absent').length,
            Late: attendance.filter(a => a.status.toLowerCase() === 'late').length
        };

        this.attendanceChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Present', 'Absent', 'Late'],
                datasets: [{
                    data: [stats.Present, stats.Absent, stats.Late],
                    backgroundColor: ['#10b981', '#ef4444', '#f59e0b'],
                    borderWidth: 0,
                    hoverOffset: 4
                }]
            },
            options: {
                responsive: true,
                cutout: '70%',
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { usePointStyle: true, padding: 20, font: { size: 10, weight: 'bold' } }
                    }
                }
            }
        });
    },

    /**
     * Export PDF Report Logic
     */
    exportStudentReport: async function(studentId) {
        if (!studentId) {
            Notifications.warning('Warning', 'Please select a child first');
            return;
        }

        const child = this.children.find(c => c.id === studentId);
        if (!child) return;

        Notifications.info('Generating Report', 'Preparing your document, please wait...');

        try {
            // 1. Fetch all data for the report
            const [gradesRes, attendanceRes] = await Promise.all([
                supabase.from('grades').select('*, assessments(*)').eq('student_id', studentId),
                supabase.from('attendance').select('*').eq('student_id', studentId).order('date', { ascending: false })
            ]);

            if (gradesRes.error) throw gradesRes.error;
            if (attendanceRes.error) throw attendanceRes.error;

            const grades = gradesRes.data || [];
            const attendance = attendanceRes.data || [];

            // 2. Initialize PDF
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();
            const pageWidth = doc.internal.pageSize.width;

            // 3. Header: School Info
            doc.setFillColor(16, 185, 129); // emerald 500
            doc.rect(0, 0, pageWidth, 40, 'F');
            
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(24);
            doc.setFont('helvetica', 'bold');
            doc.text('EduPulse School Report', 20, 25);
            
            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            doc.text(new Date().toLocaleDateString(), pageWidth - 45, 25);

            // 4. Student Info Section
            doc.setTextColor(15, 23, 42); // Slate 900
            doc.setFontSize(16);
            doc.text('Student Profile', 20, 55);
            
            doc.setDrawColor(226, 232, 240);
            doc.line(20, 58, pageWidth - 20, 58);

            doc.setFontSize(11);
            doc.text(`Name: ${child.name}`, 20, 70);
            doc.text(`National ID: ${child.national_id || 'N/A'}`, 20, 78);
            doc.text(`Class: ${child.grade || 'General'}`, pageWidth / 2, 70);
            doc.text(`Academic Year: 2026-2027`, pageWidth / 2, 78);

            // 5. Grades Table
            doc.setFontSize(14);
            doc.text('Academic Performance', 20, 95);
            
            const gradeRows = grades.map(g => [
                g.assessments?.title || 'Unknown Assessment',
                g.assessments?.subject || 'General',
                new Date(g.assessments?.date).toLocaleDateString(),
                `${g.score} / ${g.assessments?.max_score || 100}`,
                g.remarks || '---'
            ]);

            doc.autoTable({
                startY: 100,
                head: [['Assessment', 'Subject', 'Date', 'Score', 'Notes']],
                body: gradeRows,
                theme: 'striped',
                headStyles: { fillColor: [16, 185, 129] },
                styles: { font: 'helvetica', fontSize: 9 }
            });

            // 6. Attendance Summary
            const nextY = doc.lastAutoTable.finalY + 15;
            doc.setFontSize(14);
            doc.text('Attendance Summary', 20, nextY);

            const attStats = {
                Present: attendance.filter(a => a.status.toLowerCase() === 'present').length,
                Absent: attendance.filter(a => a.status.toLowerCase() === 'absent').length,
                Late: attendance.filter(a => a.status.toLowerCase() === 'late').length
            };

            doc.autoTable({
                startY: nextY + 5,
                head: [['Status', 'Count']],
                body: [
                    ['Days Present', attStats.Present],
                    ['Days Absent', attStats.Absent],
                    ['Days Late', attStats.Late]
                ],
                theme: 'grid',
                headStyles: { fillColor: [15, 23, 42] },
                styles: { fontSize: 10 }
            });

            // 7. Footer
            const finalY = doc.lastAutoTable.finalY + 30;
            doc.setFontSize(9);
            doc.setTextColor(148, 163, 184);
            doc.text('This is an automatically generated electronic report.', pageWidth / 2, finalY, { align: 'center' });
            doc.text('EduPulse Management System © 2026', pageWidth / 2, finalY + 5, { align: 'center' });

            // 8. Save
            doc.save(`${child.name.replace(/\s+/g, '_')}_Report.pdf`);
            Notifications.success('Success', 'Report downloaded successfully!');

        } catch (error) {
            console.error('PDF Export Error:', error);
            Notifications.error('Export Failed', 'Could not generate PDF. Please try again.');
        }
    }
};

document.addEventListener('DOMContentLoaded', () => ParentPortal.init());
