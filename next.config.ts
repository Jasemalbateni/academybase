import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Tree-shake large packages so only the components actually imported are
    // bundled. Recharts ships ~420 KB; with this enabled Next.js uses its
    // named-export ESM build, keeping only what each page uses.
    optimizePackageImports: ["recharts"],
  },
};

export default nextConfig;
