import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  build: { chunkSizeWarningLimit: 800 }, // KaTeX 本身就有约 270 kB
  server: {
    host: true, // 同一 Wi-Fi 下手机也能访问开发服务器
    proxy: { "/api": "http://127.0.0.1:8000" },
  },
});
