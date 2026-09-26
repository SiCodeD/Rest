/** @type {import('tailwindcss').Config} */
export default {
    content: [
        './index.html',
        './Pages/*.html',
        './Menu/**/*.html',
        './js/**/*.js',
    ],
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                primary: '#32CD32',
                'primary-deep': '#28a428',
            },
        },
    },
    plugins: [],
};
