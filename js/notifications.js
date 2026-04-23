/**
 * EduPulse Toast Notifications System
 * A sleek, modern replacement for browser alert()
 */

const Notifications = {
    init: function() {
        // Inject CSS for notifications
        const style = document.createElement('style');
        style.textContent = `
            .toast-container {
                position: fixed;
                bottom: 24px;
                right: 24px;
                z-index: 9999;
                display: flex;
                flex-direction: column;
                gap: 12px;
                pointer-events: none;
            }
            .toast {
                background: white;
                color: #0b1c30;
                padding: 16px 24px;
                border-radius: 16px;
                box-shadow: 0 20px 40px -8px rgba(11, 28, 48, 0.12);
                border: 1px border-slate-100;
                display: flex;
                align-items: center;
                gap: 12px;
                min-width: 300px;
                max-width: 450px;
                transform: translateX(120%);
                transition: transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                pointer-events: auto;
                position: relative;
                overflow: hidden;
            }
            .toast.show {
                transform: translateX(0);
            }
            .toast-icon {
                font-family: 'Material Symbols Outlined';
                font-size: 20px;
                flex-shrink: 0;
            }
            .toast-content {
                flex-grow: 1;
            }
            .toast-title {
                font-weight: 800;
                font-size: 13px;
                margin-bottom: 2px;
                display: block;
            }
            .toast-message {
                font-size: 12px;
                color: #64748b;
                line-height: 1.4;
            }
            .toast-progress {
                position: absolute;
                bottom: 0;
                left: 0;
                height: 3px;
                background: rgba(0,0,0,0.05);
                width: 100%;
            }
            .toast-progress-bar {
                height: 100%;
                width: 0%;
                transition: width linear;
            }
            
            /* Types */
            .toast-success .toast-icon { color: #10b981; }
            .toast-success .toast-progress-bar { background: #10b981; }
            
            .toast-error .toast-icon { color: #ef4444; }
            .toast-error .toast-progress-bar { background: #ef4444; }
            
            .toast-info .toast-icon { color: #3b82f6; }
            .toast-info .toast-progress-bar { background: #3b82f6; }
            
            .toast-warning .toast-icon { color: #f59e0b; }
            .toast-warning .toast-progress-bar { background: #f59e0b; }
        `;
        document.head.appendChild(style);

        // Create container
        const container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
    },

    show: function(title, message, type = 'info', duration = 5000) {
        const container = document.getElementById('toast-container') || this.initContainer();
        
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        
        const icons = {
            success: 'check_circle',
            error: 'error',
            info: 'info',
            warning: 'warning'
        };

        const safeTitle = window.Security ? Security.sanitize(title) : title;
        const safeMessage = window.Security ? Security.sanitize(message) : message;

        toast.innerHTML = `
            <span class="toast-icon">${icons[type]}</span>
            <div class="toast-content">
                <span class="toast-title">${safeTitle}</span>
                <p class="toast-message">${safeMessage}</p>
            </div>
            <div class="toast-progress">
                <div class="toast-progress-bar"></div>
            </div>
        `;

        container.appendChild(toast);

        // Animation
        setTimeout(() => toast.classList.add('show'), 10);

        // Progress bar
        const progressBar = toast.querySelector('.toast-progress-bar');
        progressBar.style.transitionDuration = `${duration}ms`;
        setTimeout(() => progressBar.style.width = '100%', 50);

        // Cleanup
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 400);
        }, duration);
    },

    /**
     * Database-driven Notifications (via Supabase)
     */
    db: {
        /**
         * Send a general notification to a specific user
         */
        send: async function(userId, title, message) {
            try {
                if (!window.supabase) throw new Error('Supabase client not initialized');
                
                const { error } = await window.supabase
                    .from('notifications')
                    .insert([{
                        user_id: userId,
                        title: title,
                        message: message,
                        status: 'unread'
                    }]);

                if (error) throw error;
                console.log('Database notification sent successfully to:', userId);
                return true;
            } catch (error) {
                console.error('Error sending database notification:', error.message);
                return false;
            }
        },

        /**
         * Send a notification to the parent of a specific student
         */
        sendToParent: async function(studentId, title, message) {
            try {
                if (!window.supabase) throw new Error('Supabase client not initialized');

                // 1. Get the parent_national_id for the student
                const { data: student, error: studentError } = await window.supabase
                    .from('students')
                    .select('parent_national_id')
                    .eq('id', studentId)
                    .single();

                if (studentError) throw studentError;
                if (!student || !student.parent_national_id) {
                    console.warn('No parent national ID found for student:', studentId);
                    return false;
                }

                // 2. Find the parent profile ID using the national ID
                const { data: parent, error: parentError } = await window.supabase
                    .from('profiles')
                    .select('id')
                    .eq('national_id', student.parent_national_id)
                    .eq('role', 'parent')
                    .single();

                if (parentError || !parent) {
                    console.warn('No registered parent profile found with national ID:', student.parent_national_id);
                    return false;
                }

                // 3. Send the notification to the parent's profile ID
                return await this.send(parent.id, title, message);
            } catch (error) {
                console.error('Error sending notification to parent:', error.message);
                return false;
            }
        },

        /**
         * Subscribe to real-time notifications for the current user
         */
        subscribe: function(userId, callback) {
            if (!window.supabase) return null;

            console.log('Subscribing to real-time notifications for user:', userId);

            return window.supabase
                .channel('realtime_notifications')
                .on(
                    'postgres_changes',
                    {
                        event: 'INSERT',
                        schema: 'public',
                        table: 'notifications',
                        filter: `user_id=eq.${userId}`
                    },
                    (payload) => {
                        console.log('New notification received!', payload.new);
                        if (callback) callback(payload.new);
                    }
                )
                .subscribe();
        }
    },

    initContainer: function() {
        this.init();
        return document.getElementById('toast-container');
    },

    success: function(title, message) { this.show(title, message, 'success'); },
    error: function(title, message) { this.show(title, message, 'error'); },
    info: function(title, message) { this.show(title, message, 'info'); },
    warning: function(title, message) { this.show(title, message, 'warning'); }
};

// Auto-init on load if body exists
if (document.body) Notifications.init();
else document.addEventListener('DOMContentLoaded', () => Notifications.init());
