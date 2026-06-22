// Minimal stand-in for lodash/toArray. node-emoji passes strings; lodash
// splits them by Unicode code point (so emoji are single elements). Array.from
// does exactly that. Arrays return a shallow copy; objects return their values.
module.exports = function toArray (value) {
  if (value == null) return []
  if (typeof value === 'string') return Array.from(value)
  if (Array.isArray(value)) return value.slice()
  if (typeof value.length === 'number') return Array.prototype.slice.call(value)
  return Object.keys(value).map(function (k) { return value[k] })
}
