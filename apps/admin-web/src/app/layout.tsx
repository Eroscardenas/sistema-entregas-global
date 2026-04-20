import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Global Ice de México – Sistema de Entregas",
    template: "%s | Global Ice de México",
  },
  description:
    "Panel administrativo del Sistema de Entregas de Global Ice de México.",
  icons: {
    icon: [
      { url: "/global_ice.png", type: "image/png" },
    ],
    shortcut: ["/global_ice.png"],
    apple: ["/global_ice.png"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-neutral-950 text-neutral-100`}
      >
        {children}
      </body>
    </html>
  );
}