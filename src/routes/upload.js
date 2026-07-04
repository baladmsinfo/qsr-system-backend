// routes/upload.js
const checkRole = require('../utils/checkRole')

async function uploadRoute(fastify) {
  fastify.post("/upload", {
    preHandler: checkRole("SUPERADMIN", "BRANCHADMIN"),
  }, async (req, reply) => {
    if (!req.isMultipart()) {
      return reply.code(415).send({ error: "Unsupported Media Type" });
    }

    const fields = {};
    let filePart = null;

    const parts = req.parts();

    for await (const part of parts) {
      if (!part.file) {
        fields[part.fieldname] = await part.value;
        continue;
      }

      if (filePart) {
        return reply.code(400).send({ error: "Only one file allowed" });
      }

      if (part.file.truncated) {
        return reply.code(413).send({ error: "File too large" });
      }

      // Read file buffer
      const chunks = [];
      for await (const chunk of part.file) chunks.push(chunk);

      const buffer = Buffer.concat(chunks);

      filePart = {
        filename: part.filename,
        mimetype: part.mimetype || "application/octet-stream", // fallback for ANY type
        size: buffer.length,
        file: buffer,
      };
    }

    if (!filePart) {
      return reply.code(400).send({ error: "No file uploaded" });
    }

    try {
      // Filename override support
      const customFilename = fields.filename || filePart.filename;

      // -----------------------------------------------------
      // Upload to Spaces
      // -----------------------------------------------------
      const uploadedArr = await fastify.uploadToSpaces({
        files: [
          {
            ...filePart,
            filename: customFilename, // apply custom override
          },
        ],
      });

      const uploaded = uploadedArr[0]; // only one file

      // -----------------------------------------------------
      // Save in Prisma Images table
      // -----------------------------------------------------
      const saved = await fastify.prisma.images.create({
        data: {
          url: uploaded.url,
          key: uploaded.key,
          filename: uploaded.filename,
          mimetype: uploaded.type,
          size: uploaded.size,
          docid: fields.docid ? Number(fields.docid) : null,
        },
      });

      return {
        statusCode: "00",
        message: "Uploaded & Saved",
        data: saved,
      };
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: err.message });
    }
  });
}

module.exports = uploadRoute;
