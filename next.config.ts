import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
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
