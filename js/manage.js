const ClassManager = {
    getCurrentUser: function() {
        return Auth.getCurrentUser();
    },

    getSchoolData: async function() {
        const user = this.getCurrentUser();
        if (!user || (!user.schoolId && !user.school_id)) return { classes: [], students: [], teachers: [] };

        try {
            const schoolId = user.school_id || user.schoolId;
            const { data: classes } = await supabase.from('classes').select('*').eq('school_id', schoolId);
            const { data: students } = await supabase.from('students').select('*').eq('school_id', schoolId);
            const { data: teachers } = await supabase.from('teachers').select('*').eq('school_id', schoolId);

            return {
                schoolId: schoolId,
                classes: classes || [],
                students: students || [],
                teachers: teachers || []
            };
        } catch (error) {
            console.error('Error fetching school data:', error.message);
            return { classes: [], students: [], teachers: [] };
        }
    },

    addClass: async function(payload) {
        const user = this.getCurrentUser();
        try {
            const newClass = {
                school_id: user.school_id || user.schoolId,
                name: payload.name,
                grade: payload.grade,
                teacher_id: payload.teacherId || null,
                capacity: Number(payload.capacity) || 30,
                room: payload.room || 'TBD'
            };

            const { data, error } = await supabase.from('classes').insert([newClass]).select().single();
            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error adding class:', error.message);
            alert('Error adding class: ' + error.message);
            return null;
        }
    },

    assignStudentToClass: async function(studentId, classId) {
        try {
            const { error } = await supabase
                .from('students')
                .update({ class_id: classId || null })
                .eq('id', studentId);

            if (error) throw error;
        } catch (error) {
            console.error('Error assigning student:', error.message);
        }
    },

    getAssignedCount: function(classId, students) {
        return students.filter(student => student.class_id === classId).length;
    },

    renderClassOptions: async function() {
        const { classes, teachers } = await this.getSchoolData();
        
        const assignmentSelects = document.querySelectorAll('[data-class-assignment]');
        assignmentSelects.forEach(select => {
            select.innerHTML = `<option value="">${window.I18N ? I18N.t('not_assigned') : 'Assign to class...'}</option>`;
            classes.forEach(cls => {
                select.insertAdjacentHTML('beforeend', `<option value="${cls.id}">${cls.name}</option>`);
            });
        });

        const teacherSelect = document.getElementById('classTeacher');
        if (teacherSelect) {
            teacherSelect.innerHTML = `<option value="">${window.I18N ? I18N.t('not_assigned') : 'No teacher assigned'}</option>`;
            teachers.forEach(teacher => {
                teacherSelect.insertAdjacentHTML('beforeend', `<option value="${teacher.id}">${teacher.name} (${teacher.subject || 'No subject'})</option>`);
            });
        }
    },

    renderUnassignedStudents: async function() {
        const container = document.getElementById('unassignedStudentsList');
        if (!container) return;

        const { students, classes } = await this.getSchoolData();
        const unassigned = students.filter(s => !s.class_id);
        
        container.innerHTML = '';

        if (!unassigned.length) {
            container.innerHTML = '<p class="text-sm text-slate-400 text-center py-10">All students are assigned to classes.</p>';
            return;
        }

        unassigned.forEach(student => {
            const row = `
                <div class="flex items-center justify-between p-4 rounded-xl bg-[var(--surface)] border border-[var(--border)] gap-4 transition-all hover:border-[var(--emerald-border)]">
                    <div class="flex items-center gap-3">
                        <img class="w-10 h-10 rounded-xl object-cover" src="${student.image}" alt="${student.name}">
                        <div>
                            <p class="font-bold text-[var(--text)]">${student.name}</p>
                            <p class="text-xs text-[var(--text-muted)]">${student.national_id} • ${student.grade}</p>
                        </div>
                    </div>
                    <select data-class-assignment data-student-id="${student.id}" class="form-control py-2 px-3 text-xs font-semibold min-w-52">
                        <option value="">${window.I18N ? I18N.t('not_assigned') : 'Assign to class...'}</option>
                        ${classes.map(cls => `<option value="${cls.id}">${cls.name}</option>`).join('')}
                    </select>
                </div>
            `;
            container.insertAdjacentHTML('beforeend', row);
        });
    },

    renderCapacity: async function() {
        const container = document.getElementById('classCapacityList');
        if (!container) return;

        const { classes, students, teachers } = await this.getSchoolData();
        container.innerHTML = '';

        if (!classes.length) {
            container.innerHTML = '<p class="text-sm text-slate-400">No classes have been created yet.</p>';
            return;
        }

        classes.forEach(cls => {
            const assigned = this.getAssignedCount(cls.id, students);
            const percentage = Math.min(100, Math.round((assigned / cls.capacity) * 100));
            const teacher = teachers.find(item => item.id === cls.teacher_id);
            const teacherName = teacher ? teacher.name : (window.I18N ? I18N.t('not_assigned') : 'No teacher yet');

            const item = `
                <div class="cursor-pointer hover:bg-[var(--emerald-glow)] p-4 rounded-xl transition-all border border-transparent hover:border-[var(--emerald-border)]" onclick="ClassManager.viewClassStudents('${cls.id}')">
                    <div class="flex justify-between items-end mb-3 gap-3">
                        <div>
                            <span class="font-bold text-[var(--text)]">${cls.name}</span>
                            <p class="text-[11px] text-[var(--text-muted)]">${cls.room} • ${teacherName}</p>
                        </div>
                        <span class="text-xs font-bold text-[var(--emerald)]">${assigned} / ${cls.capacity}</span>
                    </div>
                    <div class="w-full bg-[var(--bg)] h-2 rounded-full overflow-hidden">
                        <div class="${assigned >= cls.capacity ? 'bg-red-500' : 'bg-[var(--emerald)]'} h-full rounded-full" style="width: ${percentage}%"></div>
                    </div>
                </div>
            `;
            container.insertAdjacentHTML('beforeend', item);
        });
    },

    renderClassesTable: async function() {
        const tableBody = document.getElementById('classesTableBody');
        if (!tableBody) return;

        const { classes, students, teachers } = await this.getSchoolData();
        tableBody.innerHTML = '';

        if (!classes.length) {
            tableBody.innerHTML = '<tr><td colspan="5" class="px-6 py-8 text-center text-slate-400">No classes created yet.</td></tr>';
            return;
        }

        classes.forEach(cls => {
            const teacher = teachers.find(item => item.id === cls.teacher_id);
            const assigned = this.getAssignedCount(cls.id, students);
            const row = `
                <tr class="border-t border-slate-100 group cursor-pointer hover:bg-slate-50 transition-colors" onclick="if(!event.target.closest('button')) ClassManager.viewClassStudents('${cls.id}')">
                    <td class="px-6 py-4 font-bold">${cls.name}</td>
                    <td class="px-6 py-4 text-slate-600">${cls.grade}</td>
                    <td class="px-6 py-4 text-slate-600">${teacher ? teacher.name : (window.I18N ? I18N.t('not_assigned') : 'Unassigned')}</td>
                    <td class="px-6 py-4 text-slate-600">${assigned} / ${cls.capacity}</td>
                    <td class="px-6 py-4 text-slate-600">${cls.room}</td>
                    <td class="px-6 py-4 text-end">
                        <button onclick="ClassManager.deleteClass('${cls.id}')" class="icon-btn hover:text-red-500">
                            <span class="material-symbols-outlined text-[18px]">delete</span>
                        </button>
                    </td>
                </tr>
            `;
            tableBody.insertAdjacentHTML('beforeend', row);
        });
    },

    deleteClass: async function(id) {
        if (!confirm('Are you sure you want to delete this class?')) return;
        try {
            const { error } = await supabase.from('classes').delete().eq('id', id);
            if (error) throw error;
            await this.refresh();
        } catch (error) {
            alert('Error deleting class: ' + error.message);
        }
    },

    refresh: async function() {
        await this.renderUnassignedStudents();
        await this.renderCapacity();
        await this.renderClassesTable();
        await this.renderClassOptions();
    },

    bindEvents: function() {
        document.addEventListener('change', async event => {
            const select = event.target.closest('[data-class-assignment]');
            if (!select || !select.value) return;

            await this.assignStudentToClass(select.dataset.studentId, select.value);
            await this.refresh();
        });

        const addClassForm = document.getElementById('addClassForm');
        if (addClassForm) {
            addClassForm.addEventListener('submit', async event => {
                event.preventDefault();
                const success = await this.addClass({
                    name: document.getElementById('className').value,
                    grade: document.getElementById('classGrade').value,
                    teacherId: document.getElementById('classTeacher').value,
                    capacity: document.getElementById('classCapacity').value,
                    room: document.getElementById('classRoom').value
                });
                if (success) {
                    document.getElementById('addClassModal').classList.remove('open');
                    addClassForm.reset();
                    await this.refresh();
                }
            });
        }

        const openModalButton = document.getElementById('openAddClassModal');
        if (openModalButton) {
            openModalButton.addEventListener('click', () => {
                document.getElementById('addClassModal').classList.add('open');
            });
        }
    },

    viewClassStudents: async function(classId) {
        try {
            const { classes, students } = await this.getSchoolData();
            const targetClass = classes.find(c => c.id === classId);
            if (!targetClass) return;

            const classStudents = students.filter(s => s.class_id === classId);
            const modal = document.getElementById('classStudentsModal');
            const title = document.getElementById('classStudentsTitle');
            const subtitle = document.getElementById('classStudentsSubtitle');
            const tableBody = document.getElementById('classStudentsTableBody');
            const noStudentsMsg = document.getElementById('noStudentsMsg');

            if (!modal || !tableBody) return;

            title.textContent = `${window.I18N ? I18N.t('students') : 'Students'} - ${targetClass.name}`;
            subtitle.textContent = `${targetClass.grade} • ${targetClass.room}`;
            tableBody.innerHTML = '';

            if (classStudents.length === 0) {
                tableBody.parentElement.classList.add('hidden');
                noStudentsMsg.classList.remove('hidden');
            } else {
                tableBody.parentElement.classList.remove('hidden');
                noStudentsMsg.classList.add('hidden');
                classStudents.forEach(student => {
                    const row = `
                        <tr class="hover:bg-emerald-50/20 transition-colors">
                            <td class="px-6 py-4">
                                <div class="flex items-center gap-3">
                                    <img class="w-8 h-8 rounded-lg object-cover" src="${student.image}"/>
                                    <span class="font-bold text-slate-700">${student.name}</span>
                                </div>
                            </td>
                            <td class="px-6 py-4 font-mono text-[11px] text-slate-400">${student.national_id}</td>
                            <td class="px-6 py-4">
                                <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-secondary/10 text-secondary uppercase tracking-wider">${window.I18N ? I18N.t(student.status.toLowerCase()) : student.status}</span>
                            </td>
                            <td class="px-6 py-4 text-right">
                                <div class="flex items-center justify-end gap-1">
                                    <button onclick="ClassManager.editStudent('${student.id}')" class="material-symbols-outlined text-[18px] text-slate-400 hover:text-emerald-600 transition-colors" title="Edit">edit</button>
                                    <button onclick="ClassManager.openMoveModal('${student.id}')" class="material-symbols-outlined text-[18px] text-slate-400 hover:text-amber-600 transition-colors" title="Move">move_up</button>
                                    <button onclick="ClassManager.deleteStudent('${student.id}')" class="material-symbols-outlined text-[18px] text-slate-400 hover:text-red-600 transition-colors" title="Delete">delete</button>
                                </div>
                            </td>
                        </tr>
                    `;
                    tableBody.insertAdjacentHTML('beforeend', row);
                });
            }

            modal.dataset.currentClassId = classId;
            modal.classList.add('open');
        } catch (error) {
            console.error('Error viewing student details:', error.message);
        }
    },

    editStudent: async function(id) {
        try {
            const { data: student, error } = await supabase.from('students').select('*').eq('id', id).single();
            if (error) throw error;

            document.getElementById('editStudentId').value = student.id;
            document.getElementById('editStudentName').value = student.name;
            document.getElementById('editStudentNationalId').value = student.national_id;
            document.getElementById('editStudentBirthDate').value = student.birth_date;
            document.getElementById('editStudentGender').value = student.gender;
            document.getElementById('editStudentHasHealthIssues').checked = student.health_issues;
            document.getElementById('editStudentHealthDetails').value = student.health_details || '';
            document.getElementById('editStudentIsOrphan').checked = student.is_orphan;

            document.getElementById('editHealthDetailsContainer').classList.toggle('hidden', !student.health_issues);
            document.getElementById('editStudentModal').classList.add('open');
        } catch (error) {
            console.error('Error fetching student details:', error.message);
        }
    },

    deleteStudent: async function(id) {
        const confirmMsg = window.I18N ? I18N.t('delete_confirm') : 'Are you sure you want to delete this student?';
        if (!confirm(confirmMsg)) return;

        try {
            const { error } = await supabase.from('students').delete().eq('id', id);
            if (error) throw error;

            const currentClassId = document.getElementById('classStudentsModal').dataset.currentClassId;
            await this.viewClassStudents(currentClassId);
            await this.refresh();
        } catch (error) {
            alert('Error deleting student: ' + error.message);
        }
    },

    openMoveModal: function(id) {
        document.getElementById('moveStudentId').value = id;
        document.getElementById('moveStudentModal').classList.add('open');
    },

    moveStudent: async function(studentId, targetClassId) {
        try {
            const { error } = await supabase
                .from('students')
                .update({ class_id: targetClassId || null })
                .eq('id', studentId);

            if (error) throw error;
            
            const currentClassId = document.getElementById('classStudentsModal').dataset.currentClassId;
            if (currentClassId) await this.viewClassStudents(currentClassId);
            await this.refresh();
            document.getElementById('moveStudentModal').classList.remove('open');
        } catch (error) {
            alert('Error moving student: ' + error.message);
        }
    },

    init: async function() {
        await this.refresh();
        this.bindEvents();
    }
};

document.addEventListener('DOMContentLoaded', () => {
    const pageMarker = document.getElementById('managePage');
    if (pageMarker) {
        ClassManager.init();
    }
});
