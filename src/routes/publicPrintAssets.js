// QR/barcode PNG rendering for receipt HTML - registered under
// /api/public/print (see server.js) so it lands inside the existing
// hardcoded "/api/public/" exemption in the global auth preHandler. Genuinely
// needs to be unauthenticated: htmlRenderer.js embeds these via plain
// <img src="..."> tags, which cannot carry an Authorization header. No
// sensitive data is exposed - `data` is the same QR/barcode payload string
// already visible in the surrounding receipt HTML.
const QRCode = require("qrcode");
const bwipjs = require("bwip-js");

async function publicPrintAssetRoutes(fastify) {
  fastify.get("/qr.png", async (request, reply) => {
    try {
      const data = request.query?.data;
      if (!data) return reply.code(400).send({ statusCode: "01", message: "data is required" });
      const buffer = await QRCode.toBuffer(data, { width: 240, margin: 1 });
      reply.type("image/png");
      return reply.send(buffer);
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ statusCode: "99", message: "Failed to render QR code", error: err.message });
    }
  });

  fastify.get("/barcode.png", async (request, reply) => {
    try {
      const data = request.query?.data;
      if (!data) return reply.code(400).send({ statusCode: "01", message: "data is required" });
      const buffer = await bwipjs.toBuffer({ bcid: "code128", text: data, scale: 2, height: 12, includetext: true, textxalign: "center" });
      reply.type("image/png");
      return reply.send(buffer);
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ statusCode: "99", message: "Failed to render barcode", error: err.message });
    }
  });
}

module.exports = publicPrintAssetRoutes;
