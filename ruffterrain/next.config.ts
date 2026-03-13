import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@tensorflow/tfjs", "@tensorflow-models/coco-ssd"],
};

export default nextConfig;
