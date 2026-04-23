/**
 * Teacher Portal Logic using Supabase
 */

const TeacherPortal = {
    selectedAssessmentId: null,

    getCurrentTeacher: function() {
        return Auth.getCurrentUser();
    },

    /**
     * Fetch classes where the current user is either the subject teacher or homeroom teacher
     */
    getAssignedClasses: async function() {
        const user = this.getCurrentTeacher();
        if (!user || user.role !== 'teacher') return [];

        try {
            // 1. Get classes where teacher is Homeroom
            const { data: homeroomClasses } = await supabase
                .from('classes')
                .select('*, students(count)')
                .eq('teacher_id', user.id);

            // Note: In a full implementation, we would also fetch from a 'class_subjects' table
            // For now, we'll treat homeroom classes as the primary assignments
            
            return (homeroomClasses || []).map(cls => ({
                id: cls.id,
                classId: cls.id,
                subject: 'Homeroom', // Or fetch from assignment
                className: cls.name,
                gradeLevel: cls.grade,
                room: cls.room,
                studentCount: cls.students ? cls.students[0].count : 0
            }));
        } catch (error) {
            console.error('Error fetching assigned classes:', error.message);
            return [];
        }
    },

    renderDashboardClasses: async function() {
        const container = document.getElementById('assignedClassesContainer');
        if (!container) return;

        container.innerHTML = '<div class="col-span-full text-center py-12 text-slate-400">Loading your classes...</div>';

        const classes = await this.getAssignedClasses();
        
        if (classes.length === 0) {
            container.innerHTML = `
                <div class="col-span-full bg-white p-12 rounded-3xl text-center ambient-shadow border border-slate-100">
                    <div class="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                        <span class="material-symbols-outlined text-4xl text-slate-300">class</span>
                    </div>
                    <h3 class="text-xl font-bold text-slate-800 mb-2">No assigned classes</h3>
                    <p class="text-slate-500 max-w-sm mx-auto">You haven't been assigned to any classes yet. Please contact the administrator.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = classes.map(cls => `
            <div class="bg-white p-6 rounded-3xl ambient-shadow border border-slate-100 hover-card group cursor-pointer" 
                 onclick="window.location.href='classdetails.html?classId=${cls.classId}'">
                <div class="flex justify-between items-start mb-6">
                    <div class="w-14 h-14 signature-gradient rounded-2xl flex items-center justify-center text-white shadow-lg shadow-emerald-100 group-hover:scale-110 transition-transform">
                        <span class="material-symbols-outlined text-2xl">${this.getSubjectIcon(cls.subject)}</span>
                    </div>
                    <span class="px-3 py-1 bg-emerald-50 text-emerald-600 text-[10px] font-bold rounded-full uppercase tracking-wider">Active</span>
                </div>
                
                <h3 class="text-xl font-bold text-slate-800 mb-1">${cls.className}</h3>
                <p class="text-sm text-slate-500 mb-6 flex items-center gap-1">
                    <span class="material-symbols-outlined text-sm">groups</span>
                    ${cls.studentCount || 0} Students
                </p>

                <div class="flex items-center justify-between pt-6 border-t border-slate-50">
                    <div class="flex -space-x-2">
                        <div class="w-8 h-8 rounded-full border-2 border-white bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-400">?</div>
                        <div class="w-8 h-8 rounded-full border-2 border-white bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-400">?</div>
                    </div>
                    <span class="text-emerald-600 font-bold text-sm flex items-center gap-1 group-hover:gap-2 transition-all">
                        View Details
                        <span class="material-symbols-outlined text-sm">arrow_forward</span>
                    </span>
                </div>
            </div>
        `).join('');
    },

    getSubjectIcon: function(subject) {
        const subjectLower = (subject || '').toLowerCase();
        if (subjectLower.includes('math')) return 'functions';
        if (subjectLower.includes('science')) return 'science';
        return 'menu_book';
    },

    loadClassDetails: async function() {
        const urlParams = new URLSearchParams(window.location.search);
        const classId = urlParams.get('classId');
        if (!classId) return;

        try {
            const { data: cls, error } = await supabase
                .from('classes')
                .select('*')
                .eq('id', classId)
                .single();

            if (error) throw error;

            const { data: students, error: studentError } = await supabase
                .from('students')
                .select('*')
                .eq('class_id', classId);

            if (studentError) throw studentError;

            // 2. Get performance stats from DB View for all students in this class
            const { data: stats } = await supabase
                .from('student_performance_summary')
                .select('*')
                .in('student_id', students.map(s => s.id));

            // Update UI
            const titleEl = document.querySelector('header h1');
            if (titleEl) titleEl.textContent = cls.name;

            await this.loadAssessments(classId);
            await this.renderStudentsTable(students || [], classId, stats || []);
            await this.renderClassInsights(classId);
        } catch (error) {
            console.error('Error loading class details:', error.message);
        }
    },

    renderStudentsTable: async function(students, classId, stats = []) {
        const tableBody = document.querySelector('tbody');
        if (!tableBody) return;

        // Fetch existing grades only if an assessment is selected
        let grades = [];
        if (this.selectedAssessmentId) {
            const { data } = await supabase
                .from('grades')
                .select('*')
                .eq('assessment_id', this.selectedAssessmentId);
            grades = data || [];
        }

        if (students.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="4" class="py-12 text-center text-slate-400 italic">No students registered in this class.</td></tr>';
            return;
        }

        tableBody.innerHTML = students.map(student => {
            const gradeRecord = grades.find(g => g.student_id === student.id);
            const studentStats = stats.find(s => s.student_id === student.id);
            const avgGrade = studentStats ? Math.round(studentStats.average_grade) : '---';
            
            const score = gradeRecord ? gradeRecord.score : '';
            const remarks = gradeRecord ? (gradeRecord.remarks || '') : '';
            const isDisabled = !this.selectedAssessmentId;
            const safeName = Security.sanitize(student.name);
            const safeRemarks = Security.sanitize(remarks);

            return `
                <tr class="hover:bg-slate-50/50 transition-colors" data-student-id="${student.id}">
                    <td class="py-4">
                        <div class="flex items-center gap-3">
                            <img src="${student.image || '../assets/default-avatar.png'}" class="w-8 h-8 rounded-full">
                            <div>
                                <span class="font-bold block">${safeName}</span>
                                <span class="text-[10px] text-slate-400">Avg: ${avgGrade}%</span>
                            </div>
                        </div>
                    </td>
                    <td class="py-4">
                        <select class="text-sm border-none bg-transparent focus:ring-0 font-semibold text-emerald-600">
                            <option value="Present">Present</option>
                            <option value="Absent">Absent</option>
                            <option value="Late">Late</option>
                        </select>
                    </td>
                    <td class="py-4">
                        <div class="flex items-center gap-2" title="${isDisabled ? 'Please select an assessment to enter grades' : ''}">
                            <input type="number" 
                                   value="${score}" 
                                   ${isDisabled ? 'disabled' : ''}
                                   onchange="TeacherPortal.saveGrade('${student.id}', '${classId}', this.value)"
                                   class="score-input w-16 px-2 py-1 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 font-bold ${isDisabled ? 'bg-slate-50 opacity-50 cursor-not-allowed' : ''}">
                        </div>
                    </td>
                    <td class="py-4">
                        <input type="text" 
                               value="${safeRemarks}"
                               ${isDisabled ? 'disabled' : ''}
                               onchange="TeacherPortal.saveGrade('${student.id}', '${classId}', null, this.value)"
                               placeholder="${isDisabled ? 'Select assessment first...' : 'Add note...'}" 
                               class="remarks-input w-full bg-transparent border-none text-sm text-slate-500 focus:ring-0 italic ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}">
                    </td>
                </tr>
            `;
        }).join('');
    },

    saveGrade: async function(studentId, classId, score, remarks) {
        const user = this.getCurrentTeacher();
        const row = document.querySelector(`tr[data-student-id="${studentId}"]`);
        
        // جلب القيم الحالية من الحقول إذا لم يتم تمريرها
        const currentScore = score !== null ? parseFloat(score) : parseFloat(row.querySelector('.score-input').value);
        const currentRemarks = remarks !== null ? remarks : row.querySelector('.remarks-input').value;

        if (isNaN(currentScore) && remarks === null) return;
        if (!this.selectedAssessmentId) return;

        try {
            const { error } = await supabase
                .from('grades')
                .upsert({
                    student_id: studentId,
                    teacher_id: user.id,
                    assessment_id: this.selectedAssessmentId,
                    score: isNaN(currentScore) ? 0 : currentScore,
                    remarks: currentRemarks,
                    subject: 'General', // Default
                    term: 'Term 1'      // Default
                }, { onConflict: 'student_id, assessment_id' });

            if (error) throw error;
            console.log('Grade/Remarks saved successfully');

            // إرسال إشعار لولي الأمر
            if (score !== null) {
                const { data: assessment } = await supabase
                    .from('assessments')
                    .select('title, subject')
                    .eq('id', this.selectedAssessmentId)
                    .single();
                
                const { data: student } = await supabase
                    .from('students')
                    .select('name')
                    .eq('id', studentId)
                    .single();

                if (assessment && student) {
                    const title = `علامة جديدة لـ ${student.name}`;
                    const message = `تم رصد علامة ${currentScore} في ${assessment.title} (${assessment.subject})`;
                    Notifications.db.sendToParent(studentId, title, message);
                }
            }

            await this.renderClassInsights(classId);
        } catch (error) {
            console.error('Error saving grade:', error.message);
        }
    },

    /**
     * Assessment Management Logic
     */
    loadAssessments: async function(classId) {
        try {
            const { data, error } = await supabase
                .from('assessments')
                .select('*')
                .eq('class_id', classId)
                .order('created_at', { ascending: false });

            if (error) throw error;

            const select = document.getElementById('assessmentSelect');
            if (!select) return;

            select.innerHTML = '<option value="">Select Assessment...</option>' + 
                data.map(a => {
                    const safeTitle = Security.sanitize(a.title);
                    return `<option value="${a.id}" data-max="${a.max_score}">${safeTitle}</option>`;
                }).join('');

            // تأكيد اختيار التقييم المناسب في القائمة
            if (this.selectedAssessmentId) {
                select.value = this.selectedAssessmentId;
                const selectedData = data.find(a => a.id === this.selectedAssessmentId);
                if (selectedData) this.updateAssessmentUI(selectedData);
            } else if (data.length > 0) {
                this.selectedAssessmentId = data[0].id;
                select.value = this.selectedAssessmentId;
                this.updateAssessmentUI(data[0]);
            }
        } catch (error) {
            console.error('Error loading assessments:', error.message);
        }
    },

    onAssessmentChange: function(id) {
        this.selectedAssessmentId = id;
        const select = document.getElementById('assessmentSelect');
        const option = select.options[select.selectedIndex];
        
        if (id) {
            this.updateAssessmentUI({ max_score: option.dataset.max });
        } else {
            document.getElementById('assessmentInfo').classList.add('hidden');
        }

        const urlParams = new URLSearchParams(window.location.search);
        const classId = urlParams.get('classId');
        this.loadClassDetails(); // Re-render table
    },

    updateAssessmentUI: function(assessment) {
        const info = document.getElementById('assessmentInfo');
        const maxScore = document.getElementById('maxScoreDisplay');
        if (info && maxScore) {
            info.classList.remove('hidden');
            maxScore.textContent = assessment.max_score;
        }
    },

    openNewAssessmentModal: async function() {
        const modal = document.getElementById('assessmentModal');
        const subjectSelect = document.getElementById('assessmentSubject');
        const user = this.getCurrentTeacher();
        const urlParams = new URLSearchParams(window.location.search);
        const classId = urlParams.get('classId');

        modal.classList.remove('hidden');

        try {
            // جلب المواد المكلف بها المعلم في هذا الصف تحديداً
            const { data: assignments, error } = await supabase
                .from('teacher_assignments')
                .select('subject')
                .eq('teacher_id', user.id)
                .eq('class_id', classId);

            if (error) throw error;

            if (!assignments || assignments.length === 0) {
                subjectSelect.innerHTML = '<option value="">No subjects assigned for this class</option>';
                Notifications.warning('تحذير', 'لا يوجد لديك مواد مسندة لهذا الصف. يرجى مراجعة الإدارة.');
            } else {
                subjectSelect.innerHTML = assignments.map(a => `<option value="${a.subject}">${a.subject}</option>`).join('');
            }
        } catch (error) {
            console.error('Error loading assignments:', error.message);
            subjectSelect.innerHTML = '<option value="">Error loading subjects</option>';
        }
    },

    closeNewAssessmentModal: function() {
        document.getElementById('assessmentModal').classList.add('hidden');
        document.getElementById('assessmentForm').reset();
    },

    handleAssessmentSubmit: async function(e) {
        e.preventDefault();
        const user = this.getCurrentTeacher();
        const urlParams = new URLSearchParams(window.location.search);
        const classId = urlParams.get('classId');

        if (!user || (!user.schoolId && !user.school_id)) {
            Notifications.error('Error', 'Session expired or school ID missing. Please login again.');
            return;
        }

        const assessmentData = {
            school_id: user.school_id || user.schoolId,
            class_id: classId,
            teacher_id: user.id,
            title: document.getElementById('assessmentTitle').value,
            subject: document.getElementById('assessmentSubject').value,
            max_score: parseFloat(document.getElementById('assessmentMaxScore').value),
            date: new Date().toISOString().split('T')[0]
        };

        // Debug log to identify RLS issues
        console.log('Attempting to create assessment with data:', assessmentData);

        if (!assessmentData.school_id) {
            console.error('Critical Error: school_id is missing from user session!');
            Notifications.error('Error', 'School ID is missing. Please log out and log in again.');
            return;
        }

        try {
            const { data, error } = await supabase
                .from('assessments')
                .insert([assessmentData])
                .select()
                .single();

            if (error) {
                console.error('Supabase Error Details:', error);
                throw error;
            }

            this.selectedAssessmentId = data.id;
            this.closeNewAssessmentModal();
            await this.loadAssessments(classId);
            await this.loadClassDetails();
        } catch (error) {
            console.error('Error creating assessment:', error.message);
            Notifications.error('Error', error.message);
        }
    },

    submitDailyReport: async function(e) {
        e.preventDefault();
        const user = Auth.getCurrentUser();
        const formData = new FormData(e.target);
        
        const reportData = {
            teacher_id: user.id,
            school_id: user.school_id || user.schoolId,
            tasks_completed: formData.get('tasks_completed'),
            challenges: formData.get('challenges'),
            next_steps: formData.get('next_steps'),
            report_date: new Date().toISOString().split('T')[0]
        };

        try {
            const { error } = await supabase
                .from('daily_reports')
                .upsert(reportData, { onConflict: 'teacher_id, report_date' });

            if (error) throw error;

            Notifications.success('Success', 'Daily achievement report submitted successfully.');
            document.getElementById('dailyReportModal').classList.add('hidden');
            e.target.reset();
        } catch (error) {
            console.error('Error submitting report:', error.message);
            Notifications.error('Error', 'Failed to submit report: ' + error.message);
        }
    },

    renderClassInsights: async function(classId) {
        // Implementation for average score calculation
    },

    init: function() {
        if (document.getElementById('assignedClassesContainer')) {
            this.renderDashboardClasses();
            
            // Daily Report Listeners
            const openBtn = document.getElementById('openDailyReportBtn');
            const reportForm = document.getElementById('dailyReportForm');
            
            if (openBtn) {
                openBtn.addEventListener('click', () => {
                    document.getElementById('dailyReportModal').classList.remove('hidden');
                    document.getElementById('dailyReportModal').classList.add('flex');
                });
            }
            
            if (reportForm) {
                reportForm.addEventListener('submit', (e) => this.submitDailyReport(e));
            }
        }
        if (window.location.pathname.includes('classdetails.html')) {
            this.loadClassDetails();

            // Add form listener
            const form = document.getElementById('assessmentForm');
            if (form) {
                form.addEventListener('submit', (e) => this.handleAssessmentSubmit(e));
            }
        }
    }
};

document.addEventListener('DOMContentLoaded', () => TeacherPortal.init());
