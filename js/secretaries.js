/**
 * Secretary Management Logic using Supabase
 */

const Secretaries = {
    /**
     * Get all secretaries for the current school from Supabase
     */
    getAll: async function() {
        const user = Auth.getCurrentUser();
        if (!user || (!user.schoolId && !user.school_id)) return [];

        try {
            // We'll first try to fetch from a 'secretaries' table.
            // If it doesn't exist, we fallback or show empty.
            const { data, error } = await supabase
                .from('secretaries')
                .select('*')
                .eq('school_id', user.school_id || user.schoolId)
                .order('name', { ascending: true });

            if (error) {
                console.warn('Secretaries table might not exist yet. Fallback to profiles.');
                const { data: profileData, error: profileError } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('school_id', user.school_id || user.schoolId)
                    .eq('role', 'secretary');
                
                if (profileError) throw profileError;
                return profileData || [];
            }
            return data || [];
        } catch (error) {
            console.error('Error fetching secretaries:', error.message);
            return [];
        }
    },

    /**
     * Add a new secretary
     */
    add: async function(secretaryData) {
        const user = Auth.getCurrentUser();
        if (!user || (!user.schoolId && !user.school_id)) return null;

        try {
            // In a real app, this would involve creating an Auth user first.
            // For now, we'll insert into the 'secretaries' table.
            const { data, error } = await supabase
                .from('secretaries')
                .insert([{
                    school_id: user.school_id || user.schoolId,
                    name: secretaryData.name,
                    national_id: secretaryData.nationalId,
                    email: secretaryData.email,
                    status: 'Active'
                }])
                .select()
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error adding secretary:', error.message);
            Notifications.error('Error', error.message);
            return null;
        }
    },

    /**
     * Update an existing secretary
     */
    update: async function(id, secretaryData) {
        try {
            const { data, error } = await supabase
                .from('secretaries')
                .update({
                    name: secretaryData.name,
                    national_id: secretaryData.nationalId,
                    email: secretaryData.email
                })
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error updating secretary:', error.message);
            Notifications.error('Error', error.message);
            return null;
        }
    },

    /**
     * Open the edit modal
     */
    openEditModal: async function(id) {
        try {
            const { data: secretary, error } = await supabase
                .from('secretaries')
                .select('*')
                .eq('id', id)
                .single();

            if (error) throw error;

            document.getElementById('editSecretaryId').value = secretary.id;
            document.getElementById('editSecretaryName').value = secretary.name;
            document.getElementById('editSecretaryNationalId').value = secretary.national_id;
            document.getElementById('editSecretaryEmail').value = secretary.email;

            document.getElementById('editSecretaryModal').classList.remove('hidden');
        } catch (error) {
            console.error('Error fetching secretary details:', error.message);
        }
    },

    /**
     * Delete a secretary
     */
    delete: async function(id) {
        const confirmMsg = window.I18N ? I18N.t('delete_confirm') : 'Are you sure you want to delete this secretary?';
        if (!confirm(confirmMsg)) return;

        try {
            const { error } = await supabase
                .from('secretaries')
                .delete()
                .eq('id', id);

            if (error) throw error;
            await this.renderTable();
        } catch (error) {
            console.error('Error deleting secretary:', error.message);
            alert('Error: ' + error.message);
        }
    },

    /**
     * Render secretaries table
     */
    renderTable: async function() {
        const tableBody = document.getElementById('secretariesTableBody');
        if (!tableBody) return;

        tableBody.innerHTML = '<tr><td colspan="4" class="px-8 py-12 text-center text-slate-400 italic">Loading secretaries...</td></tr>';

        try {
            const secretaries = await this.getAll();
            tableBody.innerHTML = '';

            if (secretaries.length === 0) {
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="4" class="px-8 py-12 text-center text-slate-400">
                            <span class="material-symbols-outlined text-4xl mb-2">person_off</span>
                            <p>No secretaries found</p>
                        </td>
                    </tr>
                `;
                return;
            }

            secretaries.forEach(secretary => {
                const row = `
                    <tr class="hover:bg-emerald-50/20 transition-colors">
                        <td class="px-8 py-6 text-start">
                            <div class="flex flex-col">
                                <span class="font-bold text-slate-700">${secretary.name}</span>
                                <span class="text-[11px] text-slate-400 mt-1">Secretary</span>
                            </div>
                        </td>
                        <td class="px-6 py-6 font-medium text-slate-600">
                            ID: ${secretary.national_id || '---'}
                        </td>
                        <td class="px-6 py-6 text-slate-500">${secretary.email}</td>
                        <td class="px-6 py-6 text-end space-x-2 flex items-center justify-end gap-2">
                            <button onclick="Secretaries.openEditModal('${secretary.id}')" class="text-slate-400 hover:text-emerald-600 transition-colors">
                                <span class="material-symbols-outlined">edit</span>
                            </button>
                            <button onclick="Secretaries.delete('${secretary.id}')" class="text-slate-400 hover:text-red-600 transition-colors">
                                <span class="material-symbols-outlined">delete</span>
                            </button>
                        </td>
                    </tr>
                `;
                tableBody.insertAdjacentHTML('beforeend', row);
            });
        } catch (error) {
            console.error('Error rendering table:', error.message);
        }
    }
};

/**
 * Event Listeners
 */
document.addEventListener('DOMContentLoaded', async () => {
    await Secretaries.renderTable();

    const addForm = document.getElementById('addSecretaryForm');
    if (addForm) {
        addForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const btn = e.target.querySelector('button[type="submit"]');
            const originalText = btn.textContent;
            btn.disabled = true;
            btn.textContent = 'Adding...';

            const secretaryData = {
                name: document.getElementById('secretaryName').value,
                nationalId: document.getElementById('secretaryNationalId').value,
                email: document.getElementById('secretaryEmail').value
            };

            const success = await Secretaries.add(secretaryData);
            if (success) {
                await Secretaries.renderTable();
                document.getElementById('addSecretaryModal').classList.add('hidden');
                addForm.reset();
                Notifications.success('Success', window.I18N ? I18N.t('active') : 'Secretary added successfully!');
            }
            
            btn.disabled = false;
            btn.textContent = originalText;
        });
    }

    const editForm = document.getElementById('editSecretaryForm');
    if (editForm) {
        editForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const btn = e.target.querySelector('button[type="submit"]');
            const originalText = btn.textContent;
            btn.disabled = true;
            btn.textContent = 'Updating...';

            const secretaryId = document.getElementById('editSecretaryId').value;
            const secretaryData = {
                name: document.getElementById('editSecretaryName').value,
                nationalId: document.getElementById('editSecretaryNationalId').value,
                email: document.getElementById('editSecretaryEmail').value
            };

            const success = await Secretaries.update(secretaryId, secretaryData);
            if (success) {
                await Secretaries.renderTable();
                document.getElementById('editSecretaryModal').classList.add('hidden');
                Notifications.success('Success', window.I18N ? I18N.t('active') : 'Secretary updated successfully!');
            }

            btn.disabled = false;
            btn.textContent = originalText;
        });
    }
});
