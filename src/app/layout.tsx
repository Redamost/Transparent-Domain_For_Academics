import type { Metadata } from "next";
import { Geist, Geist_Mono, Noto_Serif_SC, Zhi_Mang_Xing, Playfair_Display } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const notoSerifSC = Noto_Serif_SC({
  variable: "--font-noto-serif-sc",
  subsets: ["latin"],
  weight: ["200", "300", "400", "600", "700", "900"],
});

const zhiMangXing = Zhi_Mang_Xing({
  variable: "--font-zhi-mang-xing",
  subsets: ["latin"],
  weight: ["400"],
});

const playfairDisplay = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "九天科技解构 - Jiutian Tech Deconstruction",
  description: "科研透明度平台 — 展示科研领域影响力人物，推动学术透明度",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      className={`${geistSans.variable} ${geistMono.variable} ${notoSerifSC.variable} ${zhiMangXing.variable} ${playfairDisplay.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
      </body>
    </html>
  );
}
