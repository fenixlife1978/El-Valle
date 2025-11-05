
const nextConfig = {
  experimental: {
    serverActions: {},
    allowedDevOrigins: [
      process.env.DEV_ORIGIN ||
      'https://3000-firebase-studio-1755127519376.cluster-joak5ukfbnbyqspg4tewa33d24.cloudworkstations.dev'
    ]
  }
} as const;

export default nextConfig;