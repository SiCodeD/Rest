// Mock Database for EduPulse SaaS - Cleaned for Supabase migration
const EduPulseDB = {
    schools: [],
    users: [],
    classes: [],
    classSubjects: [],
    students: [],
    grades: [],
    attendance: [],
    notifications: [],
    messages: [],
    supportTickets: [],
    platformSettings: {
        trialDays: 14,
        defaultPlan: 'Professional',
        supportEmail: 'support@edupulse.com'
    }
};

function mergeDefaults(target, defaults) {
    if (Array.isArray(defaults)) {
        return Array.isArray(target) ? target : defaults;
    }

    const result = { ...defaults, ...(target || {}) };
    Object.keys(defaults).forEach(key => {
        if (typeof defaults[key] === 'object' && defaults[key] !== null && !Array.isArray(defaults[key])) {
            result[key] = mergeDefaults(target ? target[key] : undefined, defaults[key]);
        }
        if (Array.isArray(defaults[key]) && !Array.isArray(result[key])) {
            result[key] = defaults[key];
        }
    });
    return result;
}

function initializeDB() {
    const existing = localStorage.getItem('EduPulse_DB');
    if (!existing) {
        localStorage.setItem('EduPulse_DB', JSON.stringify(EduPulseDB));
        return;
    }

    try {
        const parsed = JSON.parse(existing);
        const merged = mergeDefaults(parsed, EduPulseDB);
        localStorage.setItem('EduPulse_DB', JSON.stringify(merged));
    } catch (error) {
        localStorage.setItem('EduPulse_DB', JSON.stringify(EduPulseDB));
    }
}

function getDB() {
    initializeDB();
    return JSON.parse(localStorage.getItem('EduPulse_DB'));
}

function saveDB(db) {
    localStorage.setItem('EduPulse_DB', JSON.stringify(db));
}

initializeDB();
