
module.exports = async function (fastify) {
    fastify.post("/payment/callback", async (req, reply) => {
        const prisma = fastify.prisma;

        const {
            paymentId,
            orderId,
            status,       // "SUCCESS", "FAILED", "PENDING"
            amount,
            gateway,
            rawResponse
        } = req.body;

        // -----------------------------------------
        // Prevent Double Processing (Idempotency)
        // -----------------------------------------
        const existing = await prisma.payment.findFirst({
            where: { gatewayPaymentId: paymentId }
        });

        if (existing) {
            return reply.send({
                message: "Payment already processed",
                paymentId: existing.id,
                orderId: existing.orderId
            });
        }

        const order = await prisma.order.findUnique({ where: { id: orderId } });
        if (!order) {
            return reply.code(404).send({ error: "Order not found" });
        }

        const payment = await prisma.payment.create({
            data: {
                companyId: order.companyId,
                orderId,
                amount,
                method: gateway,
                gatewayPaymentId: paymentId,
                rawResponse: JSON.stringify(rawResponse || {})
            }
        });

        if (status === "SUCCESS") {
            await prisma.order.update({
                where: { id: orderId },
                data: { status: "COMPLETED" }
            });

            fastify.emitToBranch(order.branchId, 'order:status', { ...order, status: 'COMPLETED' });
            fastify.emitToOrder(order.id, 'order:status', { ...order, status: 'COMPLETED' });

            return reply.send({
                message: "Payment successful and order completed",
                orderId,
                paymentId: payment.id
            });
        }

        return reply.send({
            message: status === "FAILED" ? "Payment failed" : "Payment pending",
            orderId,
            paymentId: payment.id
        });
    });
}
