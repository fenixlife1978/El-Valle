
import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      enabled: true,
    }
  }
}

export default nextConfig
