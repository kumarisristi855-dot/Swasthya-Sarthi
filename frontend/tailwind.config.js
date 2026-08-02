/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        'care-primary': 'var(--color-primary)',
        'care-primary-hover': 'var(--color-primary-hover)',
        'care-primary-subtle': 'var(--color-primary-subtle)',
        'care-heading': 'var(--color-text-heading)',
        'care-body': 'var(--color-text-body)',
        'care-muted': 'var(--color-text-muted)',
        'care-warning': 'var(--color-warning-accent)',
        'care-danger': 'var(--color-danger)',
        'care-success': 'var(--color-success)',
        'care-neutral': 'var(--color-neutral-bg)',
        'care-surface': 'var(--color-surface)',
        'care-border': 'var(--color-border)',
      },
    },
  },
  plugins: [],
}
