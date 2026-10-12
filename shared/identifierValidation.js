const srNoPattern = /^[0-9]{2}-[0-9]{4}$/
const usnPattern = /^1JS[0-9]{2}[A-Z]{2}[0-9]{3}$/
const zeroWidthPattern = /[\u200B-\u200D\uFEFF]/g

function clean(value) {
  return value.normalize('NFKC').replace(zeroWidthPattern, '')
}

export function normalizeSrNo(value) {
  return clean(value).trim()
}

export function normalizeUsn(value) {
  const normalized = clean(value).trim().toUpperCase()
  return normalized || null
}

export function validateSrNo(value) {
  if (!value) return 'Sr. No. is required.'
  if (!srNoPattern.test(value)) return 'Use the format 24-0540.'
  if (value.slice(-4) === '0000') return 'Sr. No. serial portion cannot be 0000.'
  return ''
}

export function validateUsn(value) {
  if (!value) return ''
  if (!usnPattern.test(value)) return 'Use the format 1JS24IS160.'
  if (value.slice(-3) === '000') return 'USN serial portion cannot be 000.'
  return ''
}
