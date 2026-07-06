import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The TypeScript check during `next build` needs >2 GB of heap, which OOMs on
  // small VPS instances. Types are checked during development instead — the
  // production build only compiles.
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
