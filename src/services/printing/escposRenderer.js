// Composes a real ESC/POS byte buffer from (receiptData, layoutJson) - the
// "Renderer" stage of Receipt JSON -> Template JSON -> Renderer -> ESC/POS
// in the template engine. Deliberately currency-symbol-safe: most cheap
// thermal printers only implement a single-byte codepage with no ₹ glyph,
// so amounts use "Rs." here even though htmlRenderer.js safely uses the
// real ₹ symbol for the same receiptData.
const { EscPosBuilder } = require("./escposCommands");
const { isBlockVisible } = require("./blockVisibility");

function money(n) {
  return `Rs.${Number(n || 0).toFixed(2)}`;
}

function charsPerLineFor(profile) {
  if (profile?.charsPerLine) return profile.charsPerLine;
  return profile?.paperWidthMm === 58 ? 32 : 48;
}

const TAX_LABELS = { CGST: "CGST", SGST: "SGST", IGST: "IGST", GST: "GST", VAT: "VAT" };

/**
 * @param {object} receiptData - see services/printing/receiptData.js
 * @param {object} layoutJson - ReceiptTemplate.layoutJson: { blocks: [{ type, props, visibleIf }] }
 * @param {object} [profile] - PrinterProfile: { paperWidthMm, charsPerLine }
 * @returns {Buffer}
 */
function renderEscPos(receiptData, layoutJson, profile = {}) {
  const cols = charsPerLineFor(profile);
  const b = new EscPosBuilder().init();
  const blocks = layoutJson?.blocks || [];

  for (const block of blocks) {
    // `hidden` is a designer-only "temporarily disable" toggle, distinct
    // from `visibleIf` (data-driven conditional visibility) - both skip
    // the block entirely when true/false.
    if (block.hidden) continue;
    if (!isBlockVisible(block.visibleIf, receiptData)) continue;

    const props = block.props || {};
    if (props.marginTop) b.feed(props.marginTop);
    renderBlock(b, block, receiptData, cols);
    if (props.marginBottom) b.feed(props.marginBottom);
  }

  return b.cut().toBuffer();
}

// bold/fontSize are only honored on freeform text blocks (TEXT/TERMS/
// FOOTER) - structured/tabular blocks (ITEMS_TABLE, TAX, totals, header
// rows) deliberately keep their fixed two-column layout regardless of
// Designer styling, since a real receipt's line items/totals need
// consistent alignment for legibility, not arbitrary per-row styling.
function styledLine(b, props, text, defaultAlign) {
  const align = props.align || defaultAlign;
  const bold = !!props.bold;
  const scale = Math.min(Math.max(props.fontSize || 1, 1), 3);
  b.align(align);
  if (bold) b.bold(true);
  if (scale > 1) b.size(scale, scale);
  b.line(text);
  if (scale > 1) b.size(1, 1);
  if (bold) b.bold(false);
}

function renderBlock(b, block, data, cols) {
  const props = block.props || {};
  switch (block.type) {
    case "LOGO":
      // Raster/bitmap logo printing (GS v 0) needs image decode + dithering
      // to 1-bit - not implemented in this pass; falls back to the merchant
      // name in bold so the block isn't silently blank.
      if (data.company?.name) b.align("center").bold(true).size(2, 2).line(data.company.name).size(1, 1).bold(false);
      break;
    case "MERCHANT_INFO":
      b.align("center").bold(true).line(data.company?.name || "").bold(false);
      if (data.branch?.name && data.branch.name !== data.company?.name) b.line(data.branch.name);
      break;
    case "ADDRESS": {
      const parts = [data.branch?.addressLine1, data.branch?.addressLine2, data.branch?.city].filter(Boolean);
      if (parts.length) b.align("center").line(parts.join(", "));
      if (data.branch?.phone) b.line(`Ph: ${data.branch.phone}`);
      break;
    }
    case "GST": {
      const gst = data.branch?.gstNumber || data.company?.gstNumber;
      if (gst) b.align("center").line(`GSTIN: ${gst}`);
      break;
    }
    case "INVOICE":
      b.align("left").row("Order #", data.order.id.slice(0, 8).toUpperCase(), cols);
      if (data.order.kotNumber) b.row("KOT #", data.order.kotNumber, cols);
      break;
    case "DATE":
      b.align("left").row("Date", new Date(data.order.createdAt).toLocaleString("en-IN"), cols);
      break;
    case "CASHIER":
      if (data.cashier?.name) b.row("Cashier", data.cashier.name, cols);
      break;
    case "CUSTOMER":
      if (data.customer?.name) b.row("Customer", data.customer.name, cols);
      if (data.customer?.phone) b.row("Phone", data.customer.phone, cols);
      if (data.table?.tableNo) b.row("Table", data.table.tableNo, cols);
      break;
    case "ITEMS_TABLE":
      b.rule(cols);
      for (const item of data.items) {
        b.row(`${item.name} x${item.quantity}`, money(item.total), cols);
      }
      b.rule(cols);
      break;
    case "DISCOUNT":
      if (data.totals.discount > 0) b.row("Discount", `-${money(data.totals.discount)}`, cols);
      break;
    case "COUPON":
      if (props.code) b.row("Coupon", props.code, cols);
      break;
    case "TAX":
      for (const [type, amount] of Object.entries(data.taxBreakdown || {})) {
        b.row(TAX_LABELS[type] || type, money(amount), cols);
      }
      break;
    case "SUBTOTAL":
      b.row("Subtotal", money(data.totals.subtotal), cols);
      break;
    case "ROUND_OFF":
      if (Math.abs(data.totals.roundOff) >= 0.01) b.row("Round Off", money(data.totals.roundOff), cols);
      break;
    case "GRAND_TOTAL":
      b.rule(cols).bold(true).size(1, 2).row("TOTAL", money(data.totals.grandTotal), cols).size(1, 1).bold(false).rule(cols);
      break;
    case "PAYMENT":
      if (data.payment) b.row("Paid via", data.payment.method, cols);
      break;
    case "QR":
      if (props.data) b.align("center").qr(resolveTemplate(props.data, data));
      break;
    case "BARCODE":
      if (props.data) b.align("center").barcode(resolveTemplate(props.data, data));
      break;
    case "TERMS":
      if (props.text) styledLine(b, props, props.text, "center");
      break;
    case "SIGNATURE":
      b.newline().newline().align("center").line("_______________________").line(props.label || "Authorized Signatory");
      break;
    case "FOOTER":
      styledLine(b, props, props.text || "Thank you, visit again!", "center");
      break;
    case "TEXT":
      styledLine(b, props, props.text || "", "left");
      break;
    case "DIVIDER":
      b.rule(cols, props.char || "-");
      break;
    case "SPACER":
      b.feed(props.lines || 1);
      break;
    default:
      break;
  }
}

/** Very small `{{order.id}}` style interpolation for QR/barcode payloads configured in the designer. */
function resolveTemplate(str, data) {
  return String(str).replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path) => {
    const val = path.split(".").reduce((acc, key) => (acc == null ? undefined : acc[key]), data);
    return val ?? "";
  });
}

module.exports = { renderEscPos };
