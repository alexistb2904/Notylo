import { createApp } from "./app.js";

const app = await createApp();
await app.listen({ port: Number(process.env.PORT ?? 3001), host: process.env.HOST ?? "0.0.0.0" });
