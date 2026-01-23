import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Design Guardian - Version Control for Design Assets",
  description: "AI-powered version control for SVG assets. Track geometric changes with precision.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className="dark">
      <body className="min-h-screen bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
