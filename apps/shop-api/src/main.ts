import { createApp } from "./app.ts"

const { app, config } = createApp()

Bun.serve({ port: config.port, fetch: app.fetch })
console.log(`shop-api listening on ${config.apiOrigin}`)
