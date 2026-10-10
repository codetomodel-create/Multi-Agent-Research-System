import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  // Pin the workspace root: without it Turbopack walks up the tree and can pick
  // an unrelated lockfile outside the repository, making builds machine-dependent.
  turbopack: {
    root: __dirname,
  },
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
