import type { Metadata } from "next";
import "@fontsource-variable/noto-sans-tc";
import "@fontsource-variable/space-grotesk";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";

export const metadata: Metadata = {
  title: "CT_Killer",
  description: "加密貨幣日內波段量化雷達"
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
