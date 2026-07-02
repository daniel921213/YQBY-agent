import type { Config } from "tailwindcss";

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
        // 深空冰藍主題：底色帶藍調、唯一發光色是冰藍（對應星圖能量核）。
        // token 名稱沿用舊的（ember 等）以免全站改名，值已是新語意。
        // 2026-07 亮度校正：同色相往上提一階明度，深空感保留、壓迫感降低。
        obsidian: "#070c18", // deep-space navy-black（原 #04060c）
        graphite: "#0e1729", // navy panel（原 #0a111f）
        steel: "#1b2c4a", // raised / hover surface（原 #142036）
        ember: "#4cc2ff", // ice-blue primary glow（原橘色強調位）
        copper: "#9cb5d5", // cold silver-blue metal（原 #8fa9c9）
        long: "#23dd8d",
        short: "#ff5166"
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"]
      }
    }
  },
  plugins: [require("@tailwindcss/typography")]
};

export default config;
