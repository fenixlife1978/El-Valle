
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {},
    allowedDevOrigins: process.env.DEV_ORIGIN ? [process.env.DEV_ORIGIN] : [],
  },
};

export default nextConfig;
