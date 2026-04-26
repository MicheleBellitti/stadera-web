import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	/**
	 * `standalone` emits a self-contained `.next/standalone/server.js` with
	 * only the runtime-required `node_modules`, ~4× smaller than the full
	 * `.next` directory. Required for the Cloud Run Dockerfile which
	 * `COPY --from=builder /app/.next/standalone ./` and runs
	 * `node server.js` directly — no `pnpm`, no dev deps, no source.
	 */
	output: "standalone",
};

export default nextConfig;
