// Composes an HTML string from (receiptData, layoutJson) - used for the
// Designer's Live Preview, browser/AirPrint printing (the customer-facing
// side just calls window.print() on this), and PDF generation (a browser
// or Electron's print-to-PDF renders this same HTML - no separate PDF
// template is maintained). Safe to use the real ₹ symbol here, unlike
// escposRenderer.js, since HTML rendering always has real UTF-8 font
// support.
const { isBlockVisible } = require("./blockVisibility");

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function money(n) {
  return `₹${Number(n || 0).toFixed(2)}`;
}

const TAX_LABELS = { CGST: "CGST", SGST: "SGST", IGST: "IGST", GST: "GST", VAT: "VAT" };

/**
 * @param {object} receiptData - see services/printing/receiptData.js
 * @param {object} layoutJson - ReceiptTemplate.layoutJson: { blocks: [{ type, props, visibleIf }] }
 * @param {object} [profile] - PrinterProfile: { paperWidthMm }
 * @returns {string} standalone HTML document
 */
function renderHtml(receiptData, layoutJson, profile = {}) {
  const widthMm = profile.paperWidthMm || 80;
  const blocks = (layoutJson?.blocks || [])
    .filter((block) => !block.hidden && isBlockVisible(block.visibleIf, receiptData))
    .map((block) => wrapBlock(block, renderBlock(block, receiptData)))
    .join("\n");

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Receipt</title>
<style>
  @media print { @page { size: ${widthMm}mm auto; margin: 0; } }
  body { font-family: "Courier New", monospace; width: ${widthMm}mm; margin: 0 auto; padding: 4mm; font-size: 12px; color: #000; }
  .center { text-align: center; }
  .bold { font-weight: bold; }
  .row { display: flex; justify-content: space-between; gap: 8px; }
  .rule { border: none; border-top: 1px dashed #000; margin: 4px 0; }
  .lg { font-size: 16px; }
  img.qr, img.barcode { display: block; margin: 4px auto; }
</style>
</head>
<body>
${blocks}
</body>
</html>`;
}

// Generic Designer styling (margin/padding/align/bold/fontSize) wraps every
// block's markup uniformly here - much simpler than escposRenderer.js's
// per-block-type handling, since CSS composes safely regardless of what's
// inside (an ESC/POS byte stream has no such "wrap arbitrary content"
// concept).
function wrapBlock(block, innerHtml) {
  const props = block.props || {};
  const styles = [];
  if (props.marginTop) styles.push(`margin-top:${props.marginTop * 4}px`);
  if (props.marginBottom) styles.push(`margin-bottom:${props.marginBottom * 4}px`);
  if (props.padding) styles.push(`padding:${props.padding}px`);
  if (props.align) styles.push(`text-align:${props.align}`);
  if (props.bold) styles.push("font-weight:bold");
  if (props.fontSize) styles.push(`font-size:${12 * Math.min(Math.max(props.fontSize, 1), 3)}px`);
  if (!styles.length) return innerHtml;
  return `<div style="${styles.join(";")}">${innerHtml}</div>`;
}

function renderBlock(block, data) {
  const props = block.props || {};
  switch (block.type) {
    case "LOGO": {
      // A Designer-uploaded image (props.imageUrl) takes priority over the
      // company's account-wide logo, since a template's logo is meant to be
      // per-template-configurable, not just inherited.
      const logoUrl = props.imageUrl || data.company?.logoUrlShort;
      return logoUrl
        ? `<div class="center"><img src="${escapeHtml(logoUrl)}" style="max-width:60%;max-height:60px" /></div>`
        : `<div class="center bold lg">${escapeHtml(data.company?.name)}</div>`;
    }
    case "MERCHANT_INFO":
      return `<div class="center bold lg">${escapeHtml(data.company?.name)}</div>${
        data.branch?.name && data.branch.name !== data.company?.name ? `<div class="center">${escapeHtml(data.branch.name)}</div>` : ""
      }`;
    case "ADDRESS": {
      const parts = [data.branch?.addressLine1, data.branch?.addressLine2, data.branch?.city].filter(Boolean);
      return `${parts.length ? `<div class="center">${escapeHtml(parts.join(", "))}</div>` : ""}${
        data.branch?.phone ? `<div class="center">Ph: ${escapeHtml(data.branch.phone)}</div>` : ""
      }`;
    }
    case "GST": {
      const gst = data.branch?.gstNumber || data.company?.gstNumber;
      return gst ? `<div class="center">GSTIN: ${escapeHtml(gst)}</div>` : "";
    }
    case "INVOICE":
      return `<div class="row"><span>Order #</span><span>${escapeHtml(data.order.id.slice(0, 8).toUpperCase())}</span></div>${
        data.order.kotNumber ? `<div class="row"><span>KOT #</span><span>${escapeHtml(data.order.kotNumber)}</span></div>` : ""
      }`;
    case "DATE":
      return `<div class="row"><span>Date</span><span>${escapeHtml(new Date(data.order.createdAt).toLocaleString("en-IN"))}</span></div>`;
    case "CASHIER":
      return data.cashier?.name ? `<div class="row"><span>Cashier</span><span>${escapeHtml(data.cashier.name)}</span></div>` : "";
    case "CUSTOMER":
      return [
        data.customer?.name ? `<div class="row"><span>Customer</span><span>${escapeHtml(data.customer.name)}</span></div>` : "",
        data.customer?.phone ? `<div class="row"><span>Phone</span><span>${escapeHtml(data.customer.phone)}</span></div>` : "",
        data.table?.tableNo ? `<div class="row"><span>Table</span><span>${escapeHtml(data.table.tableNo)}</span></div>` : "",
      ].join("");
    case "ITEMS_TABLE":
      return `<hr class="rule" />${data.items
        .map((item) => `<div class="row"><span>${escapeHtml(item.name)} x${item.quantity}</span><span>${money(item.total)}</span></div>`)
        .join("")}<hr class="rule" />`;
    case "DISCOUNT":
      return data.totals.discount > 0 ? `<div class="row"><span>Discount</span><span>-${money(data.totals.discount)}</span></div>` : "";
    case "COUPON":
      return props.code ? `<div class="row"><span>Coupon</span><span>${escapeHtml(props.code)}</span></div>` : "";
    case "TAX":
      return Object.entries(data.taxBreakdown || {})
        .map(([type, amount]) => `<div class="row"><span>${TAX_LABELS[type] || type}</span><span>${money(amount)}</span></div>`)
        .join("");
    case "SUBTOTAL":
      return `<div class="row"><span>Subtotal</span><span>${money(data.totals.subtotal)}</span></div>`;
    case "ROUND_OFF":
      return Math.abs(data.totals.roundOff) >= 0.01 ? `<div class="row"><span>Round Off</span><span>${money(data.totals.roundOff)}</span></div>` : "";
    case "GRAND_TOTAL":
      return `<hr class="rule" /><div class="row bold lg"><span>TOTAL</span><span>${money(data.totals.grandTotal)}</span></div><hr class="rule" />`;
    case "PAYMENT":
      return data.payment ? `<div class="row"><span>Paid via</span><span>${escapeHtml(data.payment.method)}</span></div>` : "";
    case "QR":
      return props.data ? `<div class="center"><img class="qr" src="/api/public/print/qr.png?data=${encodeURIComponent(resolveTemplate(props.data, data))}" width="120" height="120" /></div>` : "";
    case "BARCODE":
      return props.data ? `<div class="center"><img class="barcode" src="/api/public/print/barcode.png?data=${encodeURIComponent(resolveTemplate(props.data, data))}" height="50" /></div>` : "";
    case "TERMS":
      return props.text ? `<div class="center">${escapeHtml(props.text)}</div>` : "";
    case "SIGNATURE":
      return `<div class="center" style="margin-top:16px">_______________________<br/>${escapeHtml(props.label || "Authorized Signatory")}</div>`;
    case "FOOTER":
      return `<div class="center">${escapeHtml(props.text || "Thank you, visit again!")}</div>`;
    case "TEXT":
      return `<div class="${props.align === "center" ? "center" : ""}">${escapeHtml(props.text || "")}</div>`;
    case "DIVIDER":
      return `<hr class="rule" />`;
    case "SPACER":
      return `<div style="height:${(props.lines || 1) * 10}px"></div>`;
    default:
      return "";
  }
}

function resolveTemplate(str, data) {
  return String(str).replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path) => {
    const val = path.split(".").reduce((acc, key) => (acc == null ? undefined : acc[key]), data);
    return val ?? "";
  });
}

module.exports = { renderHtml };
