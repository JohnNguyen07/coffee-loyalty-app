import type { Metadata } from "next";
import { Be_Vietnam_Pro, Lora, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const beVietnamPro = Be_Vietnam_Pro({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-be-vietnam-pro",
  display: "swap",
});

const lora = Lora({
  subsets: ["latin", "vietnamese"],
  weight: ["500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-lora",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin", "vietnamese"],
  weight: ["500", "600"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
  title: "Ủ LAB - Matcha & Cold Brew",
  description: "Ủ LAB - Đặt hàng Matcha & Cold Brew take-away. Tích điểm thưởng theo hạng thành viên.",
  keywords: ["Ủ LAB", "coffee", "matcha", "cold brew", "take-away", "tích điểm", "cà phê ủ"],
  openGraph: {
    title: "Ủ LAB - Matcha & Cold Brew",
    description: "Ủ LAB - Đặt hàng Matcha & Cold Brew take-away. Tích điểm thưởng theo hạng thành viên.",
    type: "website",
    images: [{ url: "/logo.png", width: 1024, height: 1024, alt: "Ủ LAB Logo" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" data-scroll-behavior="smooth">
      <body className={`${beVietnamPro.variable} ${lora.variable} ${jetbrainsMono.variable}`}>
        {children}
      </body>
    </html>
  );
}

