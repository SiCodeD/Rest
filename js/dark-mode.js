/**
 * Dark Mode Management for EduPulse
 * Handles theme switching, persistence, and system preference detection.
 */

const DarkMode = {
    init() {
        this.applyTheme();
        
        // Listen for system preference changes
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
            if (!localStorage.getItem('theme')) {
                this.applyTheme();
            }
        });
    },

    applyTheme() {
        const savedTheme = localStorage.getItem('theme');
        const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        
        if (savedTheme === 'dark' || (!savedTheme && systemPrefersDark)) {
            document.documentElement.classList.add('dark');
            document.documentElement.classList.remove('light');
        } else {
            document.documentElement.classList.add('light');
            document.documentElement.classList.remove('dark');
        }
        this.updateToggleIcons();
    },

    enable() {
        document.documentElement.classList.add('dark');
        document.documentElement.classList.remove('light');
        localStorage.setItem('theme', 'dark');
        this.updateToggleIcons();
    },

    disable() {
        document.documentElement.classList.add('light');
        document.documentElement.classList.remove('dark');
        localStorage.setItem('theme', 'light');
        this.updateToggleIcons();
    },

    toggle() {
        if (document.documentElement.classList.contains('dark')) {
            this.disable();
        } else {
            this.enable();
        }
    },

    updateToggleIcons() {
        const icons = document.querySelectorAll('.dark-mode-icon');
        const labels = document.querySelectorAll('.dark-mode-label');
        const isDark = document.documentElement.classList.contains('dark');

        icons.forEach(icon => {
            icon.textContent = isDark ? 'light_mode' : 'dark_mode';
        });

        labels.forEach(label => {
            if (window.I18N) {
                label.textContent = isDark ? I18N.t('light_mode') : I18N.t('dark_mode');
            } else {
                label.textContent = isDark ? 'Light Mode' : 'Dark Mode';
            }
        });
    }
};

// Initialize on load
document.addEventListener('DOMContentLoaded', () => DarkMode.init());

// Export for global use
window.DarkMode = DarkMode;
