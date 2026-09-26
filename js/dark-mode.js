const DarkMode = {
    init() {
        this.applyTheme();

        window.matchMedia('(prefers-color-scheme: dark)')
            .addEventListener('change', () => {
                if (!localStorage.getItem('theme')) {
                    this.applyTheme();
                }
            });

        window.addEventListener('storage', (e) => {
            if (e.key === 'theme') {
                this.applyTheme();
            }
        });
    },

    // الفكرة: الصفحة الحالية تتحول فوراً، الباقي بالترتيب في الخلفية
    _applyProgressively(isDark) {
        // الخطوة 1: اخفي الأقسام المخفية من الـ render كلياً
        const inactiveSections = document.querySelectorAll('.admin-section:not(.active)');
        inactiveSections.forEach(s => {
            s.style.contentVisibility = 'hidden';
        });

        // الخطوة 2: طبّق الثيم — الآن المتصفح يرسم القسم الحالي فقط = فوري
        document.documentElement.classList.toggle('dark', isDark);
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
        this.updateToggleIcons();

        // الخطوة 3: أرجع الأقسام بالترتيب — قسم كل فريم
        requestAnimationFrame(() => {
            inactiveSections.forEach((section, i) => {
                setTimeout(() => {
                    section.style.contentVisibility = '';
                }, i * 32); // 32ms = ~2 فريم بين كل قسم وآخر
            });
        });
    },

    applyTheme() {
        const savedTheme = localStorage.getItem('theme');

        if (savedTheme === 'dark') {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }

        this.updateToggleIcons();
    },

    enable() {
        this._applyProgressively(true);
    },

    disable() {
        this._applyProgressively(false);
    },

    toggle() {
        const isDark = !document.documentElement.classList.contains('dark');
        this._applyProgressively(isDark);
    },

    updateToggleIcons() {
        const icons = document.querySelectorAll('.dark-mode-icon');
        const labels = document.querySelectorAll('.dark-mode-label');
        const isDark = document.documentElement.classList.contains('dark');

        icons.forEach(icon => {
            icon.textContent = isDark ? 'light_mode' : 'dark_mode';
        });

        labels.forEach(label => {
            label.textContent = isDark ? 'Light Mode' : 'Dark Mode';
        });
    }
};

document.addEventListener('DOMContentLoaded', () => DarkMode.init());
window.DarkMode = DarkMode;