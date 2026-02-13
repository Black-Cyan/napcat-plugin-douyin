/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                primary: '#FB7299',
                brand: {
                    50: '#fff1f3',
                    100: '#ffe0e6',
                    200: '#ffc6d3',
                    300: '#ff9db3',
                    400: '#fb7299',
                    500: '#FB7299',
                    600: '#e05a80',
                    700: '#c4446a',
                    800: '#a33758',
                    900: '#88304d',
                }
            },
            keyframes: {
                'fade-in-up': {
                    '0%': { opacity: '0', transform: 'translateY(12px)' },
                    '100%': { opacity: '1', transform: 'translateY(0)' },
                },
                'fade-in-down': {
                    '0%': { opacity: '0', transform: 'translateY(-8px)' },
                    '100%': { opacity: '1', transform: 'translateY(0)' },
                },
                'fade-in': {
                    '0%': { opacity: '0' },
                    '100%': { opacity: '1' },
                },
                'scale-in': {
                    '0%': { opacity: '0', transform: 'scale(0.95)' },
                    '100%': { opacity: '1', transform: 'scale(1)' },
                },
                'expand-down': {
                    '0%': { opacity: '0', maxHeight: '0', transform: 'scaleY(0.95)' },
                    '100%': { opacity: '1', maxHeight: '500px', transform: 'scaleY(1)' },
                },
            },
            animation: {
                'fade-in-up': 'fade-in-up 0.4s cubic-bezier(0.16, 1, 0.3, 1) both',
                'fade-in-down': 'fade-in-down 0.3s cubic-bezier(0.16, 1, 0.3, 1) both',
                'fade-in': 'fade-in 0.3s ease both',
                'scale-in': 'scale-in 0.3s cubic-bezier(0.16, 1, 0.3, 1) both',
                'expand-down': 'expand-down 0.35s cubic-bezier(0.16, 1, 0.3, 1) both',
            },
        },
    },
    plugins: [],
}
