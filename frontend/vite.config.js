// vite.config.js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0", // necesario para Docker
    port: parseInt(process.env.FRONTEND_PORT || "5173"),
  },
  // @ricky0123/vad-web uses dynamic ONNX imports — must be excluded from pre-bundling
  optimizeDeps: {
    exclude: ["@ricky0123/vad-web"],
  },
  assetsInclude: ["**/*.onnx"],
});
