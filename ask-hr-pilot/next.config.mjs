/** @type {import('next').NextConfig} */
const nextConfig = {
  // better-sqlite3 is a native module — keep it out of the bundler so it loads
  // from node_modules at runtime in the Node.js server environment.
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
