// Real raw-TCP ESC/POS printing (port 9100 - the de facto standard "raw
// JetDirect" port nearly every network thermal printer listens on). This is
// the only PrinterDriver implementation that can genuinely run server-side:
// USB/Bluetooth/WebUSB/WebSerial connection types require a physical handle
// held by whatever device is plugged into the printer (a browser tab or the
// Capacitor app), which this backend can never have - see printWorker.js for
// how those types are routed instead.
const net = require("net");

/**
 * @param {{ip: string, port?: number}} connectionConfig
 * @param {Buffer} payload
 * @returns {Promise<void>}
 */
function printToNetwork(connectionConfig, payload) {
  return new Promise((resolve, reject) => {
    const { ip, port = 9100 } = connectionConfig || {};
    if (!ip) return reject(new Error("Network printer connectionConfig.ip is required"));

    const socket = new net.Socket();
    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error(`Timed out connecting to printer at ${ip}:${port}`));
    }, 8000);

    socket.connect(port, ip, () => {
      socket.write(payload, (err) => {
        clearTimeout(timeout);
        if (err) {
          socket.destroy();
          return reject(err);
        }
        socket.end();
      });
    });

    socket.on("close", () => resolve());
    socket.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

module.exports = { printToNetwork };
