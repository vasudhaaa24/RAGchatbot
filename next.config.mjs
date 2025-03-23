/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Use the correct format for externals
      if (!config.externals) {
        config.externals = [];
      }
      
      // Add to the externals array if it's an array
      if (Array.isArray(config.externals)) {
        config.externals.push('onnxruntime-node');
      } else {
        // If externals is an object or function, create a new array
        const prevExternals = config.externals;
        config.externals = [prevExternals, 'onnxruntime-node'];
      }
    }
    return config;
  },
};

export default nextConfig;