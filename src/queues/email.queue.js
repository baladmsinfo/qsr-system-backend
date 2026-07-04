// queues/email.queue.js
const { Queue } = require("bullmq");
const connection = require("../config/redisConfig");

//const connection = { host: 'localhost', port: 6379, password: process.env.REDIS_PASS };

const emailQueue = new Queue("email", { connection });


module.exports = { emailQueue };
