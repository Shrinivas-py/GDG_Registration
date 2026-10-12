import assert from 'node:assert/strict'
import test from 'node:test'
import { validateRegistration } from '../server/validation.js'

const valid = {
  name: 'Ada Lovelace',
  sr_no: '24-0540',
  usn: '1JS24IS160',
  email: 'ada@example.com',
  branch: 'CSE',
  year: '1st Year',
  honeypot: '',
}

test('normalizes name, Sr. No., USN, and email', () => {
  const result = validateRegistration({
    ...valid,
    name: '  Ada   Lovelace  ',
    sr_no: ' 24 – 0540 ',
    usn: ' 1js24is160 ',
    email: '  ADA@Example.COM ',
  })

  assert.equal(result.valid, true)
  assert.deepEqual(result.value, {
    name: 'Ada Lovelace',
    sr_no: '24-0540',
    usn: '1JS24IS160',
    email: 'ada@example.com',
    branch: 'CSE',
    year: '1st Year',
    honeypot: '',
  })
})

test('accepts every configured branch and year', () => {
  for (const branch of ['CSE', 'ISE', 'CSE(AIML)', 'ECE', 'EIE', 'RA', 'MECH', 'CIV']) {
    assert.equal(validateRegistration({ ...valid, branch }).valid, true, branch)
  }
  for (const year of ['1st Year', '2nd Year', '3rd Year', '4th Year']) {
    assert.equal(validateRegistration({ ...valid, year }).valid, true, year)
  }
})

test('rejects invalid name, Sr. No., USN, email, branch, and year', () => {
  const cases = [
    ['name', '', 'name'],
    ['name', 'A', 'name'],
    ['name', 'x'.repeat(101), 'name'],
    ['sr_no', '24/0540', 'sr_no'],
    ['sr_no', '24-540', 'sr_no'],
    ['usn', '2JS24IS160', 'usn'],
    ['usn', '1JS24IS16', 'usn'],
    ['email', 'not-an-email', 'email'],
    ['email', 'a@b', 'email'],
    ['email', `a@${'x'.repeat(250)}.com`, 'email'],
    ['branch', 'CS', 'branch'],
    ['year', '5th Year', 'year'],
  ]

  for (const [field, value, errorField] of cases) {
    const result = validateRegistration({ ...valid, [field]: value })
    assert.equal(result.valid, false, `${field}=${value}`)
    assert.ok(result.errors[errorField], `${field} should have an error`)
  }
})

test('normalizes a missing USN to null', () => {
  const result = validateRegistration({ ...valid, usn: ' \u200B ' })
  assert.equal(result.valid, true)
  assert.equal(result.value.usn, null)
})

test('rejects malformed request shapes, non-text fields, and unexpected fields', () => {
  for (const input of [null, [], { ...valid, email: 42 }, { ...valid, extra: 'unexpected' }]) {
    const result = validateRegistration(input)
    assert.equal(result.valid, false)
    assert.ok(result.errors.form)
  }
})
