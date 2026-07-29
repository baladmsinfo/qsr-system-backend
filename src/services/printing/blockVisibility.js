// Shared by escposRenderer.js and htmlRenderer.js - the Receipt Designer's
// "Conditional Visibility" feature is just a dotted-path lookup into
// receiptData plus a comparison, evaluated identically regardless of which
// output format is being generated.
function getPath(obj, path) {
  return path.split(".").reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

/**
 * @param {{field: string, operator?: 'equals'|'notEquals'|'exists'|'notExists', value?: any}} [rule]
 */
function isBlockVisible(rule, receiptData) {
  if (!rule || !rule.field) return true;
  const actual = getPath(receiptData, rule.field);
  switch (rule.operator || "exists") {
    case "equals":
      return actual === rule.value;
    case "notEquals":
      return actual !== rule.value;
    case "notExists":
      return actual === undefined || actual === null || actual === "";
    case "exists":
    default:
      return actual !== undefined && actual !== null && actual !== "";
  }
}

module.exports = { isBlockVisible, getPath };
