import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ủ LAB - Matcha & Cold Brew",
  description: "Ủ LAB - Đặt hàng Matcha & Cold Brew take-away. Tích điểm hoàn tiền theo hạng thành viên.",
  keywords: ["Ủ LAB", "coffee", "matcha", "cold brew", "take-away", "tích điểm", "cà phê ủ"],
  openGraph: {
    title: "Ủ LAB - Matcha & Cold Brew",
    description: "Ủ LAB - Đặt hàng Matcha & Cold Brew take-away. Tích điểm hoàn tiền theo hạng thành viên.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" data-scroll-behavior="smooth">
      <body>
        {children}
      </body>
    </html>
  );
}
