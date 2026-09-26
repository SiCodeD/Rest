/**
 * EduPulse Toast Notifications System
 * A sleek, modern replacement for browser alert()
 */

const Notifications = {
    init: function () {
        // Inject CSS for notifications
        const style = document.createElement('style');
        style.textContent = `
            .toast-container {
                position: fixed;
                bottom: 24px;
                left: 50%;
                transform: translateX(-50%);
                z-index: 9999;
                display: flex;
                flex-direction: column;
                gap: 10px;
                align-items: center;
                pointer-events: none;
                width: min(92vw, 420px);
            }
            .toast-container-top {
                position: fixed;
                top: 18px;
                left: 50%;
                transform: translateX(-50%);
                z-index: 10000;
                display: flex;
                flex-direction: column;
                gap: 10px;
                align-items: center;
                pointer-events: none;
                width: min(94vw, 560px);
            }
            .toast {
                pointer-events: auto;
                position: relative;
                display: flex;
                align-items: flex-start;
                gap: 12px;
                width: 100%;
                background: var(--panel-strong, #ffffff);
                color: var(--text, #0f172a);
                border: 1px solid var(--stroke, #e5e7eb);
                border-radius: 16px;
                padding: 14px 16px 18px;
                box-shadow: 0 18px 50px rgba(15, 23, 42, 0.18);
                opacity: 0;
                transform: translateY(12px);
                transition: opacity 0.3s ease, transform 0.35s cubic-bezier(0.22, 1, 0.36, 1);
                overflow: hidden;
                font-family: inherit;
            }
            .toast.show {
                opacity: 1;
                transform: none;
            }
            /* Top Toast Animation */
            .toast-top {
                transform: translateY(-150%);
            }
            .toast-top.show {
                transform: translateY(0);
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
                width: 100%;
                transition: width linear;
            }
            
            /* Types */
            .toast-success { border-inline-start: 4px solid #10b981; }
            .toast-success .toast-icon { color: #10b981; }
            .toast-success .toast-progress-bar { background: #10b981; }
            
            .toast-error { border-inline-start: 4px solid #ef4444; }
            .toast-error .toast-icon { color: #ef4444; }
            .toast-error .toast-progress-bar { background: #ef4444; }
            
            .toast-info { border-inline-start: 4px solid #3b82f6; }
            .toast-info .toast-icon { color: #3b82f6; }
            .toast-info .toast-progress-bar { background: #3b82f6; }
            
            .toast-warning { border-inline-start: 4px solid #f59e0b; }
            .toast-warning .toast-icon { color: #f59e0b; }
            .toast-warning .toast-progress-bar { background: #f59e0b; }

            /* Announcement Type (Special for Manager) */
            .toast-announcement {
                background: #0f172a;
                color: white;
                border: 2px solid #10b981;
                box-shadow: 0 10px 50px rgba(16, 185, 129, 0.5);
                padding: 24px 32px;
                min-width: 450px;
                border-radius: 24px;
            }
            .toast-announcement .toast-icon { 
                color: #10b981; 
                font-size: 32px; 
                background: rgba(16, 185, 129, 0.1);
                width: 60px;
                height: 60px;
                display: grid;
                place-items: center;
                border-radius: 18px;
                margin-left: 12px;
            }
            .toast-announcement .toast-title { 
                color: #10b981; 
                font-size: 18px; 
                font-weight: 900;
                margin-bottom: 6px; 
            }
            .toast-announcement .toast-message { 
                color: #f8fafc; 
                font-size: 15px; 
                font-weight: 600; 
                line-height: 1.6;
            }
            .toast-announcement .toast-progress-bar { background: #10b981; height: 4px; }
        `;
        document.head.appendChild(style);

        // Create containers
        const container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);

        const containerTop = document.createElement('div');
        containerTop.id = 'toast-container-top';
        containerTop.className = 'toast-container-top';
        document.body.appendChild(containerTop);

        // Listen for Realtime Announcements
        // Small delay to ensure supabase-config.js is fully processed
        setTimeout(() => this.subscribeToAnnouncements(), 1000);
    },

    subscribeToAnnouncements: function () {
        if (!window.supabase) {
            console.error('Notifications: Supabase not found');
            return;
        }

        if (window.announcementChannel) {
            console.log('Notifications: Already subscribed to announcements');
            return;
        }

        console.log('Notifications: Starting subscription...');

        window.announcementChannel = window.supabase.channel('any-announcements')
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'announcements'
            }, async payload => {
                console.log('REALTIME EVENT RECEIVED:', payload);
                const data = payload.new;

                // Show only announcements targeted to the current restaurant and role.
                const shouldShow = await this.shouldDisplayAnnouncement(data);
                if (!shouldShow) {
                    console.log('Announcement skipped due to filtering');
                    return;
                }
                this.show(data.title || 'إعلان إداري جديد', data.content, 'announcement', 12000);
            })
            .subscribe((status, err) => {
                console.log('Realtime Status:', status);
                if (err) console.error('Realtime Error:', err);

                if (status === 'CHANNEL_ERROR') {
                    console.error('Realtime Channel Error. Make sure Replication is enabled for "announcements" table.');
                }
            });
    },

    shouldDisplayAnnouncement: async function (announcement) {
        let user = null;

        if (window.Auth && typeof Auth.getCurrentUser === 'function') {
            user = await Auth.getCurrentUser();
        }

        // Fallback for timing issues before Auth is fully ready.
        if (!user) {
            try {
                user = JSON.parse(localStorage.getItem('EduPulse_Session') || 'null');
            } catch (_) {
                user = null;
            }
        }

        if (!user || !announcement) {
            return false;
        }

        const userRole = user.role;
        const userRestaurantId = user.restaurantId || null;
        const annRestaurantId = announcement.restaurant_id || null;

        if (userRestaurantId && annRestaurantId && userRestaurantId !== annRestaurantId) {
            return false;
        }

        let targetRoles = [];
        if (Array.isArray(announcement.target_roles)) {
            targetRoles = announcement.target_roles;
        } else if (typeof announcement.target_roles === 'string') {
            // Support Postgres array string format like "{teacher,parent}".
            targetRoles = announcement.target_roles
                .replace(/[{}]/g, '')
                .split(',')
                .map(role => role.trim().replace(/"/g, ''))
                .filter(Boolean);
        }

        console.log('Filtering Announcement:', {
            userRole,
            targetRoles,
            isMatch: targetRoles.includes('all') || targetRoles.includes(userRole)
        });

        // Backward compatibility: if old announcement has no target_roles, show it.
        if (targetRoles.length === 0) {
            return true;
        }

        return targetRoles.includes('all') || targetRoles.includes(userRole);
    },

    show: function (title, message, type = 'info', duration = 5000) {
        const isAnnouncement = type === 'announcement';
        const containerId = isAnnouncement ? 'toast-container-top' : 'toast-container';
        let container = document.getElementById(containerId);

        if (!container) {
            this.init();
            container = document.getElementById(containerId);
        }

        const toast = document.createElement('div');
        toast.className = `toast toast-${type} ${isAnnouncement ? 'toast-top' : ''}`;

        const icons = {
            success: 'check_circle',
            error: 'error',
            info: 'info',
            warning: 'warning',
            announcement: 'campaign'
        };

        const safeTitle = window.Security ? Security.sanitize(title) : title;
        const safeMessage = window.Security ? Security.sanitize(message) : message;

        toast.innerHTML = `
            <span class="toast-icon">${icons[type] || 'info'}</span>
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

        // Progress bar (Draining effect)
        const progressBar = toast.querySelector('.toast-progress-bar');
        progressBar.style.transitionDuration = `${duration}ms`;
        setTimeout(() => progressBar.style.width = '0%', 50);

        // Cleanup
        setTimeout(() => {
            toast.classList.remove('show');
            // Stop progress bar animation during exit
            progressBar.style.transition = 'none';
            progressBar.style.width = '0%';
            setTimeout(() => toast.remove(), 600);
        }, duration);
    },

    /**
     * Database-driven Notifications (via Supabase)
     */
    db: {
        /**
         * Send a general notification to a specific user
         */
        send: async function (userId, title, message) {
            try {
                if (!window.supabase) throw new Error('Supabase client not initialized');

                const { error } = await window.supabase
                    .from('notifications')
                    .insert([{
                        user_id: userId,
                        title: title,
                        message: message,
                        restaurant_id: (await Auth.getCurrentUser())?.restaurantId
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
         * Subscribe to real-time notifications for the current user
         */
        subscribe: function (userId, callback) {
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

    initContainer: function () {
        this.init();
        return document.getElementById('toast-container');
    },

    success: function (title, message) { this.show(title, message, 'success'); },
    error: function (title, message) { this.show(title, message, 'error'); },
    info: function (title, message) { this.show(title, message, 'info'); },
    warning: function (title, message) { this.show(title, message, 'warning'); }
};

// Auto-init on load if body exists
if (document.body) Notifications.init();
else document.addEventListener('DOMContentLoaded', () => Notifications.init());
