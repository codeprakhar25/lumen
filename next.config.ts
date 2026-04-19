import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "lightningcss",
    "@tailwindcss/node",
    "@tailwindcss/postcss",
  ],
};

export default nextConfig;
