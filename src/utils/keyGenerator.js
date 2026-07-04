const crypto = require('crypto')

function generateApiKey() {
  return crypto.randomBytes(32).toString('hex')
}

function generateTID() {
  return 'TID' + ( Date.now() + Math.floor(1000 + Math.random() * 9000) )
}

function generateAID() {
  return 'A' + ( Date.now() + Math.floor(10000 + Math.random() * 90000) )
}

function generateAGGID() {
  return 'PF' + (Date.now() + Math.floor(1000 + Math.random() * 9000));
}


function generateMID() {
  return 'MID' + ( Date.now() + Math.floor(100000 + Math.random() * 900000) )
}

function generateAppID() {
  return Math.floor(Date.now() + Math.random() * (99999999999 - 1000000)) + 100000;
}

function generateARSKey(){
  const key = crypto.randomBytes(24);
  console.log('AES-192 Key (base64):', key.toString('base64'));
  return key.toString('base64')
}


function generateMerchantKey() {
  const key = crypto.randomBytes(24).toString("base64"); // 24 bytes = AES-192
  return key;
}


module.exports = { generateApiKey, generateAGGID, generateMID, generateTID, generateAppID, generateARSKey,generateAID,generateMerchantKey }
