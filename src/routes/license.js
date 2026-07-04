
module.exports = async function (fastify, opts) {

    fastify.post("/licenses/activate", async (req, reply) => {
        const { licenseKey, deviceId } = req.body;

        const license = await fastify.prisma.license.findUnique({
            where: { licenseKey },
        });

        if (!license) {
            return reply.code(404).send({ message: "Invalid license" });
        }

        if (license.status !== "ACTIVE") {
            return reply.code(403).send({ message: "License not active" });
        }

        if (license.deviceId && license.deviceId !== deviceId) {
            return reply.code(403).send({ message: "License already bound" });
        }

        await fastify.prisma.license.update({
            where: { licenseKey },
            data: {
                deviceId,
                activatedAt: new Date(),
            },
        });

        return { success: true };
    });

    fastify.post("/licenses/validate", async (req, reply) => {
        const { licenseKey, deviceId } = req.body;

        const license = await fastify.prisma.license.findUnique({
            where: { licenseKey },
            include: { product: true },
        });

        if (!license) {
            return reply.code(401).send({ valid: false });
        }

        if (license.status !== "ACTIVE") {
            return reply.code(403).send({ valid: false, reason: "Status invalid" });
        }

        if (license.expiresAt && license.expiresAt < new Date()) {
            return reply.code(403).send({ valid: false, reason: "Expired" });
        }

        if (license.deviceId && license.deviceId !== deviceId) {
            return reply.code(403).send({ valid: false, reason: "Device mismatch" });
        }

        return {
            valid: true,
            product: license.product.code,
            expiresAt: license.expiresAt,
        };
    });
    fastify.post("/license/refresh-token", async (req, reply) => {
        
        const payload = fastify.jwt.verify(req.body.token);

        const license = await fastify.prisma.license.findUnique({
            where: { companyId: payload.cid },
        });

        if (!license) throw new Error();

        // Always return ONE license
    });

}