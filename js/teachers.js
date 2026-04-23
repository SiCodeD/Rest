/**
 * Teacher Management Logic using Supabase
 */

const Teachers = {
    /**
     * Get all teachers for the current school from Supabase
     */
    getAll: async function() {
        const user = Auth.getCurrentUser();
        if (!user || (!user.schoolId && !user.school_id)) return [];

        try {
            const { data, error } = await supabase
                .from('teachers')
                .select('*')
                .eq('school_id', user.school_id || user.schoolId)
                .order('name', { ascending: true });

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error fetching teachers:', error.message);
            return [];
        }
    },

    /**
     * Add a new teacher to Supabase
     */
    add: async function(teacherData) {
        const user = Auth.getCurrentUser();
        if (!user || (!user.schoolId && !user.school_id)) return null;

        try {
            const { data, error } = await supabase
                .from('teachers')
                .insert([{
                    school_id: user.school_id || user.schoolId,
                    name: teacherData.name,
                    national_id: teacherData.nationalId,
                    email: teacherData.email,
                    subject: teacherData.subject,
                    status: 'Active'
                }])
                .select()
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error adding teacher:', error.message);
            Notifications.error('Error', error.message);
            return null;
        }
    },

    /**
     * Update an existing teacher's information in Supabase
     */
    update: async function(id, teacherData) {
        try {
            const { data, error } = await supabase
                .from('teachers')
                .update({
                    name: teacherData.name,
                    national_id: teacherData.nationalId,
                    email: teacherData.email,
                    subject: teacherData.subject
                })
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error updating teacher:', error.message);
            Notifications.error('Error', error.message);
            return null;
        }
    },

    /**
     * Open the edit modal with teacher data from Supabase
     */
    openEditModal: async function(id) {
        try {
            const { data: teacher, error } = await supabase
                .from('teachers')
                .select('*')
                .eq('id', id)
                .single();

            if (error) throw error;

            document.getElementById('editTeacherId').value = teacher.id;
            document.getElementById('editTeacherName').value = teacher.name;
            document.getElementById('editTeacherNationalId').value = teacher.national_id;
            document.getElementById('editTeacherEmail').value = teacher.email;
            document.getElementById('editTeacherSubject').value = teacher.subject;

            document.getElementById('editTeacherModal').classList.add('open');
        } catch (error) {
            console.error('Error fetching teacher details:', error.message);
        }
    },

    /**
     * Delete a teacher from Supabase
     */
    delete: async function(id) {
        const confirmMsg = window.I18N ? I18N.t('delete_confirm') : 'Are you sure you want to delete this teacher?';
        if (!confirm(confirmMsg)) return;

        try {
            const { error } = await supabase
                .from('teachers')
                .delete()
                .eq('id', id);

            if (error) throw error;
            await this.renderTable();
            Notifications.success('Success', 'Teacher deleted successfully');
        } catch (error) {
            console.error('Error deleting teacher:', error.message);
            Notifications.error('Error', error.message);
        }
    },

    /**
     * Assignment Management
     */
    openAssignmentModal: async function(id, name) {
        // Find teacher record to get national_id
        try {
            const { data: teacher } = await supabase.from('teachers').select('national_id').eq('id', id).single();
            
            if (teacher && teacher.national_id) {
                // Find corresponding profile ID (Auth UID) using national_id
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('id')
                    .eq('national_id', teacher.national_id)
                    .single();
                
                if (profile) {
                    document.getElementById('assignTeacherId').value = profile.id;
                    console.log('Using Profile ID for assignment:', profile.id);
                } else {
                    console.warn('Teacher has no portal profile (matching national_id). Using table ID as fallback.');
                    document.getElementById('assignTeacherId').value = id;
                }
            } else {
                document.getElementById('assignTeacherId').value = id;
            }
        } catch (error) {
            console.error('Error during profile lookup:', error.message);
            document.getElementById('assignTeacherId').value = id;
        }

        document.getElementById('assignTeacherName').value = name;
        document.getElementById('assignmentModal').classList.add('open');

        // Load classes for the dropdown
        try {
            const user = Auth.getCurrentUser();
            const { data: classes, error } = await supabase
                .from('classes')
                .select('id, name')
                .eq('school_id', user.school_id || user.schoolId)
                .order('name', { ascending: true });

            if (error) throw error;

            const select = document.getElementById('assignClassId');
            select.innerHTML = '<option value="">Select Class...</option>' + 
                classes.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
        } catch (error) {
            console.error('Error loading classes:', error.message);
        }
    },

    handleAssignmentSubmit: async function(e) {
        e.preventDefault();
        const user = Auth.getCurrentUser();
        
        if (!user || (!user.schoolId && !user.school_id)) {
            Notifications.error('Error', 'Session expired or school ID missing. Please login again.');
            return;
        }

        const teacherId = document.getElementById('assignTeacherId').value;
        const classId = document.getElementById('assignClassId').value;
        const subject = document.getElementById('assignSubject').value;
        const schoolId = user.school_id || user.schoolId;

        try {
            console.log('Saving assignment:', { teacherId, classId, subject, schoolId });
            
            // Using upsert to handle existing assignments gracefully
            const { error } = await supabase
                .from('teacher_assignments')
                .upsert([{
                    teacher_id: teacherId,
                    class_id: classId,
                    subject: subject,
                    school_id: schoolId
                }], { 
                    onConflict: 'teacher_id, class_id, subject' 
                });

            if (error) {
                if (error.code === '23505') { // Handle unique constraint manually if upsert fails to catch it
                    // This might happen if the constraint name in the database is different
                    // or if RLS is interfering with upsert logic.
                    // We'll try to delete and re-insert as a fallback.
                    await supabase
                        .from('teacher_assignments')
                        .delete()
                        .eq('teacher_id', teacherId)
                        .eq('class_id', classId)
                        .eq('subject', subject);
                    
                    const { error: reInsertError } = await supabase
                        .from('teacher_assignments')
                        .insert([{
                            teacher_id: teacherId,
                            class_id: classId,
                            subject: subject,
                            school_id: schoolId
                        }]);
                    if (reInsertError) throw reInsertError;
                } else {
                    throw error;
                }
            }

            Notifications.success('Success', 'Teacher assigned to subject successfully!');
            document.getElementById('assignmentModal').classList.remove('open');
            document.getElementById('assignmentForm').reset();
            await this.renderTable();
        } catch (error) {
            console.error('Error saving assignment:', error.message);
            Notifications.error('Assignment Error', error.message);
        }
    },

    /**
     * Render teachers table with data from Supabase
     */
    renderTable: async function() {
        const tableBody = document.getElementById('teachersTableBody');
        if (!tableBody) return;

        tableBody.innerHTML = '<tr><td colspan="4" class="px-8 py-12 text-center text-slate-400 italic">Loading teachers...</td></tr>';

        try {
            const teachers = await this.getAll();
            const user = Auth.getCurrentUser();
            
            // Fetch classes to show homeroom info (filtered by school)
            const { data: classes } = await supabase
                .from('classes')
                .select('*')
                .eq('school_id', user.school_id || user.schoolId);

            tableBody.innerHTML = '';

            if (teachers.length === 0) {
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="4" class="px-8 py-12 text-center text-slate-400">
                            <span class="material-symbols-outlined text-4xl mb-2">person_off</span>
                            <p>${window.I18N ? I18N.t('no_classes_assigned') : 'No teachers found'}</p>
                        </td>
                    </tr>
                `;
                return;
            }

            teachers.forEach(teacher => {
                const homeroomClass = classes ? classes.find(c => c.teacher_id === teacher.id) : null;
                const homeroomInfo = homeroomClass 
                    ? `${window.I18N ? I18N.t('is_homeroom') : 'Homeroom'}: ${homeroomClass.name}`
                    : (window.I18N ? I18N.t('no') : 'No');

                const row = `
                    <tr class="hover:bg-[var(--emerald-glow)] transition-colors">
                        <td class="px-8 py-6 text-start">
                            <div class="flex flex-col">
                                <span class="font-bold text-[var(--text)]">${teacher.name}</span>
                                <span class="text-[11px] text-[var(--text-muted)] mt-1">
                                    ${teacher.subject || (window.I18N ? I18N.t('not_assigned') : 'Not assigned')} • ${homeroomInfo}
                                </span>
                            </div>
                        </td>
                        <td class="px-6 py-6 font-medium text-[var(--text-muted)]">
                            ID: ${teacher.national_id || '---'}
                        </td>
                        <td class="px-6 py-6 text-[var(--text-muted)]">${teacher.email}</td>
                        <td class="px-6 py-6 text-end">
                            <div class="flex justify-end gap-2">
                                <button onclick="Teachers.openAssignmentModal('${teacher.id}', '${teacher.name}')" class="icon-btn hover:text-[var(--emerald)]" title="Assign Subject">
                                    <span class="material-symbols-outlined">add_task</span>
                                </button>
                                <button onclick="Teachers.openEditModal('${teacher.id}')" class="icon-btn" title="Edit">
                                    <span class="material-symbols-outlined">edit</span>
                                </button>
                                <button onclick="Teachers.delete('${teacher.id}')" class="icon-btn hover:text-red-500" title="Delete">
                                    <span class="material-symbols-outlined">delete</span>
                                </button>
                            </div>
                        </td>
                    </tr>
                `;
                tableBody.insertAdjacentHTML('beforeend', row);
            });
        } catch (error) {
            console.error('Error rendering table:', error.message);
        }
    },

    init: function() {
        this.renderTable();

        const addForm = document.getElementById('addTeacherForm');
        if (addForm) {
            addForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                
                const btn = e.target.querySelector('button[type="submit"]');
                const originalText = btn.textContent;
                btn.disabled = true;
                btn.textContent = 'Adding...';

                const teacherData = {
                    name: document.getElementById('teacherName').value,
                    nationalId: document.getElementById('teacherNationalId').value,
                    subject: document.getElementById('teacherSubject').value,
                    email: document.getElementById('teacherEmail').value
                };

                const success = await Teachers.add(teacherData);
                if (success) {
                    await Teachers.renderTable();
                    document.getElementById('addTeacherModal').classList.remove('open');
                    addForm.reset();
                    Notifications.success('Success', window.I18N ? I18N.t('active') : 'Teacher added successfully!');
                }
                
                btn.disabled = false;
                btn.textContent = originalText;
            });
        }

        const editForm = document.getElementById('editTeacherForm');
        if (editForm) {
            editForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                
                const btn = e.target.querySelector('button[type="submit"]');
                const originalText = btn.textContent;
                btn.disabled = true;
                btn.textContent = 'Updating...';

                const teacherId = document.getElementById('editTeacherId').value;
                const teacherData = {
                    name: document.getElementById('editTeacherName').value,
                    nationalId: document.getElementById('editTeacherNationalId').value,
                    email: document.getElementById('editTeacherEmail').value,
                    subject: document.getElementById('editTeacherSubject').value
                };

                const success = await Teachers.update(teacherId, teacherData);
                if (success) {
                    await Teachers.renderTable();
                    document.getElementById('editTeacherModal').classList.add('hidden');
                    Notifications.success('Success', window.I18N ? I18N.t('active') : 'Teacher updated successfully!');
                }

                btn.disabled = false;
                btn.textContent = originalText;
            });
        }

        const assignForm = document.getElementById('assignmentForm');
        if (assignForm) {
            assignForm.addEventListener('submit', (e) => this.handleAssignmentSubmit(e));
        }
    }
};

document.addEventListener('DOMContentLoaded', () => Teachers.init());
