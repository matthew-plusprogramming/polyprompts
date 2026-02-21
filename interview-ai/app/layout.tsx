import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PREP – AI Interview Practice",
  description: "AI-powered interview practice with automatic video clipping",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
