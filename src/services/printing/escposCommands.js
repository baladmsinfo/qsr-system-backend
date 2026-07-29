// Low-level ESC/POS byte-command builder - the actual binary protocol
// thermal receipt printers speak (Epson's ESC/POS command set, the de facto
// industry standard nearly every 58mm/80mm thermal printer implements).
// Deliberately has zero Prisma/receipt-data knowledge - escposRenderer.js
// composes these primitives into a real receipt; this file only knows bytes.
const ESC = 0x1b;
const GS = 0x1d;

class EscPosBuilder {
  constructor() {
    /** @type {number[]} */
    this.bytes = [];
  }

  /** Printer reset - always first, so a previous job's state (bold/align/size) never bleeds into this one. */
  init() {
    this.bytes.push(ESC, 0x40);
    return this;
  }

  text(str) {
    this.bytes.push(...Buffer.from(str, "utf8"));
    return this;
  }

  line(str = "") {
    return this.text(str).newline();
  }

  newline() {
    this.bytes.push(0x0a);
    return this;
  }

  bold(on) {
    this.bytes.push(ESC, 0x45, on ? 1 : 0);
    return this;
  }

  underline(on) {
    this.bytes.push(ESC, 0x2d, on ? 1 : 0);
    return this;
  }

  /** align: 'left' | 'center' | 'right' */
  align(align) {
    const map = { left: 0, center: 1, right: 2 };
    this.bytes.push(ESC, 0x61, map[align] ?? 0);
    return this;
  }

  /** width/height: 1 (normal) - 8 (8x) - GS ! sizes both dimensions via one nibble each. */
  size(width = 1, height = 1) {
    const n = ((Math.min(width, 8) - 1) << 4) | (Math.min(height, 8) - 1);
    this.bytes.push(GS, 0x21, n);
    return this;
  }

  /** Horizontal rule sized to the printer's actual character width (58mm≈32 cols, 80mm≈48 cols). */
  rule(charsPerLine, char = "-") {
    return this.line(char.repeat(charsPerLine));
  }

  /** Two-column row (name ... amount), padded/truncated to fit charsPerLine - the workhorse for items/totals rows. */
  row(left, right, charsPerLine) {
    const rightStr = String(right);
    const maxLeft = Math.max(charsPerLine - rightStr.length - 1, 1);
    const leftStr = String(left).length > maxLeft ? String(left).slice(0, maxLeft - 1) + "…" : String(left);
    const padding = Math.max(charsPerLine - leftStr.length - rightStr.length, 1);
    return this.line(leftStr + " ".repeat(padding) + rightStr);
  }

  feed(lines = 1) {
    this.bytes.push(ESC, 0x64, lines);
    return this;
  }

  /** Partial cut with a small feed first so the tear-off doesn't land mid-text. */
  cut() {
    this.feed(3);
    this.bytes.push(GS, 0x56, 1);
    return this;
  }

  /** ESC p - kicks the cash drawer connected to the printer's RJ11 port (the standard, near-universal way a receipt printer drives a drawer). */
  openDrawer() {
    this.bytes.push(ESC, 0x70, 0, 25, 250);
    return this;
  }

  beep(times = 1, duration = 3) {
    this.bytes.push(0x1b, 0x42, times, duration);
    return this;
  }

  /** CODE128 barcode via GS k (function 73, the modern variable-length form every ESC/POS clone supports). */
  barcode(data, { height = 80 } = {}) {
    this.bytes.push(GS, 0x68, height); // barcode height
    this.bytes.push(GS, 0x77, 2); // module width
    this.bytes.push(GS, 0x48, 2); // print HRI text below barcode
    const bytes = Buffer.from(data, "utf8");
    this.bytes.push(GS, 0x6b, 73, bytes.length, ...bytes);
    return this;
  }

  /**
   * QR code via Epson's GS ( k proprietary command set - the widely-cloned
   * de facto standard for ESC/POS QR printing (model 2, module size 6,
   * error-correction level M).
   */
  qr(data) {
    const bytes = Buffer.from(data, "utf8");
    const storeLen = bytes.length + 3;
    const pL = storeLen & 0xff;
    const pH = (storeLen >> 8) & 0xff;

    // Model
    this.bytes.push(GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00);
    // Module size
    this.bytes.push(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, 0x06);
    // Error correction level M
    this.bytes.push(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31);
    // Store data
    this.bytes.push(GS, 0x28, 0x6b, pL, pH, 0x31, 0x50, 0x30, ...bytes);
    // Print
    this.bytes.push(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30);
    return this;
  }

  toBuffer() {
    return Buffer.from(this.bytes);
  }
}

module.exports = { EscPosBuilder };
