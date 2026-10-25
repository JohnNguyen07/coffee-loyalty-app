import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin - Ủ LAB",
  description: "Quản trị Ủ LAB: POS, đơn hàng, khách hàng",
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
