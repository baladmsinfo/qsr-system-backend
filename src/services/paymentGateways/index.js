// Registry mapping a PaymentGatewayProvider to its adapter module - adding a
// further gateway means adding one file here + one enum value in
// schema.prisma, not touching any of the checkout-flow routes. Every adapter
// implements the same three-function shape: createOrder(...), and async
// verifyPaymentSignature/verifyWebhookSignature returning { valid,
// gatewayPaymentId? } / boolean respectively - see razorpay.js for the
// fullest documented example of the contract.
const razorpay = require("./razorpay");
const cashfree = require("./cashfree");
const worldline = require("./worldline");

const ADAPTERS = {
  RAZORPAY: razorpay,
  CASHFREE: cashfree,
  WORLDLINE: worldline,
};

function getAdapter(provider) {
  const adapter = ADAPTERS[provider];
  if (!adapter) throw new Error(`No payment gateway adapter registered for provider: ${provider}`);
  return adapter;
}

// The one gateway a company has marked active - checkout always uses this
// one; a company may have several configs stored (see routes/paymentGateways.js)
// but exactly one is ever active, matching how a real merchant picks one
// primary payment processor rather than offering several simultaneously.
async function getActiveGatewayConfig(prisma, companyId) {
  return prisma.paymentGatewayConfig.findFirst({ where: { companyId, isActive: true } });
}

module.exports = { getAdapter, getActiveGatewayConfig };
