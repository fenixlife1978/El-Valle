
import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  serverActions: true,
  experimental: {
    allowedDevOrigins: [
      'https://3000-firebase-studio-1755127519376.cluster-joak5ukfbnbyqspg4tewa33d24.cloudworkstations.dev'
    ]
  }
}

export default nextConfig
