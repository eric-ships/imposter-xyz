import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { ThemeProvider, themeBootScript } from "@/lib/theme";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  axes: ["opsz"],
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Upper · party games for the squad",
  description:
    "Short, social games for friends — Imposter, Wavelength, Just One. Play together in a shared room from your phone.",
  metadataBase: new URL("https://upper.games"),
  openGraph: {
    title: "Upper",
    description: "Short, social games for the squad.",
    url: "https://upper.games",
    siteName: "Upper",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Upper",
    description: "Short, social games for the squad.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${fraunces.variable} ${inter.variable}`}>
      <head>
        {/* Runs before paint to set data-theme on <html>, eliminating
            the flash of light theme on first load. */}
        <Script
          id="theme-boot"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: themeBootScript }}
        />
      </head>
      <body className="min-h-screen bg-page text-ink antialiased">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
