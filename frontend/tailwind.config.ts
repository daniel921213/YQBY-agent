import type { Config } from "tailwindcss";

// 主題雙模式：所有顏色指向 globals.css 的 CSS 變數（RGB 三元組），
// html[data-theme="light"] 換一組變數值即可全站換膚。
// 關鍵語意反轉：
// - `white` 代表「墨色」(ink)：深色模式=白、淺色模式=深藍黑。
//   於是 border-white/10、bg-white/5 這類分隔線/淡填色在兩種模式都正確。
// - `slate` 整組刻度反轉：slate-100 永遠是「主要文字」、slate-500 永遠是「次要」。
const v = (name: string) => `rgb(var(${name}) / <alpha-value>)`;

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./hooks/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        obsidian: v("--c-obsidian"), // 頁面底色
        graphite: v("--c-graphite"), // 面板底色
        steel: v("--c-steel"), // 抬升/hover 表面
        ember: v("--c-ember"), // 冰藍主強調色
        copper: v("--c-copper"), // 冷銀藍金屬
        long: v("--c-long"),
        short: v("--c-short"),
        white: v("--c-ink"),
        slate: {
          50: v("--c-slate-50"),
          100: v("--c-slate-100"),
          200: v("--c-slate-200"),
          300: v("--c-slate-300"),
          400: v("--c-slate-400"),
          500: v("--c-slate-500"),
          600: v("--c-slate-600"),
          700: v("--c-slate-700"),
          800: v("--c-slate-800"),
          900: v("--c-slate-900"),
          950: v("--c-slate-950")
        },
        yellow: {
          300: v("--c-amber")
        },
        red: {
          100: v("--c-red-soft")
        }
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"]
      }
    }
  },
  plugins: [require("@tailwindcss/typography")]
};

export default config;
