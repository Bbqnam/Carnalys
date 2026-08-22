import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Listing photos are resized by Blocket's own CDN rather than Vercel's
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
