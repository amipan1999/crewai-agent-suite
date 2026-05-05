/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        card: ['"Noto Serif JP"', '"Yu Mincho"', 'serif'],
        cardName: ['"Noto Serif JP"', '"Yu Mincho"', 'serif'],
      },
      colors: {
        // 遊戯王カード枠の代表色
        normalMonster: '#C9A876',
        effectMonster: '#B85A3E',
        fusionMonster: '#7B4F9E',
        ritualMonster: '#5B7BB5',
        synchroMonster: '#E8E8E8',
        xyzMonster: '#1A1A1A',
        linkMonster: '#1F4E8C',
        spellCard: '#2EA582',
        trapCard: '#B23B7A',
      },
    },
  },
  plugins: [],
};
