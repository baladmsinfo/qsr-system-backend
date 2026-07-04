const {
    getSubscriptionPlans
} = require("../services/subscription.service");

const SUBSCRIPTION_BASE_URL = process.env.SUBSCRIPTION_BASE_URL || "http://localhost:3002";
const SUBSCRIPTION_KEY = process.env.SUBSCRIPTION_APIKEY;
const SUBS_PRODUCT_ID = process.env.SUBS_PRODUCT_ID;

module.exports = async function (fastify) {
    fastify.get("/subscriptions/plans", async (req, res) => {
        try {
            const response = await getSubscriptionPlans(
                fastify,
                SUBS_PRODUCT_ID,
                SUBSCRIPTION_BASE_URL,
                SUBSCRIPTION_KEY
            );

            return res.send(response);
        } catch (err) {
            console.error(err);
            return res.code(500).send({
                statusCode: "02",
                message: "Failed to fetch subscription plans",
                error: err.message,
            });
        }
    });
};
