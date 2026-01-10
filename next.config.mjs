/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: [
        "3000-firebase-studio-1755127519376.cluster-joak5ukfbnbyqspg4tewa33d24.cloudworkstations.dev"
      ],
    },
  },
};

export default nextConfig;
