import { normalizeSrNo, normalizeUsn, validateSrNo, validateUsn } from '../shared/identifierValidation.js'

export const BRANCHES = ['CSE', 'ISE', 'CSE(AIML)', 'ECE', 'EIE', 'RA', 'MECH', 'CIV']
export const YEARS = ['1st Year', '2nd Year', '3rd Year', '4th Year']
export const registrationKeys = new Set(['name', 'sr_no', 'usn', 'email', 'branch', 'year', 'honeypot'])

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const zeroWidthPattern = /[\u200B-\u200D\uFEFF]/g

function clean(value) {
  return value.normalize('NFKC').replace(zeroWidthPattern, '')
}

function normalizeName(value) {
  return clean(value).trim().replace(/\s+/g, ' ')
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
  const sr_no = normalizeSrNo(clean(input.sr_no || ''))
  const usn = normalizeUsn(clean(input.usn || ''))
  const email = normalizeEmail(input.email || '')
  const branch = clean(input.branch || '')
  const year = clean(input.year || '')
  const honeypot = clean(input.honeypot || '')

  if (!name) errors.name = 'Full name is required.'
  else if (name.length < 2 || name.length > 100) errors.name = 'Enter a name between 2 and 100 characters.'
  const srNoError = validateSrNo(sr_no)
  if (srNoError) errors.sr_no = srNoError
  const usnError = validateUsn(usn)
  if (usnError) errors.usn = usnError
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
