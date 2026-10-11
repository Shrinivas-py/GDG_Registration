import assert from 'node:assert/strict'
import test from 'node:test'
import request from 'supertest'
import { createApp } from '../server/app.js'

const valid = { name: 'Ada Lovelace', usnOrSrno: '001CS42', email: 'Ada@Example.com', branch: 'CSE', year: '1st Year' }

function appWith(insert, resolveCanonicalSrNo = async () => null) {
  return createApp({ repository: { insert, resolveCanonicalSrNo }, frontendOrigin: 'http://localhost:5173' })
}

test('valid registration returns 201 only after repository save', async () => {
  const saved = []
  const response = await request(appWith(async (value) => {
    saved.push(value)
    return { id: 'registration-id', created_at: '2026-10-11T00:00:00Z' }
  })).post('/api/registrations').send(valid)
  assert.equal(response.status, 201)
  assert.equal(saved[0].email, 'ada@example.com')
  assert.equal(saved[0].normalizedIdentifier, '001cs42')
  assert.equal(saved[0].canonicalSrNo, '001cs42')
})

test('missing fields return 400', async () => {
  const response = await request(appWith(async () => ({ id: 'x' }))).post('/api/registrations').send({})
  assert.equal(response.status, 400)
  assert.ok(response.body.errors.email)
})

test('invalid email, branch, and year return 400', async () => {
  const response = await request(appWith(async () => ({ id: 'x' }))).post('/api/registrations').send({ ...valid, email: 'bad', branch: 'CS', year: '5th Year' })
  assert.equal(response.status, 400)
  assert.ok(response.body.errors.email)
  assert.ok(response.body.errors.branch)
  assert.ok(response.body.errors.year)
})

test('unique email conflict returns 409', async () => {
  const response = await request(appWith(async () => { throw { code: '23505', constraint: 'registrations_email_normalized_key' } })).post('/api/registrations').send(valid)
  assert.equal(response.status, 409)
  assert.equal(response.body.field, 'email')
})

test('unique identifier conflict returns 409', async () => {
  const response = await request(appWith(async () => { throw { code: '23505', constraint: 'registrations_identifier_normalized_key' } })).post('/api/registrations').send(valid)
  assert.equal(response.status, 409)
  assert.equal(response.body.field, 'usnOrSrno')
})

test('duplicate SrNo uses the canonical duplicate constraint', async () => {
  const response = await request(appWith(async () => { throw { code: '23505', constraint: 'registrations_canonical_sr_no_key' } })).post('/api/registrations').send({ ...valid, usnOrSrno: '00042' })
  assert.equal(response.status, 409)
  assert.equal(response.body.field, 'usnOrSrno')
})

test('mapped USN resolves to the authoritative SrNo before insert', async () => {
  const saved = []
  const response = await request(appWith(async (value) => {
    saved.push(value)
    return { id: 'mapped', created_at: new Date().toISOString() }
  }, async (identifier) => {
    assert.equal(identifier, 'usn123')
    return '00042'
  })).post('/api/registrations').send({ ...valid, usnOrSrno: 'USN123' })
  assert.equal(response.status, 201)
  assert.equal(saved[0].canonicalSrNo, '00042')
})

test('missing USN mapping uses the entered normalized value as a provisional SrNo candidate', async () => {
  const saved = []
  const response = await request(appWith(async (value) => {
    saved.push(value)
    return { id: 'unmapped', created_at: new Date().toISOString() }
  })).post('/api/registrations').send({ ...valid, usnOrSrno: 'USN-NOT-MAPPED' })
  assert.equal(response.status, 201)
  assert.equal(saved[0].canonicalSrNo, 'usn-not-mapped')
})

test('database failure never returns success', async () => {
  const response = await request(appWith(async () => { throw new Error('database unavailable') })).post('/api/registrations').send(valid)
  assert.equal(response.status, 503)
})

test('public registration list is not exposed', async () => {
  const response = await request(appWith(async () => ({ id: 'x' }))).get('/api/registrations')
  assert.equal(response.status, 404)
})

test('concurrent duplicate errors are surfaced as conflicts', async () => {
  let calls = 0
  const response = await Promise.all(Array.from({ length: 2 }, () => request(appWith(async () => {
    calls += 1
    if (calls > 1) throw { code: '23505', constraint: 'registrations_identifier_normalized_key' }
    return { id: 'one', created_at: new Date().toISOString() }
  })).post('/api/registrations').send(valid)))
  assert.deepEqual(response.map((item) => item.status).sort(), [201, 409])
})
