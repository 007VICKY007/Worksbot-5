import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Debug Assistant",
  description: "Upload Python code → GPT diagnoses bugs and suggests fixes instantly.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
