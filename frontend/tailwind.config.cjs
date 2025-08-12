/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx,js,jsx}'],
  theme: { extend: {} },
  safelist: [
    'max-w-[360px]',
    'min-h-[100svh]',
    'fade-in',
    'safe-bottom',
    'no-scrollbar',
    { pattern: /bg-\[.*\]/ },
    { pattern: /text-\[.*\]/ },
    { pattern: /border-\[.*\]/ },
  ],
  plugins: [],
};
