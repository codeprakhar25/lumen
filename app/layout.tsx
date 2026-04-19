import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lumen — Fundraising intelligence",
  description: "Paste your company URL. Get the VCs most likely to fund you, with partner-level recommendations and live thesis signals.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
