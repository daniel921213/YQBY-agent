import type { Metadata } from "next";
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
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
