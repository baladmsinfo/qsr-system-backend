// queues/print.queue.js - offline/retry queue for NETWORK printers only.
// USB/Bluetooth/WebUSB/WebSerial print jobs never touch this queue: only
// the client device holds the actual hardware handle, so their offline/
// retry queue has to live client-side (browser IndexedDB / Capacitor local
// storage) - see modules/pos-printer/services in the frontend. This queue
// exists because a NETWORK printer is the one type this backend can reach
// directly (any IP on the restaurant's LAN/VPN), so it's also the one type
// worth retrying server-side when the printer is briefly unreachable.
const { Queue } = require("bullmq");
const connection = require("../config/redisConfig");

const printQueue = new Queue("print", { connection });

module.exports = { printQueue };
