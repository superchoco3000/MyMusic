import type { Metadata, Viewport } from "next";
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
  title: "Spotify Collab — Collaborative Playlist Sessions",
  description:
    "Build and manage Spotify playlists together in real-time multiplayer sessions.",
  keywords: ["spotify", "playlist", "multiplayer", "real-time", "music"],
};

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} dark h-full`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-background text-white antialiased">
        {children}
      </body>
    </html>
  );
}
