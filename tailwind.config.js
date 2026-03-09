/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: '#0f172a',
          secondary: '#1e293b',
          tertiary: 'rgba(30, 41, 59, 0.8)',
        },
        accent: {
          violet: '#8b5cf6',
          blue: '#3b82f6',
          pink: '#ec4899',
        },
        text: {
          primary: '#ffffff',
          body: '#e2e8f0',
          muted: '#94a3b8',
        },
        status: {
          success: '#10b981',
          error: '#ef4444',
          warning: '#f59e0b',
        },
      },
      fontFamily: {
        sans: ['Inter', 'Plus Jakarta Sans', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      fontSize: {
        h1: ['32px', { lineHeight: '1.2' }],
        h2: ['24px', { lineHeight: '1.2' }],
        h3: ['18px', { lineHeight: '1.2' }],
        body: ['15px', { lineHeight: '1.5' }],
        small: ['13px', { lineHeight: '1.5' }],
        tiny: ['12px', { lineHeight: '1.5' }],
      },
      borderRadius: {
        panel: '12px',
        'panel-lg': '16px',
      },
      backdropBlur: {
        panel: '12px',
      },
      boxShadow: {
        glow: '0 0 20px rgba(139, 92, 246, 0.15)',
        'glow-strong': '0 0 30px rgba(139, 92, 246, 0.25)',
      },
      transitionDuration: {
        DEFAULT: '200ms',
        slow: '300ms',
      },
    },
  },
  plugins: [],
}
