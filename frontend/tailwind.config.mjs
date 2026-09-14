/** @type {import('tailwindcss').Config} */
const config = {
  darkMode: ['selector', 'html[data-color-scheme="dark"]'],
  content: [
    './app/**/*.{js,jsx,ts,tsx,mdx}'
  ],
  theme: {
    extend: {
      colors: {
        tph: {
          bg: 'var(--background-color)',
          primary: 'var(--primary-color)',
          secondary: 'var(--secondary-color)',
          button: 'var(--button-color)',
          buttonHover: 'var(--button-hover-color)',
          buttonText: 'var(--button-text-color)',
          text: 'var(--text-color)',
          surface: 'var(--card-color)',
          header: 'var(--header-color)',
          footer: 'var(--footer-color)',
          border: 'var(--border-color)',
          accent: 'var(--accent-color)',
          success: 'var(--success-color)',
          warning: 'var(--warning-color)',
          danger: 'var(--danger-color)'
        }
      },
      borderRadius: {
        tph: 'var(--card-border-radius)',
        button: 'var(--button-border-radius)'
      },
      boxShadow: {
        tph: 'var(--shadow)',
        soft: 'var(--soft-shadow)'
      },
      fontFamily: {
        tph: 'var(--font-family)'
      }
    }
  }
};

export default config;
