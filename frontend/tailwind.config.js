/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}", // <- Esto le dice a Tailwind que lea tu App.jsx
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}