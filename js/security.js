/**
 * EduPulse Security & Sanitization Utilities
 */

const Security = {
    /**
     * Sanitizes a string to prevent XSS attacks.
     * Use this before inserting content into the DOM using innerHTML.
     */
    sanitize: function(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    },

    /**
     * Safely sets HTML content by sanitizing dynamic parts
     * This is a simple version. For a robust app, DOMPurify is recommended.
     */
    safeHTML: function(template, ...values) {
        return template.reduce((acc, part, i) => {
            return acc + Security.sanitize(values[i - 1]) + part;
        });
    }
};

window.Security = Security;
