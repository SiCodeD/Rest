/**
 * Attendance Management Logic using Supabase
 */

const AttendanceManager = {
    selectedClassId: null,
    selectedDate: new Date().toISOString().split('T')[0],

    init: async function() {
        const dateInput = document.getElementById('attendanceDate');
        if (dateInput) {
            dateInput.value = this.selectedDate;
            dateInput.addEventListener('change', (e) => {
                this.selectedDate = e.target.value;
                if (this.selectedClassId) this.loadAttendance();
            });
        }

        await this.loadClasses();
        this.bindEvents();
    },

    loadClasses: async function() {
        const user = Auth.getCurrentUser();
        if (!user || (!user.schoolId && !user.school_id)) return;

        try {
            const { data: classes, error } = await supabase
                .from('classes')
                .select('*')
                .eq('school_id', user.school_id || user.schoolId)
                .order('name');

            if (error) throw error;

            const filter = document.getElementById('classFilter');
            if (filter) {
                filter.innerHTML = `<option value="">${window.I18N ? I18N.t('select_class') : 'Select Class...'}</option>`;
                classes.forEach(cls => {
                    filter.insertAdjacentHTML('beforeend', `<option value="${cls.id}">${cls.name} (${cls.grade})</option>`);
                });
            }
        } catch (error) {
            console.error('Error loading classes:', error.message);
        }
    },

    loadAttendance: async function() {
        if (!this.selectedClassId) return;

        const tableBody = document.getElementById('attendanceTableBody');
        const saveBtn = document.getElementById('saveAttendanceBtn');
        const tableTitle = document.getElementById('tableTitle');

        tableBody.innerHTML = '<tr><td colspan="3" class="px-8 py-12 text-center text-slate-400 italic">Loading attendance...</td></tr>';

        try {
            // 1. Get students in the class
            const { data: students, error: studentError } = await supabase
                .from('students')
                .select('*')
                .eq('class_id', this.selectedClassId)
                .order('name');

            if (studentError) throw studentError;

            // 2. Get existing attendance for this class and date
            const { data: attendance, error: attendanceError } = await supabase
                .from('attendance')
                .select('*')
                .eq('class_id', this.selectedClassId)
                .eq('date', this.selectedDate);

            if (attendanceError) throw attendanceError;

            tableTitle.textContent = `Attendance for ${this.selectedDate}`;
            saveBtn.classList.remove('hidden');
            tableBody.innerHTML = '';

            if (students.length === 0) {
                tableBody.innerHTML = '<tr><td colspan="3" class="px-8 py-12 text-center text-slate-400">No students found in this class.</td></tr>';
                return;
            }

            students.forEach(student => {
                const record = attendance ? attendance.find(a => a.student_id === student.id) : null;
                const status = record ? record.status : 'present';
                const note = record ? record.note : '';

                const row = `
                    <tr class="hover:bg-slate-50/50 transition-colors" data-student-id="${student.id}">
                        <td class="px-8 py-4">
                            <div class="flex items-center gap-3">
                                <img src="${student.image}" class="w-8 h-8 rounded-lg object-cover">
                                <span class="font-bold">${student.name}</span>
                            </div>
                        </td>
                        <td class="px-6 py-4">
                            <div class="flex gap-2">
                                <button onclick="AttendanceManager.setStatus('${student.id}', 'present')" class="status-btn px-3 py-1 rounded-full text-[10px] font-bold border transition-all ${status === 'present' ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-white text-slate-400 border-slate-200'}" data-status="present">PRESENT</button>
                                <button onclick="AttendanceManager.setStatus('${student.id}', 'absent')" class="status-btn px-3 py-1 rounded-full text-[10px] font-bold border transition-all ${status === 'absent' ? 'bg-red-500 text-white border-red-500' : 'bg-white text-slate-400 border-slate-200'}" data-status="absent">ABSENT</button>
                                <button onclick="AttendanceManager.setStatus('${student.id}', 'late')" class="status-btn px-3 py-1 rounded-full text-[10px] font-bold border transition-all ${status === 'late' ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-slate-400 border-slate-200'}" data-status="late">LATE</button>
                            </div>
                        </td>
                        <td class="px-8 py-4">
                            <input type="text" value="${note}" class="note-input w-full bg-transparent border-none text-sm text-slate-500 focus:ring-0 italic" placeholder="Add note...">
                        </td>
                    </tr>
                `;
                tableBody.insertAdjacentHTML('beforeend', row);
            });

            this.updateStats();
        } catch (error) {
            console.error('Error loading attendance:', error.message);
            tableBody.innerHTML = `<tr><td colspan="3" class="px-8 py-12 text-center text-red-500">Error: ${error.message}</td></tr>`;
        }
    },

    setStatus: function(studentId, status) {
        const row = document.querySelector(`tr[data-student-id="${studentId}"]`);
        if (!row) return;

        const btns = row.querySelectorAll('.status-btn');
        btns.forEach(btn => {
            const btnStatus = btn.dataset.status;
            if (btnStatus === status) {
                btn.className = `status-btn px-3 py-1 rounded-full text-[10px] font-bold border transition-all ${status === 'present' ? 'bg-emerald-500 text-white border-emerald-500' : status === 'absent' ? 'bg-red-500 text-white border-red-500' : 'bg-amber-500 text-white border-amber-500'}`;
            } else {
                btn.className = `status-btn px-3 py-1 rounded-full text-[10px] font-bold border transition-all bg-white text-slate-400 border-slate-200`;
            }
        });

        this.updateStats();
    },

    updateStats: function() {
        const rows = document.querySelectorAll('#attendanceTableBody tr[data-student-id]');
        let present = 0, absent = 0, late = 0;

        rows.forEach(row => {
            const activeBtn = row.querySelector('.status-btn.text-white');
            if (activeBtn) {
                const status = activeBtn.dataset.status;
                if (status === 'present') present++;
                else if (status === 'absent') absent++;
                else if (status === 'late') late++;
            }
        });

        document.getElementById('statPresent').textContent = present;
        document.getElementById('statAbsent').textContent = absent;
        document.getElementById('statLate').textContent = late;
    },

    saveAttendance: async function() {
        const user = Auth.getCurrentUser();
        if (!user || !this.selectedClassId) return;

        const saveBtn = document.getElementById('saveAttendanceBtn');
        const originalText = saveBtn.textContent;
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';

        const rows = document.querySelectorAll('#attendanceTableBody tr[data-student-id]');
        const attendanceData = [];

        rows.forEach(row => {
            const studentId = row.dataset.studentId;
            const activeBtn = row.querySelector('.status-btn.text-white');
            const noteInput = row.querySelector('.note-input');
            
            if (activeBtn) {
                attendanceData.push({
                    school_id: user.school_id || user.schoolId,
                    class_id: this.selectedClassId,
                    student_id: studentId,
                    date: this.selectedDate,
                    status: activeBtn.dataset.status,
                    note: noteInput.value
                });
            }
        });

        try {
            // Upsert attendance records
            const { error } = await supabase
                .from('attendance')
                .upsert(attendanceData, { onConflict: 'student_id, date' });

            if (error) throw error;
            Notifications.success('Success', 'Attendance saved successfully!');

            // إرسال إشعارات لأولياء الأمور في حال الغياب أو التأخير
            attendanceData.forEach(async (record) => {
                if (record.status === 'absent' || record.status === 'late') {
                    const { data: student } = await supabase
                        .from('students')
                        .select('name')
                        .eq('id', record.student_id)
                        .single();
                    
                    if (student) {
                        const statusAr = record.status === 'absent' ? 'غائب' : 'متأخر';
                        const title = `تنبيه حضور: ${student.name}`;
                        const message = `نود إعلامكم بأن الطالب ${student.name} سجل حالة (${statusAr}) اليوم بتاريخ ${record.date}.`;
                        Notifications.db.sendToParent(record.student_id, title, message);
                    }
                }
            });
        } catch (error) {
            console.error('Error saving attendance:', error.message);
            Notifications.error('Error', error.message);
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = originalText;
        }
    },

    bindEvents: function() {
        const filter = document.getElementById('classFilter');
        if (filter) {
            filter.addEventListener('change', (e) => {
                this.selectedClassId = e.target.value;
                this.loadAttendance();
            });
        }

        const saveBtn = document.getElementById('saveAttendanceBtn');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => this.saveAttendance());
        }
    }
};

document.addEventListener('DOMContentLoaded', () => AttendanceManager.init());
