// Student Management Logic using Supabase
const Students = {
    getAll: async function () {
        const user = Auth.getCurrentUser();
        if (!user || (!user.schoolId && !user.school_id)) return [];

        try {
            // Join with classes table to get the class name
            const { data, error } = await supabase
                .from('students')
                .select('*, classes(name)')
                .eq('school_id', user.school_id || user.schoolId)
                .order('created_at', { ascending: false });

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error fetching students:', error.message);
            return [];
        }
    },

    add: async function (studentData) {
        const user = Auth.getCurrentUser();
        if (!user || (!user.schoolId && !user.school_id)) return null;

        try {
            const newStudent = {
                school_id: user.school_id || user.schoolId,
                class_id: studentData.classId || null,
                name: studentData.name,
                national_id: studentData.nationalId,
                birth_date: studentData.birthDate,
                gender: studentData.gender,
                grade: studentData.grade,
                health_issues: studentData.healthIssues,
                health_details: studentData.healthDetails,
                is_orphan: studentData.isOrphan,
                parent_name: studentData.parentName,
                parent_national_id: studentData.parentNationalId,
                parent_phone: studentData.parentPhone,
                parent_relation: studentData.parentRelation,
                parent_address: studentData.parentAddress,
                status: 'Active',
                image: `https://ui-avatars.com/api/?name=${encodeURIComponent(studentData.name)}&background=random`
            };

            const { data, error } = await supabase
                .from('students')
                .insert([newStudent])
                .select()
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error adding student:', error.message);
            Notifications.error('Error', error.message);
            return null;
        }
    },

    update: async function (id, studentData) {
        try {
            const updateData = {
                class_id: studentData.classId || null,
                name: studentData.name,
                national_id: studentData.nationalId,
                birth_date: studentData.birthDate,
                gender: studentData.gender,
                grade: studentData.grade,
                health_issues: studentData.healthIssues,
                health_details: studentData.healthDetails,
                is_orphan: studentData.isOrphan,
                parent_name: studentData.parentName,
                parent_national_id: studentData.parentNationalId,
                parent_phone: studentData.parentPhone,
                parent_relation: studentData.parentRelation,
                parent_address: studentData.parentAddress
            };

            const { data, error } = await supabase
                .from('students')
                .update(updateData)
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error updating student:', error.message);
            Notifications.error('Error', error.message);
            return null;
        }
    },

    openEditModal: async function (id) {
        try {
            const { data: student, error } = await supabase
                .from('students')
                .select('*')
                .eq('id', id)
                .single();

            if (error) throw error;

            document.getElementById('editStudentId').value = student.id;
            document.getElementById('editStudentName').value = student.name;
            document.getElementById('editStudentNationalId').value = student.national_id;
            document.getElementById('editStudentBirthDate').value = student.birth_date;
            document.getElementById('editStudentGender').value = student.gender;
            document.getElementById('editStudentClass').value = student.class_id || '';
            document.getElementById('editStudentHasHealthIssues').checked = student.health_issues;
            document.getElementById('editStudentHealthDetails').value = student.health_details || '';
            document.getElementById('editStudentIsOrphan').checked = student.is_orphan;

            document.getElementById('editParentName').value = student.parent_name || '';
            document.getElementById('editParentNationalId').value = student.parent_national_id || '';
            document.getElementById('editParentPhone').value = student.parent_phone || '';
            document.getElementById('editParentRelation').value = student.parent_relation || '';
            document.getElementById('editParentAddress').value = student.parent_address || '';

            document.getElementById('editHealthDetailsContainer').classList.toggle('hidden', !student.health_issues);
            document.getElementById('editStudentModal').classList.add('open');
        } catch (error) {
            console.error('Error fetching student details:', error.message);
        }
    },

    viewStudent: async function (id) {
        try {
            const { data: student, error } = await supabase
                .from('students')
                .select('*')
                .eq('id', id)
                .single();

            if (error) throw error;

            document.getElementById('viewStudentImage').src = student.image;
            document.getElementById('viewStudentName').textContent = student.name;
            document.getElementById('viewStudentId').textContent = student.id.substring(0, 8); // Display short ID
            document.getElementById('viewStudentGrade').textContent = student.grade;
            document.getElementById('viewStudentClass').textContent = student.class_name || (window.I18N ? I18N.t('not_assigned') : 'Unassigned');
            document.getElementById('viewStudentNationalId').textContent = student.national_id;
            document.getElementById('viewStudentBirthDate').textContent = student.birth_date;

            document.getElementById('viewStudentGender').textContent = student.gender || '---';
            document.getElementById('viewStudentGender').className = `px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider ${student.gender === 'Female' ? 'bg-pink-500/10 text-pink-400' : 'bg-blue-500/10 text-blue-400'}`;

            const healthContainer = document.getElementById('viewStudentHealthInfo');
            const healthOk = document.getElementById('viewStudentHealthOk');
            const healthDetails = document.getElementById('viewHealthDetails');
            if (student.health_issues || student.has_health_issues) {
                if (healthContainer) { healthContainer.style.display = 'block'; }
                if (healthOk) { healthOk.style.display = 'none'; }
                if (healthDetails) { healthDetails.textContent = student.health_details || ''; }
            } else {
                if (healthContainer) { healthContainer.style.display = 'none'; }
                if (healthOk) { healthOk.style.display = 'flex'; }
            }

            document.getElementById('viewParentName').textContent = student.parent_name || 'Guardian Not Listed';
            document.getElementById('viewParentPhone').textContent = student.parent_phone || 'No Contact';
            document.getElementById('viewParentNationalId').textContent = `NID: ${student.parent_national_id || '---'}`;
            document.getElementById('viewParentAddress').textContent = student.parent_address || 'Address Not Provided';

            const statusColor = student.status === 'Active' ? '#34d399' : (student.status === 'Suspended' ? '#fbbf24' : '#f87171');
            const statusBg = student.status === 'Active' ? 'rgba(16,185,129,0.1)' : (student.status === 'Suspended' ? 'rgba(251,191,36,0.1)' : 'rgba(248,113,113,0.1)');
            const statusBorder = student.status === 'Active' ? 'rgba(16,185,129,0.2)' : (student.status === 'Suspended' ? 'rgba(251,191,36,0.2)' : 'rgba(248,113,113,0.2)');
            document.getElementById('viewStudentStatus').innerHTML = `
                <span style="width:5px;height:5px;border-radius:50%;background:${statusColor};"></span>
                ${window.I18N ? I18N.t(student.status.toLowerCase()) : student.status}
            `;
            const statusEl = document.getElementById('viewStudentStatus');
            statusEl.style.cssText = `display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:20px;background:${statusBg};border:1px solid ${statusBorder};font-size:10px;font-weight:700;color:${statusColor};font-family:'JetBrains Mono',monospace;`;
            const dotEl = document.getElementById('viewStudentStatusDot');
            if (dotEl) dotEl.style.background = statusColor;

            document.getElementById('viewStudentModal').classList.add('open');
        } catch (error) {
            console.error('Error viewing student:', error.message);
        }
    },

    delete: async function (id) {
        if (!confirm(window.I18N ? I18N.t('delete_confirm') : 'Are you sure you want to delete this student?')) return;

        try {
            const { error } = await supabase
                .from('students')
                .delete()
                .eq('id', id);

            if (error) throw error;

            await this.renderTable();
        } catch (error) {
            console.error('Error deleting student:', error.message);
            Notifications.error('Error', error.message);
        }
    },

    renderTable: async function () {
        const tableBody = document.getElementById('studentsTableBody');
        if (!tableBody) return;

        // Show loading
        tableBody.innerHTML = '<tr><td colspan="6" class="px-8 py-12 text-center text-slate-400 italic">Loading students...</td></tr>';

        const students = await this.getAll();
        tableBody.innerHTML = '';

        if (students.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="6" class="px-8 py-12 text-center text-slate-400">No students found.</td></tr>';
            this.updateStats(0);
            return;
        }

        students.forEach(student => {
            const className = student.classes ? student.classes.name : (window.I18N ? I18N.t('not_assigned') : 'Unassigned');
            const statusColor = student.status === 'Active' ? 'bg-[#10b98115] text-[#10b981]' : 'bg-orange-500/10 text-orange-400';
            const initials = student.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

            const statusBadge = student.status === 'Active'
                ? 'background:rgba(16,185,129,0.1);color:#34d399;border:1px solid rgba(16,185,129,0.2);'
                : 'background:rgba(251,191,36,0.1);color:#fbbf24;border:1px solid rgba(251,191,36,0.2);';

            const dotColor = student.status === 'Active' ? '#10b981' : '#f59e0b';
            const statusLabel = window.I18N ? I18N.t(student.status.toLowerCase()) : student.status;

            const avatarHtml = student.image
                ? `<img style="width:40px;height:40px;border-radius:12px;object-fit:cover;border:2px solid var(--border);flex-shrink:0;" src="${student.image}">`
                : `<div style="width:40px;height:40px;border-radius:12px;background:rgba(16,185,129,0.1);border:2px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;color:#34d399;flex-shrink:0;">${initials}</div>`;

            const row = `
                <tr style="border-bottom:1px solid var(--border); cursor:pointer; transition:background .15s;"
                    onclick="if(!event.target.closest('button')) Students.viewStudent('${student.id}')"
                    onmouseover="this.style.background='rgba(255,255,255,0.025)'"
                    onmouseout="this.style.background='transparent'">
                    <td style="padding:14px 20px;">
                        <div style="display:flex; align-items:center; gap:12px;">
                            <div style="position:relative; flex-shrink:0;">
                                ${avatarHtml}
                                <span style="position:absolute;bottom:-2px;right:-2px;width:10px;height:10px;border-radius:50%;background:${dotColor};border:2px solid var(--card);"></span>
                            </div>
                            <div>
                                <p style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:2px;">${student.name}</p>
                                <p style="font-size:10px;color:var(--text-muted);font-family:'JetBrains Mono',monospace;">${student.national_id}</p>
                            </div>
                        </div>
                    </td>
                    <td style="padding:14px 16px; font-family:'JetBrains Mono',monospace; font-size:10px; color:var(--text-muted); letter-spacing:1px; text-transform:uppercase;">${student.id.substring(0, 8)}</td>
                    <td style="padding:14px 16px;">
                        <span style="display:inline-block;padding:4px 10px;border-radius:8px;background:rgba(255,255,255,0.05);border:1px solid var(--border);font-size:11px;font-weight:600;color:var(--text);">${className}</span>
                    </td>
                    <td style="padding:14px 16px;">
                        <span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:20px;font-size:10px;font-weight:700;${statusBadge}">
                            <span style="width:5px;height:5px;border-radius:50%;background:currentColor;"></span>
                            ${statusLabel}
                        </span>
                    </td>
                    <td style="padding:14px 20px; text-align:end;">
                        <div style="display:flex;align-items:center;justify-content:flex-end;gap:6px;">
                            <button onclick="Students.openEditModal('${student.id}')"
                                style="width:32px;height:32px;border-radius:8px;border:1px solid var(--border);background:none;color:var(--text-muted);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s;"
                                onmouseover="this.style.color='var(--emerald)';this.style.borderColor='rgba(16,185,129,0.3)'"
                                onmouseout="this.style.color='var(--text-muted)';this.style.borderColor='var(--border)'">
                                <span class="material-symbols-outlined" style="font-size:15px;">edit_square</span>
                            </button>
                            <button onclick="Students.delete('${student.id}')"
                                style="width:32px;height:32px;border-radius:8px;border:1px solid var(--border);background:none;color:var(--text-muted);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s;"
                                onmouseover="this.style.color='#f87171';this.style.borderColor='rgba(248,113,113,0.3)'"
                                onmouseout="this.style.color='var(--text-muted)';this.style.borderColor='var(--border)'">
                                <span class="material-symbols-outlined" style="font-size:15px;">delete</span>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
            tableBody.insertAdjacentHTML('beforeend', row);
        });

        this.updateStats(students.length);
    },

    updateStats: function (count) {
        const countEl = document.getElementById('totalStudentCount');
        if (countEl) countEl.textContent = count;

        const labelEl = document.getElementById('studentCountLabel');
        if (labelEl) labelEl.textContent = `Showing ${count} students`;
    },

    renderClassOptions: async function () {
        const user = Auth.getCurrentUser();
        if (!user || (!user.schoolId && !user.school_id)) return;

        try {
            // Fetch classes for the school
            // If not yet created, this will fail gracefully.
            const { data: classes, error } = await supabase
                .from('classes')
                .select('*')
                .eq('school_id', user.school_id || user.schoolId);

            if (error) {
                console.warn('Classes table not found or empty.');
                return;
            }

            const selects = ['studentClass', 'editStudentClass'];
            selects.forEach(id => {
                const select = document.getElementById(id);
                if (select) {
                    select.innerHTML = `<option value="">${window.I18N ? I18N.t('not_assigned') : 'Not assigned'}</option>`;
                    classes.forEach(cls => {
                        select.insertAdjacentHTML('beforeend', `<option value="${cls.id}">${cls.name} (${cls.grade})</option>`);
                    });
                }
            });
        } catch (error) {
            console.error('Error fetching classes:', error.message);
        }
    }
};

document.addEventListener('DOMContentLoaded', async () => {
    await Students.renderTable();
    await Students.renderClassOptions();

    const addForm = document.getElementById('addStudentForm');
    if (addForm) {
        addForm.addEventListener('submit', async function (e) {
            e.preventDefault();

            const btn = e.target.querySelector('button[type="submit"]');
            const originalText = btn.textContent;
            btn.disabled = true;
            btn.textContent = 'Registering...';

            const classSelect = document.getElementById('studentClass');
            const classId = classSelect ? classSelect.value : null;

            // Note: In a real app, you'd fetch the class name/grade from the selected classId
            // For now we use the values from the form if available
            const formData = {
                name: document.getElementById('studentName').value,
                nationalId: document.getElementById('studentNationalId').value,
                birthDate: document.getElementById('studentBirthDate').value,
                gender: document.getElementById('studentGender').value,
                grade: 'Unassigned', // Will be updated when class is selected
                healthIssues: document.getElementById('studentHasHealthIssues').checked,
                healthDetails: document.getElementById('studentHealthDetails').value,
                isOrphan: document.getElementById('studentIsOrphan').checked,
                classId: classId,

                // Parent Info
                parentName: document.getElementById('parentName').value,
                parentNationalId: document.getElementById('parentNationalId').value,
                parentPhone: document.getElementById('parentPhone').value,
                parentRelation: document.getElementById('parentRelation').value,
                parentAddress: document.getElementById('parentAddress').value
            };

            const success = await Students.add(formData);
            if (success) {
                await Students.renderTable();
                document.getElementById('addStudentModal').classList.remove('open');
                addForm.reset();
                Notifications.success('Success', window.I18N ? I18N.t('active') : 'Student registered successfully!');
            }

            btn.disabled = false;
            btn.textContent = originalText;
        });
    }

    const editForm = document.getElementById('editStudentForm');
    if (editForm) {
        editForm.addEventListener('submit', async function (e) {
            e.preventDefault();

            const btn = e.target.querySelector('button[type="submit"]');
            const originalText = btn.textContent;
            btn.disabled = true;
            btn.textContent = 'Updating...';

            const studentId = document.getElementById('editStudentId').value;
            const classSelect = document.getElementById('editStudentClass');
            const classId = classSelect ? classSelect.value : null;

            const formData = {
                name: document.getElementById('editStudentName').value,
                nationalId: document.getElementById('editStudentNationalId').value,
                birthDate: document.getElementById('editStudentBirthDate').value,
                gender: document.getElementById('editStudentGender').value,
                grade: 'Unassigned',
                classId: classId,
                healthIssues: document.getElementById('editStudentHasHealthIssues').checked,
                healthDetails: document.getElementById('editStudentHealthDetails').value,
                isOrphan: document.getElementById('editStudentIsOrphan').checked,

                // Parent Info
                parentName: document.getElementById('editParentName').value,
                parentNationalId: document.getElementById('editParentNationalId').value,
                parentPhone: document.getElementById('editParentPhone').value,
                parentRelation: document.getElementById('editParentRelation').value,
                parentAddress: document.getElementById('editParentAddress').value
            };

            const success = await Students.update(studentId, formData);
            if (success) {
                await Students.renderTable();
                document.getElementById('editStudentModal').classList.remove('open');
                Notifications.success('Success', window.I18N ? I18N.t('active') : 'Student updated successfully!');
            }

            btn.disabled = false;
            btn.textContent = originalText;
        });
    }
});