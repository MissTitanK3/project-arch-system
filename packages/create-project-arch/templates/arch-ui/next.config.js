import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(appDir, "../../..");

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    cpus: 4,
  },
  turbopack: {
    root: projectRoot,
  },
};

export default nextConfig;
