/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx,js,jsx}'],
  theme: { extend: {} },
  safelist: [
    'max-w-[328px]',
    'min-h-[100svh]',
    'fade-in',
    'safe-bottom',
    'no-scrollbar',

    // arbitrary classes, чтобы Tailwind не ругался и не срезал их
    'bg-[var(--tg-theme-button-color,#10b981)]',
    'text-[var(--tg-theme-button-text-color,#fff)]',
    'border-[color:var(--tg-theme-section-separator-color,#e5e7eb)]',
    'bg-[linear-gradient(180deg,rgba(20,184,166,.10)_0%,rgba(59,130,246,.06)_30%,transparent_70%)]',
    'bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,.15),transparent_40%)]',
    'bg-[rgba(0,0,0,.05)]',
    'dark:bg-[rgba(255,255,255,.07)]',
  ],
  plugins: [],
};
