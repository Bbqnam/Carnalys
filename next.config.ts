import { networkInterfaces } from "node:os";
import type { NextConfig } from "next";

// The dev server blocks cross-origin requests to its internal assets, so
// opening it from a phone or tablet by LAN address (see `npm run dev:lan`)
// makes every /_next/* chunk 403: the page server-renders but React never
// hydrates, and nothing is clickable. Allowing this machine's own LAN
// addresses fixes that; they're detected at startup so a new DHCP lease
// doesn't silently break it again. Development-only — Next ignores this in
// production builds.
function localNetworkOrigins() {
  return Object.values(networkInterfaces())
    .flat()
    .filter((address) => address && address.family === "IPv4" && !address.internal)
    .map((address) => address!.address);
}

const nextConfig: NextConfig = {
  allowedDevOrigins: localNetworkOrigins(),
  images: {
    // Listing photos are resized by their source CDN rather than Vercel's
    // Image Optimization — see the loader for why. `remotePatterns` is kept
    // so the URLs stay allow-listed if the loader is ever removed.
    loader: "custom",
    loaderFile: "./src/infrastructure/images/blocket-image-loader.ts",
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.blocketcdn.se",
        pathname: "/dynamic/**",
      },
      {
        protocol: "https",
        hostname: "vl.imgix.net",
        pathname: "/img/**",
      },
      {
        protocol: "https",
        hostname: "cdn.wayke.se",
        pathname: "/cfit/**",
      },
      {
        protocol: "https",
        hostname: "commons.wikimedia.org",
        pathname: "/wiki/Special:Redirect/file/**",
      },
      {
        protocol: "https",
        hostname: "upload.wikimedia.org",
        pathname: "/wikipedia/**",
      },
    ],
  },
};

export default nextConfig;
