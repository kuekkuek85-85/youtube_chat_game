import type { Metadata, Viewport } from "next";
import { Jua, Noto_Sans_KR } from "next/font/google";
import "./globals.css";

const body = Noto_Sans_KR({ variable: "--font-noto", subsets: ["latin"], weight: ["400", "700"], display: "swap" });
const display = Jua({ variable: "--font-jua", subsets: ["latin"], weight: "400", display: "swap" });

export const metadata: Metadata = {
  title: "선물상자 · 교사 개발자의 날",
  description: "댓글로 함께해 주셔서 고마워요! 내 닉네임으로 만든 캐릭터를 찾아보세요.",
};

export const viewport: Viewport = { themeColor: "#0A0D0C", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={`${body.variable} ${display.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
