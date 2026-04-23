/**
 * i18n logic for EduPulse
 * Handles language switching, RTL/LTR support, and translation management.
 */

const I18N = {
    currentLang: localStorage.getItem('EduPulse_Lang') || 'ar',

    translations: {
        en: {
            // General
            dashboard: 'Dashboard',
            teachers: 'Teachers',
            students: 'Students',
            classes: 'Classes',
            reports: 'Reports',
            messages: 'Messages',
            settings: 'Settings',
            logout: 'Logout',
            search: 'Search...',
            loading: 'Loading...',
            active: 'Active',
            
            // Teacher Dashboard
            teacher_workspace: 'Teacher Workspace',
            assigned_classes: 'Assigned Classes',
            track_performance: 'Track attendance, lessons, and assessment tasks for your active classes.',
            daily_report: 'Daily Report',
            daily_reports: 'Daily Reports',
            daily_achievement_reports: 'Daily Achievement Reports',
            monitor_performance: 'Monitor teacher achievements and daily tasks.',
            tasks_completed: 'Tasks Completed',
            challenges: 'Challenges',
            next_steps: 'Next Steps',
            feedback: 'Admin Feedback',
            no_reports_found: 'No reports found for the selected date.',
            no_classes_assigned: 'No classes assigned yet',
            contact_admin: 'Contact your administrator for assignments.',
            room: 'Room',
            students_count: 'students',
            
            // Class Details
            class_performance: 'Class Performance',
            monitor_class: 'Monitor attendance, marks, and parent communication for this class.',
            export_report: 'Export Report',
            send_notes: 'Send Parent Notes',
            student_list: 'Students and Lesson Notes',
            student: 'Student',
            attendance: 'Attendance',
            score: 'Score',
            lesson_notes: 'Lesson Notes',
            present: 'Present',
            absent: 'Absent',
            late: 'Late',
            add_note: 'Add note...',
            class_insights: 'Class Insights',
            average_score: 'Average score',
            weekly_attendance: 'Weekly attendance',
            upcoming_tasks: 'Upcoming Tasks',
            
            // Auth / Login
            sign_in: 'Sign In',
            welcome_back: 'Welcome Back',
            email_address: 'Email Address',
            password: 'Password',
            remember_me: 'Remember me',
            forgot_password: 'Forgot Password?',
            login_btn: 'Login to your account',
            demo_accounts: 'Demo Accounts',
            admin: 'Admin',
            teacher: 'Teacher',
            secretary: 'Secretary',
            parent: 'Parent',
            
            // Sidebar Subtitles
            school_management: 'School Management',
            teacher_workspace_sub: 'Teacher Workspace',
            secretary_office: 'Secretary Office',
            parent_portal: 'Parent Portal',

            // Admin Dashboard
            school_overview: 'School Overview',
            snapshot: 'A quick snapshot of what is happening across your school today.',
            generate_report: 'Generate Report',
            quick_add: 'Quick Add',
            total_students: 'Total Students',
            teaching_staff: 'Teaching Staff',
            attendance_rate: 'Attendance Rate',
            enrollment_active: 'Enrollment is active',
            all_departments_covered: 'All departments covered',
            stable_this_week: 'Stable this week',

            // Management Pages
            teachers_directory: 'Teachers Directory',
            manage_teachers: 'Manage teacher records and teaching assignments.',
            add_teacher: 'Add Teacher',
            teacher_name: 'Teacher Name',
            full_name: 'Full Name',
            email: 'Email',
            actions: 'Actions',
            save_teacher: 'Save Teacher',
            not_assigned: 'Not assigned',
            specialization: 'Specialization',
            is_homeroom: 'Homeroom Teacher?',
            yes: 'Yes',
            no: 'No',
            password: 'Password',
            credentials_created: 'Account created! Password: ',
            delete_confirm: 'Are you sure you want to delete this?',
            
            students_directory: 'Students Directory',
            manage_students: 'A complete directory of enrolled students.',
            add_student: 'Add Student',
            student_name: 'Student Name',
            student_details: 'Student Details',
            health_info: 'Health Information',
            none: 'None',
            grade: 'Grade',
            status: 'Status',
            save_student: 'Save Student',

            // Class Placement
            class_placement: 'Class Placement',
            create_classes: 'Create classes, review capacity, and assign unplaced students.',
            unassigned_students: 'Unassigned Students',
            created_classes: 'Created Classes',
            capacity: 'Capacity',
            room: 'Room',
            homeroom_teacher: 'Homeroom Teacher',
            subject_teachers_by_class: 'Subject Teachers by Class',
            assign_subject_teacher: 'Assign Subject Teacher',
            auto_assign: 'Auto Assign',
            add_class: 'Add Class',
            
            // Reports
            school_reports: 'School Reports',
            performance_analytics: 'Performance Analytics',
            attendance_reports: 'Attendance Reports',

            // Secretary
            front_office: 'Front Office',
            admin_overview: 'Administrative Overview',
            office_tasks: 'Handle enrollment records, student registration, and daily office tasks.',
            registered_students: 'Registered Students',
            students_without_class: 'Students without class',
            need_placement: 'Need placement',

            // Parent
            family_portal: 'Family Portal',
            parent_welcome: 'Welcome back,',
            children_progress: 'Follow your children’s progress and recent school updates.',
            registered_children: 'Registered Children',
            recent_grades: 'Recent Grades',
            latest_notifications: 'Latest Notifications',
            attendance_month: 'Attendance this month',
            excellent: 'Excellent',
            view_grades: 'View Grades',
            attendance_log: 'Attendance Log',
            no_notifications: 'No new notifications',
            no_recent_grades: 'No recent grades yet',

            // Dashboard extras
            attendance_trends: 'Attendance Trends',
            daily_overview: 'Daily overview for the current term.',
            last_7_days: 'Last 7 days',
            last_30_days: 'Last 30 days',
            recent_activity: 'Recent Activity',
            view_all: 'View all',

            // Student Fields
            full_name_quad: 'Full Name (Quad)',
            national_id: 'National ID',
            birth_date: 'Birth Date',
            gender: 'Gender',
            male: 'Male',
            female: 'Female',
            health_issues: 'Health Issues?',
            health_details: 'Mention illness if any',
            is_orphan: 'Is Orphan?',
            
            // Parent Fields
            parent_info: 'Parent Information',
            parent_name: 'Parent Name',
            parent_phone: 'Phone Number',
            relation: 'Relation',
            address: 'Address',
            first_login_notice: 'First time logging in? Use your Email or National ID as username. You will be asked to set a password.',
            force_password_reset: 'Security Update: Please set your password to continue.',
            set_password: 'Set Password',

            // Teacher
            teacher_id_login: 'Login with National ID',

            // Language switcher
            switch_to_arabic: 'العربية',
            switch_to_english: 'English',
            light_mode: 'Light Mode',
            dark_mode: 'Dark Mode'
        },
        ar: {
            // General
            dashboard: 'لوحة التحكم',
            teachers: 'المعلمون',
            students: 'الطلاب',
            classes: 'الصفوف',
            reports: 'التقارير',
            messages: 'الرسائل',
            settings: 'الإعدادات',
            logout: 'تسجيل الخروج',
            search: 'بحث...',
            loading: 'جاري التحميل...',
            active: 'نشط',
            light_mode: 'الوضع الفاتح',
            dark_mode: 'الوضع الليلي',

            // Student Fields
            full_name_quad: 'الاسم رباعي',
            national_id: 'رقم الهوية',
            birth_date: 'تاريخ الميلاد',
            gender: 'الجنس',
            male: 'ذكر',
            female: 'أنثى',
            health_issues: 'هل يعاني من أمراض؟',
            health_details: 'اذكر المرض إن وجد',
            is_orphan: 'هل الطالب يتيم؟',
            
            // Parent Fields
            parent_info: 'معلومات ولي الأمر',
            parent_name: 'اسم ولي الأمر',
            parent_phone: 'رقم الجوال',
            relation: 'صلة القرابة',
            address: 'العنوان',
            first_login_notice: 'أول مرة تدخل؟ استخدم بريدك الإلكتروني أو رقم هويتك. سيُطلب منك تعيين كلمة سر فور الدخول.',
            force_password_reset: 'تحديث أمني: يرجى تعيين كلمة المرور الخاصة بك للمتابعة.',
            set_password: 'تعيين كلمة المرور',

            // Teacher
            teacher_id_login: 'الدخول بواسطة رقم الهوية',

            // Teacher Dashboard
            teacher_workspace: 'مساحة عمل المعلم',
            assigned_classes: 'الصفوف المخصصة',
            track_performance: 'تتبع الحضور والدروس ومهام التقييم لصفوفك النشطة.',
            daily_report: 'تقرير الإنجاز اليومي',
            daily_reports: 'تقارير المعلمين اليومية',
            daily_achievement_reports: 'تقارير الإنجاز اليومية',
            monitor_performance: 'مراقبة إنجازات المعلمين ومهامهم اليومية.',
            tasks_completed: 'المهام المنجزة',
            challenges: 'التحديات',
            next_steps: 'الخطوات القادمة',
            feedback: 'ملاحظات المدير',
            no_reports_found: 'لم يتم العثور على تقارير للتاريخ المحدد.',
            no_classes_assigned: 'لم يتم تعيين صفوف بعد',
            contact_admin: 'اتصل بمسؤول النظام للحصول على التعيينات.',
            room: 'غرفة',
            students_count: 'طلاب',
            
            // Class Details
            class_performance: 'أداء الصف',
            monitor_class: 'مراقبة الحضور والدرجات والتواصل مع أولياء الأمور لهذا الصف.',
            export_report: 'تصدير تقرير',
            send_notes: 'إرسال ملاحظات لولي الأمر',
            student_list: 'الطلاب وملاحظات الدروس',
            student: 'الطالب',
            attendance: 'الحضور',
            score: 'العلامة',
            lesson_notes: 'ملاحظات الدرس',
            present: 'حاضر',
            absent: 'غائب',
            late: 'متأخر',
            add_note: 'أضف ملاحظة...',
            class_insights: 'نظرة عامة على الصف',
            average_score: 'متوسط الدرجات',
            weekly_attendance: 'الحضور الأسبوعي',
            upcoming_tasks: 'المهام القادمة',
            
            // Auth / Login
            sign_in: 'تسجيل الدخول',
            welcome_back: 'مرحباً بك مجدداً',
            email_address: 'البريد الإلكتروني',
            password: 'كلمة المرور',
            remember_me: 'تذكرني',
            forgot_password: 'نسيت كلمة المرور؟',
            login_btn: 'دخول إلى حسابك',
            demo_accounts: 'حسابات تجريبية',
            admin: 'مدير',
            teacher: 'معلم',
            secretary: 'سكرتير',
            parent: 'ولي أمر',
            
            // Sidebar Subtitles
            school_management: 'إدارة المدرسة',
            teacher_workspace_sub: 'مساحة المعلم',
            secretary_office: 'مكتب السكرتارية',
            parent_portal: 'بوابة ولي الأمر',

            // Admin Dashboard
            school_overview: 'نظرة عامة على المدرسة',
            snapshot: 'لمحة سريعة عما يحدث في مدرستك اليوم.',
            generate_report: 'تصدير تقرير',
            quick_add: 'إضافة سريعة',
            total_students: 'إجمالي الطلاب',
            teaching_staff: 'الهيئة التدريسية',
            attendance_rate: 'نسبة الحضور',
            enrollment_active: 'التسجيل نشط',
            all_departments_covered: 'جميع الأقسام مغطاة',
            stable_this_week: 'مستقر هذا الأسبوع',

            // Management Pages
            teachers_directory: 'دليل المعلمين',
            manage_teachers: 'إدارة سجلات المعلمين وتعيينات التدريس.',
            add_teacher: 'إضافة معلم',
            teacher_name: 'اسم المعلم',
            full_name: 'الاسم الكامل',
            email: 'البريد الإلكتروني',
            actions: 'إجراءات',
            save_teacher: 'حفظ المعلم',
            not_assigned: 'غير محدد',
            specialization: 'التخصص',
            is_homeroom: 'مربي صف؟',
            yes: 'نعم',
            no: 'لا',
            password: 'كلمة المرور',
            credentials_created: 'تم إنشاء الحساب! كلمة المرور: ',
            delete_confirm: 'هل أنت متأكد أنك تريد حذف هذا؟',
            
            students_directory: 'دليل الطلاب',
            manage_students: 'دليل كامل للطلاب المسجلين.',
            add_student: 'إضافة طالب',
            student_name: 'اسم الطالب',
            student_details: 'بيانات الطالب',
            health_info: 'المعلومات الصحية',
            none: 'لا يوجد',
            grade: 'الصف',
            status: 'الحالة',
            save_student: 'حفظ الطالب',

            // Class Placement
            class_placement: 'توزيع الصفوف',
            create_classes: 'إنشاء الصفوف، مراجعة السعة، وتعيين الطلاب غير الموزعين.',
            unassigned_students: 'طلاب غير موزعين',
            created_classes: 'الصفوف المنشأة',
            capacity: 'السعة',
            room: 'الغرفة',
            homeroom_teacher: 'مربي الصف',
            subject_teachers_by_class: 'معلمي المواد حسب الصف',
            assign_subject_teacher: 'تعيين معلم مادة',
            auto_assign: 'توزيع تلقائي',
            add_class: 'إضافة صف',

            // Reports
            school_reports: 'تقارير المدرسة',
            performance_analytics: 'تحليلات الأداء',
            attendance_reports: 'تقارير الحضور',

            // Secretary
            front_office: 'مكتب السكرتارية',
            admin_overview: 'نظرة عامة إدارية',
            office_tasks: 'إدارة سجلات التسجيل، تسجيل الطلاب، والمهام المكتبية اليومية.',
            registered_students: 'الطلاب المسجلون',
            students_without_class: 'طلاب بدون صف',
            need_placement: 'بحاجة لتوزيع',

            // Parent
            family_portal: 'بوابة العائلة',
            parent_welcome: 'مرحباً بك مجدداً،',
            children_progress: 'تابع تقدم أطفالك وآخر تحديثات المدرسة.',
            registered_children: 'الأطفال المسجلون',
            recent_grades: 'آخر العلامات',
            latest_notifications: 'آخر التنبيهات',
            attendance_month: 'الحضور هذا الشهر',
            excellent: 'ممتاز',
            view_grades: 'عرض العلامات',
            attendance_log: 'سجل الحضور',
            no_notifications: 'لا توجد تنبيهات جديدة',
            no_recent_grades: 'لا توجد علامات حديثة بعد',

            // Dashboard extras
            attendance_trends: 'اتجاهات الحضور',
            daily_overview: 'نظرة عامة يومية للفصل الحالي.',
            last_7_days: 'آخر 7 أيام',
            last_30_days: 'آخر 30 يوم',
            recent_activity: 'آخر الأنشطة',
            view_all: 'عرض الكل',

            // Language switcher
            switch_to_arabic: 'العربية',
            switch_to_english: 'English'
        }
    },

    init: function() {
        this.applyLanguage(this.currentLang, false);
    },

    applyLanguage: function(lang, shouldReload = false) {
        if (!lang) lang = 'ar';
        this.currentLang = lang;
        localStorage.setItem('EduPulse_Lang', lang);
        
        const html = document.documentElement;
        html.setAttribute('lang', lang);
        html.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
        
        // Update body font if ready
        if (document.body) {
            if (lang === 'ar') {
                document.body.style.fontFamily = "'Cairo', sans-serif";
            } else {
                document.body.style.fontFamily = "'Inter', 'Manrope', sans-serif";
            }
        }
        
        this.translateDOM();
        this.updateLayout();
        
        if (shouldReload) {
            window.location.reload();
        }
    },

    updateLayout: function() {
        const isRTL = this.currentLang === 'ar';
        const main = document.querySelector('main');
        const header = document.querySelector('header.fixed');
        const sidebar = document.querySelector('aside');
        
        if (main) {
            if (isRTL) {
                main.style.marginRight = '16rem';
                main.style.marginLeft = '0';
            } else {
                main.style.marginLeft = '16rem';
                main.style.marginRight = '0';
            }
            main.classList.remove('ml-64', 'mr-64');
            // Force re-apply after a short delay for elements loaded later
            setTimeout(() => {
                if (main) {
                    if (isRTL) {
                        main.style.marginRight = '16rem';
                        main.style.marginLeft = '0';
                    } else {
                        main.style.marginLeft = '16rem';
                        main.style.marginRight = '0';
                    }
                }
            }, 100);
        }
        
        if (header) {
            header.style.width = 'calc(100% - 16rem)';
            if (isRTL) {
                header.style.right = '16rem';
                header.style.left = '0';
            } else {
                header.style.left = '16rem';
                header.style.right = '0';
            }
        }

        if (sidebar) {
            if (isRTL) {
                sidebar.style.right = '0';
                sidebar.style.left = 'auto';
                sidebar.classList.add('border-l');
                sidebar.classList.remove('border-r');
            } else {
                sidebar.style.left = '0';
                sidebar.style.right = 'auto';
                sidebar.classList.add('border-r');
                sidebar.classList.remove('border-l');
            }
        }
    },

    translateDOM: function() {
        const elements = document.querySelectorAll('[data-i18n]');
        const dict = this.translations[this.currentLang];
        
        elements.forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (dict[key]) {
                if (el.tagName === 'INPUT' && el.hasAttribute('placeholder')) {
                    el.placeholder = dict[key];
                } else {
                    el.textContent = dict[key];
                }
            }
        });

        // Update specific labels like lang switcher
        const langLabel = document.getElementById('langSwitchLabel');
        if (langLabel) {
            langLabel.textContent = this.currentLang === 'en' ? 'العربية' : 'English';
        }
    },

    t: function(key) {
        return this.translations[this.currentLang][key] || key;
    },

    toggleLanguage: function() {
        const newLang = this.currentLang === 'en' ? 'ar' : 'en';
        this.applyLanguage(newLang, true);
    },

    renderLanguageSwitcher: function() {
        // Find a place to put the switcher if not already there
        let switcher = document.getElementById('languageSwitcher');
        if (!switcher) {
            // Check if sidebar footer exists
            const footer = document.querySelector('aside .mt-auto');
            if (footer) {
                const btnHtml = `
                    <button id="languageSwitcher" onclick="I18N.toggleLanguage()" class="w-full flex items-center gap-3 px-4 py-3 text-slate-500 font-medium hover:bg-emerald-50/50 transition-colors mt-2 border-t border-slate-50">
                        <span class="material-symbols-outlined">language</span>
                        <span class="tracking-tight">${this.currentLang === 'en' ? 'العربية' : 'English'}</span>
                    </button>
                `;
                footer.insertAdjacentHTML('afterbegin', btnHtml);
            }
        }
    }
};

// Make it global
window.I18N = I18N;

// Run on DOMContentLoaded to ensure elements like body are present
document.addEventListener('DOMContentLoaded', () => {
    I18N.init();
});
