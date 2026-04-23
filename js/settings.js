const SettingsPage = {
    init: async function() {
        Auth.checkAuth();
        const form = document.getElementById('settingsForm');
        if (!form) return;

        await this.populate();
        form.addEventListener('submit', async event => {
            event.preventDefault();
            await this.save();
        });
    },

    populate: async function() {
        const currentUser = Auth.getCurrentUser();
        
        try {
            // Fetch latest data from Supabase
            const { data: profile, error } = await supabase
                .from('profiles')
                .select('*, schools(name)')
                .eq('id', currentUser.id)
                .single();

            if (error) throw error;

            document.getElementById('settingsFullName').value = profile.full_name || '';
            document.getElementById('settingsEmail').value = currentUser.email || '';
            
            const schoolNameField = document.getElementById('settingsSchoolName');
            if (schoolNameField) {
                schoolNameField.value = profile.schools ? profile.schools.name : '';
                // Only allow school name change for admins
                if (profile.role !== 'admin') {
                    schoolNameField.disabled = true;
                    schoolNameField.classList.add('bg-slate-50', 'text-slate-400');
                }
            }
        } catch (error) {
            console.error('Error populating settings:', error.message);
            Notifications.error('Error', 'Failed to load settings data');
        }
    },

    save: async function() {
        const currentUser = Auth.getCurrentUser();
        const fullName = document.getElementById('settingsFullName').value.trim();
        const schoolName = document.getElementById('settingsSchoolName') ? document.getElementById('settingsSchoolName').value.trim() : null;

        try {
            Notifications.info('Saving...', 'Updating your profile information');

            // 1. Update Profile in Supabase
            const { error: profileError } = await supabase
                .from('profiles')
                .update({ full_name: fullName })
                .eq('id', currentUser.id);

            if (profileError) throw profileError;

            // 2. Update School Name if User is Admin
            if (currentUser.role === 'admin' && schoolName) {
                const { error: schoolError } = await supabase
                    .from('schools')
                    .update({ name: schoolName })
                    .eq('id', currentUser.schoolId);
                
                if (schoolError) throw schoolError;
            }

            // 3. Update Local Session
            const updatedUser = { ...currentUser, name: fullName };
            if (currentUser.role === 'admin' && schoolName) {
                updatedUser.schoolName = schoolName;
            }
            localStorage.setItem('EduPulse_Session', JSON.stringify(updatedUser));

            Notifications.success('Success', 'Settings updated successfully.');
            
            // Trigger UI update for user name/initials in header if needed
            if (window.Navigation) {
                // You might need a small reload or a custom event here to update the header
                setTimeout(() => window.location.reload(), 1000);
            }

        } catch (error) {
            console.error('Error saving settings:', error.message);
            Notifications.error('Save Failed', error.message);
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    SettingsPage.init();
});
