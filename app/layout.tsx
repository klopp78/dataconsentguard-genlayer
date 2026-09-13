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
  metadataBase: new URL("https://dataconsentguard-genlayer.galaxthoo.chatgpt.site"),
  title: "DataConsentGuard for GenLayer",
  description:
    "A GenLayer-powered data consent workflow that grants AI-agent access only after consensus-reviewed evidence.",
  openGraph: {
    title: "DataConsentGuard for GenLayer",
    description:
      "Consensus-reviewed consent evidence and bounded AI-agent data access.",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "DataConsentGuard for GenLayer social preview",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "DataConsentGuard for GenLayer",
    description:
      "Consensus-reviewed consent evidence and bounded AI-agent data access.",
    images: ["/og.png"],
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
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
