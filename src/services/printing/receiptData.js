// Builds the canonical "receipt data" JSON a ReceiptTemplate's layoutJson is
// rendered against - the top half of the Receipt JSON -> Template JSON ->
// Renderer pipeline. Renderers (escposRenderer.js/htmlRenderer.js) are pure
// functions of (receiptData, layoutJson); this is the only place that reads
// from Prisma, so adding a new output format never means touching Order
// queries again.
//
// Tax breakdown is grouped by the actual TaxRate.type values this schema
// has today (GST/IGST/SGST/CGST/VAT - see schema.prisma) - there is no CESS
// TaxType yet, so a template's CESS block will simply find nothing to bind
// to until that's added; this reflects a real schema gap, not a renderer
// bug.
async function buildReceiptData(prisma, orderId) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      company: true,
      branch: true,
      customer: true,
      table: true,
      cashier: true,
      waiter: true,
      orderItems: { include: { menuItem: true, taxRate: true } },
      payments: true,
    },
  });
  if (!order) throw new Error(`Order ${orderId} not found`);

  const items = order.orderItems.map((oi) => ({
    id: oi.id,
    name: oi.menuItem?.name || "Item",
    quantity: oi.quantity,
    price: oi.price,
    total: oi.total,
    remarks: oi.remarks || null,
    taxRateName: oi.taxRate?.name || null,
    taxType: oi.taxRate?.type || null,
  }));

  // { GST: 42.5, IGST: 0, ... } - only types actually present on this
  // order's items, keyed exactly as TaxType so a template block named
  // "CGST"/"SGST"/"IGST" binds directly without translation.
  //
  // oi.total is the pre-tax line total (quantity * price - it sums to
  // Order.subtotal, verified against real order data), not tax-inclusive -
  // an earlier version of this back-calculated tax by treating oi.total as
  // tax-inclusive and extracting an implied portion, which silently
  // under-counted tax on every order (caught by comparing this function's
  // output against the real, authoritative Order.taxAmount field on a live
  // order: computed 8.81 vs the real 9.25).
  const taxBreakdown = {};
  for (const oi of order.orderItems) {
    if (!oi.taxRate) continue;
    const taxAmount = oi.total * (oi.taxRate.rate / 100);
    taxBreakdown[oi.taxRate.type] = (taxBreakdown[oi.taxRate.type] || 0) + taxAmount;
  }

  const lastPayment = order.payments[order.payments.length - 1] || null;
  const roundOff = Math.round(order.totalAmount) - order.totalAmount;

  return {
    order: {
      id: order.id,
      kotNumber: order.kotNumber,
      orderType: order.orderType,
      status: order.status,
      source: order.source,
      notes: order.notes,
      createdAt: order.createdAt,
    },
    company: order.company && {
      name: order.company.name,
      gstNumber: order.company.gstNumber,
      addressLine1: order.company.addressLine1,
      addressLine2: order.company.addressLine2,
      city: order.company.city,
      state: order.company.state,
      pincode: order.company.pincode,
      phone: order.company.primaryPhoneNo,
      logoUrlShort: order.company.logoUrlShort,
    },
    branch: order.branch && {
      name: order.branch.name,
      addressLine1: order.branch.addressLine1,
      addressLine2: order.branch.addressLine2,
      city: order.branch.city,
      gstNumber: order.branch.gstNumber,
      phone: order.branch.phone,
    },
    table: order.table && { tableNo: order.table.tableNo },
    customer: order.customer && { name: order.customer.name, phone: order.customer.phone },
    cashier: order.cashier && { name: order.cashier.name },
    waiter: order.waiter && { name: order.waiter.name },
    items,
    totals: {
      subtotal: order.subtotal,
      discount: order.discount,
      taxAmount: order.taxAmount,
      roundOff,
      grandTotal: order.totalAmount,
    },
    taxBreakdown,
    payment: lastPayment && {
      method: lastPayment.method,
      amount: lastPayment.amount,
      referenceNo: lastPayment.referenceNo,
      date: lastPayment.date,
    },
  };
}

module.exports = { buildReceiptData };
