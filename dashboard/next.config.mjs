/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone output keeps the production image small.
  output: "standalone",
  experimental: {
    // Server Actions must be allowed from the public dashboard host. The
    // quick-tunnel hostname changes on every restart, hence the wildcard.
    serverActions: {
      allowedOrigins: ["localhost:3001", "*.trycloudflare.com"],
    },
  },
};

export default nextConfig;
