/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // Ensure server-side code can use native modules in Electron
  experimental: {
    serverComponentsExternalPackages: ['bcrypt', 'serialport'],
  },
};

export default nextConfig;
