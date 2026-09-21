import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Zombie Distance Run",
  description: "前方のゾンビや障害物を避けて走った距離を競う、日次ランニングゲーム。",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="antialiased">{children}</body>
    </html>
  );
}
