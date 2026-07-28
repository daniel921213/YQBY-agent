import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "CT_KILLER",
    short_name: "CT_KILLER",
    description: "加密貨幣日內波段量化雷達",
    lang: "zh-Hant",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#050608",
    theme_color: "#050608",
    categories: ["finance", "utilities"],
    icons: [
      {
        src: "/icons/ct-killer-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any"
      },
      {
        src: "/icons/ct-killer-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any"
      },
      {
        src: "/icons/ct-killer-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable"
      }
    ]
  };
}
