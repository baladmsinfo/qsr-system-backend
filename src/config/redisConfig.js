require("dotenv").config();

const connection = {
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: Number(process.env.REDIS_PORT) || 6379,
  username: process.env.REDIS_USERNAME || undefined, // optional
  password: process.env.REDIS_PASSWORD || undefined, // optional
  db: Number(process.env.REDIS_DB) || 0,
};

console.log("Redis config:", connection);

module.exports = connection;
