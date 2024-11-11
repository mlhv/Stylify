import app from './app';

const server = Bun.serve({
    fetch: app.fetch,
    port: process.env.PORT || 3000,
})

console.log("server running", server.port);