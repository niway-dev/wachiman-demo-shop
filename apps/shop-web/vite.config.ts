import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const apiOrigin = process.env.API_ORIGIN ?? "http://localhost:3001"

export default defineConfig({
  server: {
    port: 3000,
    // The browser only ever talks to the web origin. The dev server forwards
    // the api and auth paths, so session cookies are same-origin.
    proxy: {
      "/rpc": apiOrigin,
      "/api": apiOrigin,
    },
  },
  plugins: [tanstackStart(), react()],
})
