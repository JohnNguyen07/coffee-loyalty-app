import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
  title: "Ủ LAB - Matcha & Cold Brew",
  description: "Ủ LAB - Đặt hàng Matcha & Cold Brew take-away. Tích điểm thưởng theo hạng thành viên.",
  keywords: ["Ủ LAB", "coffee", "matcha", "cold brew", "take-away", "tích điểm", "cà phê ủ"],
  icons: {
    icon: [
      { url: "/favicon-circle.png?v=2", type: "image/png", sizes: "64x64" },
    ],
    shortcut: ["/favicon-circle.png?v=2"],
    apple: ["/favicon-circle.png?v=2"],
  },
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
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800&family=Lora:ital,wght@0,400..700;1,400..700&family=JetBrains+Mono:wght@500;600&display=swap"
        />
      </head>
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
