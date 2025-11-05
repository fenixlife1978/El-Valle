
const nextConfig = {
  experimental: {
    serverActions: {},
    allowedDevOrigins: [
      process.env.DEV_ORIGIN || ''
    ].filter(Boolean)
  }
} as const;

export default nextConfig;
