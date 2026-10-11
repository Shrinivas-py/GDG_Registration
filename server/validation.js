export const BRANCHES = ['CSE', 'ISE', 'CSE(AIML)', 'ECE', 'EIE', 'RA', 'MECH', 'CIV']
export const YEARS = ['1st Year', '2nd Year', '3rd Year', '4th Year']

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function normalizeEmail(value) {
  return value.trim().toLowerCase()
}

export function normalizeIdentifier(value) {
  return value.trim().toLowerCase()
}

export function validateRegistration(input) {
  const body = input && typeof input === 'object' ? input : {}
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const usnOrSrno = typeof body.usnOrSrno === 'string' ? body.usnOrSrno.trim() : ''
  const email = typeof body.email === 'string' ? normalizeEmail(body.email) : ''
  const branch = typeof body.branch === 'string' ? body.branch : ''
  const year = typeof body.year === 'string' ? body.year : ''
  const errors = {}

  if (!name) errors.name = 'Full name is required.'
  if (!usnOrSrno) errors.usnOrSrno = 'USN or serial number is required.'
  if (!email) errors.email = 'Email ID is required.'
  else if (!emailPattern.test(email)) errors.email = 'Enter a valid email address.'
  if (!BRANCHES.includes(branch)) errors.branch = 'Select a valid branch.'
  if (!YEARS.includes(year)) errors.year = 'Select a valid year.'

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    value: { name, usnOrSrno, email, branch, year, normalizedIdentifier: normalizeIdentifier(usnOrSrno) },
  }
}
