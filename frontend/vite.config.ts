import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// The API base URL comes from VITE_API_URL (see src/api/client.ts), defaulting to http://localhost:8000.
// The backend enables CORS for all origins, so no dev proxy is needed.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
  },
});
