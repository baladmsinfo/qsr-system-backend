// utils/licenseKey.js
const crypto = require('crypto')
//import jwt from "jsonwebtoken";

function generateLicenseKey(prefix = "BBX") {
  const random = crypto.randomBytes(16).toString("hex").toUpperCase();
  return `${prefix}-${random.match(/.{1,4}/g).join("-")}`;
}

module.exports = { generateLicenseKey }

// export function LicenseToken(company){
//   return jwt.sign(
//     {
//       licenseKey: company.licenseKey,
//       companyID: company.id,
//       exp: Math.floor(new Date(license.expiresAt).getTime() / 1000),
//     },
//     process.env.LICENSE_SECRET
//   );
// }