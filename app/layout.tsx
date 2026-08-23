import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Remoru",
  description: "日常のちょっとしたことをメモして、あとから思い出す",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
