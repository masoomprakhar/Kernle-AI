import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

/* Haas / Haas Groot Disp unavailable — Inter is the documented open-source substitute */
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-haas",
  weight: ["400", "500", "600"],
});

const interDisplay = Inter({
  subsets: ["latin"],
  variable: "--font-haas-display",
  weight: ["400", "500"],
});

const interPricing = Inter({
  subsets: ["latin"],
  variable: "--font-inter-display",
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Kernle AI — Product Information Management",
  description:
    "Enrich, govern, and syndicate product data with an editorial-grade PIM workspace.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover" as const,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${interDisplay.variable} ${interPricing.variable} font-sans`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
