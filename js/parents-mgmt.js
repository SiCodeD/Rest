/**
 * Parents Management Logic
 */

const ParentsMgmt = {
    getAll: async function() {
        const user = Auth.getCurrentUser();
        if (!user || (!user.schoolId && !user.school_id)) return [];

        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('school_id', user.school_id || user.schoolId)
                .eq('role', 'parent')
                .order('full_name', { ascending: true });

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error fetching parents:', error.message);
            return [];
        }
    },

    add: async function(parentData) {
        const user = Auth.getCurrentUser();
        if (!user || (!user.schoolId && !user.school_id)) return null;

        try {
            // For parent accounts, we typically create a profile in the 'profiles' table.
            // In a real app, you'd also create a Supabase Auth user.
            const tempId = crypto.randomUUID();
            const { data, error } = await supabase
                .from('profiles')
                .insert([{
                    id: tempId, 
                    school_id: user.school_id || user.schoolId,
                    full_name: parentData.name,
                    national_id: parentData.nationalId,
                    phone: parentData.phone,
                    role: 'parent'
                }])
                .select()
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error adding parent profile:', error.message);
            Notifications.error('Error', error.message);
            return null;
        }
    },

    renderTable: async function() {
        const tableBody = document.getElementById('parentsTableBody');
        if (!tableBody) return;

        tableBody.innerHTML = '<tr><td colspan="5" class="px-8 py-12 text-center text-slate-400 italic">Loading parents...</td></tr>';

        const parents = await this.getAll();
        tableBody.innerHTML = '';

        if (parents.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="5" class="px-8 py-12 text-center text-slate-400">No parents found</td></tr>';
            return;
        }

        parents.forEach(parent => {
            const row = `
                <tr class="hover:bg-emerald-50/20 transition-colors">
                    <td class="px-8 py-4 font-bold text-slate-700">${parent.full_name}</td>
                    <td class="px-6 py-4 text-slate-600 font-mono text-xs">${parent.national_id}</td>
                    <td class="px-6 py-4 text-slate-500">${parent.phone || '---'}</td>
                    <td class="px-6 py-4 text-slate-400 text-xs italic">Auth Account Required</td>
                    <td class="px-6 py-4 text-end">
                        <button onclick="ParentsMgmt.delete('${parent.id}')" class="text-slate-300 hover:text-red-600 transition-colors">
                            <span class="material-symbols-outlined">delete</span>
                        </button>
                    </td>
                </tr>
            `;
            tableBody.insertAdjacentHTML('beforeend', row);
        });
    },

    delete: async function(id) {
        if (!confirm('Are you sure you want to delete this parent profile?')) return;
        try {
            const { error } = await supabase.from('profiles').delete().eq('id', id);
            if (error) throw error;
            await this.renderTable();
        } catch (error) {
            Notifications.error('Error', error.message);
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    ParentsMgmt.renderTable();

    const form = document.getElementById('addParentForm');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const parentData = {
                name: document.getElementById('parentName').value,
                nationalId: document.getElementById('parentNationalId').value,
                email: document.getElementById('parentEmail').value,
                phone: document.getElementById('parentPhone').value
            };

            const success = await ParentsMgmt.add(parentData);
            if (success) {
                document.getElementById('addParentModal').classList.add('hidden');
                form.reset();
                await ParentsMgmt.renderTable();
            }
        });
    }
});