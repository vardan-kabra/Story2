import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ask HR — Pilot",
  description:
    "Prototype AI HR assistant that answers natural-language queries via safe, predefined query functions.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
