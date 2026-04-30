/** @type {import('next').NextConfig} */
const nextConfig = {
  // googleapis uses Node.js modules not available in the Edge runtime;
  // keep API routes on the Node runtime.
  experimental: {
    serverComponentsExternalPackages: ['googleapis'],
  },
  async redirects() {
    return [
      { source: '/', missing: [{ type: 'query', key: 'demo', value: '1' }], destination: '/landing', permanent: false },
    ]
  },
}

module.exports = nextConfig
