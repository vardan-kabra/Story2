/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep sql.js external so its WASM binary loads from node_modules at runtime
  // in the Node.js server environment (it is not bundled).
  serverExternalPackages: ["sql.js"],
};

export default nextConfig;
