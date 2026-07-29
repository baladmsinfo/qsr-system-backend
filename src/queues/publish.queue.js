// queues/publish.queue.js
const { Queue } = require("bullmq");
const connection = require("../config/redisConfig");

const publishQueue = new Queue("publish", { connection });

module.exports = { publishQueue };
