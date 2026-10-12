export const BRANCHES = ['CSE', 'ISE', 'CSE(AIML)', 'ECE', 'EIE', 'RA', 'MECH', 'CIV']
export const YEARS = ['1st Year', '2nd Year', '3rd Year', '4th Year']
export const registrationKeys = new Set(['name', 'sr_no', 'usn', 'email', 'branch', 'year', 'honeypot'])

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const srNoPattern = /^\d{2}-\d{4}$/
const usnPattern = /^1JS\d{2}[A-Z]{2}\d{3}$/
const zeroWidthPattern = /[\u200B-\u200D\uFEFF]/g
const dashPattern = /[\u2013\u2014\u2212]/g

function clean(value) {
  return value.normalize('NFKC').replace(zeroWidthPattern, '')
}

function normalizeName(value) {
  return clean(value).trim().replace(/\s+/g, ' ')
}

function normalizeSrNo(value) {
  return clean(value).trim().replace(/\s+/g, '').replace(dashPattern, '-')
}

function normalizeUsn(value) {
  const normalized = clean(value).trim().replace(/\s+/g, '').toUpperCase()
  return normalized || null
}

function normalizeEmail(value) {
  return clean(value).trim().toLowerCase()
}

export function validateRegistration(input) {
  const errors = {}
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { valid: false, errors: { form: 'Registration details are required.' } }
  }

  const keys = Object.keys(input)
  if (keys.some((key) => !registrationKeys.has(key))) {
    return { valid: false, errors: { form: 'Unexpected registration fields were provided.' } }
  }
  const requiredKeys = ['name', 'sr_no', 'email', 'branch', 'year']
  if (keys.some((key) => input[key] === null || typeof input[key] !== 'string')) {
    return { valid: false, errors: { form: 'All registration fields must be text.' } }
  }
  if (keys.some((key) => !requiredKeys.includes(key) && key !== 'usn' && key !== 'honeypot')) {
    return { valid: false, errors: { form: 'Unexpected registration fields were provided.' } }
  }

  const name = normalizeName(input.name || '')
  const sr_no = normalizeSrNo(input.sr_no || '')
  const usn = normalizeUsn(input.usn || '')
  const email = normalizeEmail(input.email || '')
  const branch = clean(input.branch || '')
  const year = clean(input.year || '')
  const honeypot = clean(input.honeypot || '')

  if (!name) errors.name = 'Full name is required.'
  else if (name.length < 2 || name.length > 100) errors.name = 'Enter a name between 2 and 100 characters.'
  if (!sr_no) errors.sr_no = 'Sr. No. is required.'
  else if (!srNoPattern.test(sr_no)) errors.sr_no = 'Use the format 24-0540.'
  if (usn && !usnPattern.test(usn)) errors.usn = 'Use the format 1JS24IS160.'
  if (!email) errors.email = 'Email ID is required.'
  else if (email.length > 254 || !emailPattern.test(email)) errors.email = 'Enter a valid email address.'
  if (!BRANCHES.includes(branch)) errors.branch = 'Select a valid branch.'
  if (!YEARS.includes(year)) errors.year = 'Select a valid year.'

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    value: { name, sr_no, usn, email, branch, year, honeypot },
  }
}
