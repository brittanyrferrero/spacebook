/** @type {import('next').NextConfig} */
const nextConfig = {
  // googleapis uses Node.js modules not available in the Edge runtime;
  // keep API routes on the Node runtime.
  serverExternalPackages: ['googleapis'],
}

module.exports = nextConfig
