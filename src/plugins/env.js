const fp = require("fastify-plugin");
const fastifyEnv = require("@fastify/env");
const path = require("path");

const schema = {
  type: "object",
  required: [
    "PORT",
    "HOST",
    "NODE_ENV",
    "DATABASE_URL",
    "JWT_SECRET",
    "DO_SPACE_KEY",
    "DO_SPACE_SECRET",
    "DO_SPACE_ENDPOINT",
    "DO_SPACE_REGION",
    "DO_SPACE_BUCKET",
    "REDIS_HOST",
    "REDIS_PORT",
    "REDIS_PASSWORD",
    "allowedOrigins"
  ],
  properties: {
    PORT: { type: "string", default: "3000" },
    HOST: { type: "string", default: "127.0.0.1" },
    NODE_ENV: { type: "string", default: "development" },
    DATABASE_URL: { type: "string" },
    JWT_SECRET: { type: "string" },
    DO_SPACE_KEY: { type: "string" },
    DO_SPACE_SECRET: { type: "string" },
    DO_SPACE_ENDPOINT: { type: "string" },
    DO_SPACE_REGION: { type: "string" },
    DO_SPACE_BUCKET: { type: "string" },
    REDIS_HOST: { type: "string" },
    REDIS_PORT: { type: "string" },
    REDIS_PASSWORD: { type: "string" },
    SUBSCRIPTION_BASE_URL: { type: "string" },
    SUBSCRIPTION_APIKEY: { type: "string" },
    allowedOrigins: {
      type: "string",
      default: "[\"http://localhost:3000\",\"http://127.0.0.1:3000\"]"
    }
  }
};

module.exports = fp(async function (fastify, opts) {
  // Only load .env.development locally, in prod rely on Coolify envs
  const envFile = process.env.NODE_ENV === "production" ? path.join(process.cwd(), ".env.production") : path.join(process.cwd(), ".env.development");
  console.log("ENV Settings",envFile)

  await fastify.register(fastifyEnv, {
    confKey: "config",
    schema,
    dotenv: envFile ? { path: envFile } : false,
    data: process.env,
  });

  // ✅ Parse allowedOrigins (supports JSON or CSV)
  try {
    const raw = fastify.config.allowedOrigins.trim();

    if (raw.startsWith("[")) {
      // JSON array format
      fastify.config.allowedOrigins = JSON.parse(raw);
    } else {
      // Comma-separated format
      fastify.config.allowedOrigins = raw
        .split(",")
        .map(o => o.trim())
        .filter(Boolean);
    }
  } catch (e) {
    fastify.log.warn("⚠️ allowedOrigins is not valid, falling back to []");
    fastify.config.allowedOrigins = [];
  }

  fastify.log.info(`✅ Allowed origins: ${fastify.config.allowedOrigins.join(", ")}`);
});
