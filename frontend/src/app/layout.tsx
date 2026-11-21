import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Nav from "@/components/Nav";
import MobileTabBar from "@/components/MobileTabBar";
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
  title: "Trimly — Book barbers & salons",
  description: "Guaranteed slots at verified barbers, salons and beauty parlours near you.",
  // Home Screen icon + standalone mode on iPhone (needed there for web push).
  icons: { icon: "/icon-192.png", apple: "/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Trimly", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ea580c",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      // A browser extension (seen so far: one injecting `crxemulator`/
      // `crxemulator-bridged` attributes) can add attributes to <html>
      // before React hydrates, which React then reports as a hydration
      // mismatch even though nothing in this app caused it. This only
      // suppresses the warning for attribute diffs on this exact element.
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <Nav />
        <main className="flex flex-1 flex-col pb-20 sm:pb-0">{children}</main>
        <MobileTabBar />
      </body>
    </html>
  );
}
