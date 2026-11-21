import type { NextConfig } from "next";

// Baseline browser security headers for every page.
const securityHeaders = [
  // Don't let other sites embed Trimly in a frame (clickjacking).
  { key: "X-Frame-Options", value: "DENY" },
  // Don't let browsers guess content types (MIME sniffing).
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Send only the origin to other sites, never full URLs (which can carry ids).
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // HTTPS only, for a year.
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  // Device features: only Trimly itself may use the mic (in-app calls),
  // camera (Style Finder selfie) and location (Near me / salon location).
  { key: "Permissions-Policy", value: "microphone=(self), camera=(self), geolocation=(self), payment=(), usb=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  experimental: {
    // Dynamic pages (Home, Search, salon pages) were refetched from the
    // server on every tab switch (Next's default is 0s), re-rendering and
    // re-loading their photos each time — a visible flash. Reuse them for
    // a minute on back-and-forth navigation; data still refreshes after that.
    staleTimes: { dynamic: 60 },
  },
};

export default nextConfig;
