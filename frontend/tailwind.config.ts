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
        obsidian: "#04060c", // deep-space black
        graphite: "#0a111f", // navy panel
        steel: "#142036", // raised / hover surface
        ember: "#4cc2ff", // ice-blue primary glow（原橘色強調位）
        copper: "#8fa9c9", // cold silver-blue metal
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
