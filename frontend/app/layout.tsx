import type { Metadata, Viewport } from "next";
import "@fontsource-variable/noto-sans-tc";
import "@fontsource-variable/space-grotesk";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";

export const metadata: Metadata = {
  title: "CT_Killer",
  applicationName: "CT_KILLER",
  description: "加密貨幣日內波段量化雷達",
  appleWebApp: {
    capable: true,
    title: "CT_KILLER",
    statusBarStyle: "black-translucent"
  },
  formatDetection: {
    telephone: false
  },
  icons: {
    icon: [
      { url: "/icons/ct-killer-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/ct-killer-512.png", sizes: "512x512", type: "image/png" }
    ],
    apple: [
      { url: "/icons/ct-killer-apple-180.png", sizes: "180x180", type: "image/png" }
    ]
  }
};

export const viewport: Viewport = {
  themeColor: "#050608",
  colorScheme: "dark",
  viewportFit: "cover"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant" suppressHydrationWarning>
      <head>
        {/* 首屏前套用已儲存的主題，避免深→淺閃爍。 */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              'try{if(localStorage.getItem("yqby.theme")==="light")document.documentElement.dataset.theme="light"}catch(e){}'
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
