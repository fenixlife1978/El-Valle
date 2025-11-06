
const nextConfig = {
  experimental: {
    serverActions: {},
    allowedDevOrigins: process.env.DEV_ORIGIN ? [process.env.DEV_ORIGIN] : [],
  },
} as const;

export default nextConfig;
