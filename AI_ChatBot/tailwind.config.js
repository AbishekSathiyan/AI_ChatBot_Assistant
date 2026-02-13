module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      animation: {
        'fadeIn': 'fadeIn 0.2s ease forwards',
        'slideIn': 'slideIn 0.3s cubic-bezier(0.2, 0.9, 0.4, 1) forwards',
        'slideUp': 'slideUp 0.4s cubic-bezier(0.2, 0.9, 0.4, 1) forwards',
        'blink': 'blink 1s infinite',
        'gradient': 'gradient 3s ease infinite',
        'float': 'float 6s ease-in-out infinite',
        'pulse-slow': 'pulse-slow 3s ease-in-out infinite',
        'spin-slow': 'spin-slow 3s linear infinite',
        'bounce-slow': 'bounce-slow 2s ease-in-out infinite',
        'voice-wave': 'voice-wave 0.5s ease-in-out infinite',
        'voice-pulse': 'voice-pulse 1.5s infinite',
        'voice-ring': 'voice-ring 1s ease-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideIn: {
          '0%': { opacity: '0', transform: 'translateX(-10px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        blink: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0' },
        },
        gradient: {
          '0%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
          '100%': { backgroundPosition: '0% 50%' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        'pulse-slow': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.8' },
        },
        'spin-slow': {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        'bounce-slow': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-5px)' },
        },
        'voice-wave': {
          '0%': { transform: 'scaleY(0.5)' },
          '50%': { transform: 'scaleY(1.5)' },
          '100%': { transform: 'scaleY(0.5)' },
        },
        'voice-pulse': {
          '0%': { boxShadow: '0 0 0 0 rgba(239, 68, 68, 0.7)' },
          '70%': { boxShadow: '0 0 0 10px rgba(239, 68, 68, 0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(239, 68, 68, 0)' },
        },
        'voice-ring': {
          '0%': { transform: 'scale(1)', opacity: '1' },
          '100%': { transform: 'scale(2)', opacity: '0' },
        },
      },
    },
  },
  plugins: [],
}