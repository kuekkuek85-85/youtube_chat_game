import type { Metadata, Viewport } from "next";
import { Noto_Sans_KR } from "next/font/google";
import "./globals.css";

// PPT 의 맑은 고딕과 가장 가까운 웹 글꼴 하나로 통일 (design.md 2)
const body = Noto_Sans_KR({ variable: "--font-noto", subsets: ["latin"], weight: ["400", "700", "900"], display: "swap" });

export const metadata: Metadata = {
  title: "선물상자 · 교사 개발자의 날",
  description: "댓글로 함께해 주셔서 고마워요! 내 닉네임으로 만든 캐릭터를 찾아보세요.",
};

export const viewport: Viewport = { themeColor: "#0A0D0C", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={`${body.variable} h-full antialiased`}>
      <body className="bg-circuit flex min-h-full flex-col">{children}</body>
    </html>
  );
}
