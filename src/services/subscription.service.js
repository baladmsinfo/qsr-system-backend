const axios = require("axios");

async function initiateSubscriptionPayment(
  fastify,
  { planId, institutionId, totalPaying,statusUrl }
) {
  if (!planId || !institutionId || !totalPaying)
    throw new Error("Missing required payment parameters");

  const Institution = await fastify.prisma.institution.findUnique({
    where: { id: institutionId },
    include: { terminals: true },
  });

  if (!Institution) throw new Error("Institution not found");
  if (!Institution.primary_mobile_no)
    throw new Error("Institution mobile number missing");

  const merchantPayload = {
    //mid: terminal.mid,
    //tid: terminal.tid,
    amount: totalPaying.toString(),
    description: `Subscription Payment #${planId}`,
    customerName: Institution.name,
    emailId: Institution.primary_email_id,
    mobileNumber: Institution.primary_mobile_no.toString(),
    planId: planId.toString(),
    orderId: planId.toString(),
    statusUrl
  };
  fastify.log.info("Payload sent to merchant server:", merchantPayload);
  try {
    let response = await fastify.initiate(merchantPayload);
    console.log(response);
    return {
      statusCode: "00",
      message: "successfully initiated",
      data: response,
    };
  } catch (err) {
    return {
      statusCode: "02",
      message: "Failed to initiate subscription payment",
      error: err.message,
    };
  }
}

async function updateMandate(fastify, payload) {
  try {
    let response = await fastify.updateMandate(payload);
    return response;
  } catch (err) {
    console.log("Merchant call error:", {
      message: err.message,
      code: err.code,
      statusCode: err.response?.status,
      data: err.response?.data,
    });
    return {
      statusCode: "02",
      message: "Failed to Merchant call",
      error: err.message,
    };
  }
}

async function getSubscriptionPlans(fastify, FEE_PRODUCT_ID, baseURL, apiKey, config = {}) {
  try {
    console.log(`Fetching subscription plans for product: ${FEE_PRODUCT_ID}`);

    const plans = await fastify.getPlan(FEE_PRODUCT_ID, baseURL, apiKey, config);

    return {
      statusCode: "00",
      message: "Plans fetched successfully",
      plans,
    };
  } catch (err) {
    return {
      statusCode: "02",
      message: "Failed to fetch subscription plans",
      error: err.message,
    };
  }
}

module.exports = { initiateSubscriptionPayment, updateMandate, getSubscriptionPlans };
