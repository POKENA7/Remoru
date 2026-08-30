import type { NextConfig } from "next";

const nextConfig: NextConfig = {};

export default nextConfig;

// D1 などの Cloudflare バインディングを `next dev` からも参照できるようにする
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

initOpenNextCloudflareForDev();
