
import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    'https://3003-firebase-studio-1755127519376.cluster-joak5ukfbnbyqspg4tewa33d24.cloudworkstations.dev'
  ],
  experimental: {
    serverActions: {},
  },
};

export default nextConfig
