import assert from 'node:assert/strict'
import test from 'node:test'
import request from 'supertest'
import { createApp } from '../server/app.js'

const valid = { name: 'Ada Lovelace', sr_no: '24-0540', usn: '1JS24IS160', email: 'Ada@Example.com', branch: 'CSE', year: '1st Year', honeypot: '' }
const appWith = (createRegistration) => createApp({ repository: { createRegistration }, frontendOrigin: 'http://localhost:5173' })

test('health endpoint returns minimal status', async () => {
  const response = await request(appWith(async () => ({}))).get('/api/health')
  assert.equal(response.status, 200)
  assert.deepEqual(response.body, { success: true, message: 'ok' })
})

test('successful registration normalizes fields and supports no USN', async () => {
  const saved = []
  const response = await request(appWith(async (value) => {
    saved.push(value)
    return { id: 'registration-id' }
  })).post('/api/registrations').send({ ...valid, usn: '', name: '  Ada   Lovelace  ', sr_no: ' 24 – 0540 ' })
  assert.equal(response.status, 201)
  assert.equal(response.body.success, true)
  assert.equal(saved[0].name, 'Ada Lovelace')
  assert.equal(saved[0].sr_no, '24-0540')
  assert.equal(saved[0].usn, null)
})

test('two registrations without USN are both accepted by the API', async () => {
  let calls = 0
  const response = await Promise.all([
    request(appWith(async (value) => { calls += 1; assert.equal(value.usn, null); return {} })).post('/api/registrations').send({ ...valid, usn: '', sr_no: '24-0541', email: 'one@example.com' }),
    request(appWith(async (value) => { calls += 1; assert.equal(value.usn, null); return {} })).post('/api/registrations').send({ ...valid, usn: '', sr_no: '24-0542', email: 'two@example.com' }),
  ])
  assert.deepEqual(response.map((item) => item.status), [201, 201])
  assert.equal(calls, 2)
})

test('missing and invalid values return 400', async () => {
  const response = await request(appWith(async () => ({}))).post('/api/registrations').send({})
  assert.equal(response.status, 400)
  assert.ok(response.body.errors.sr_no)

  const invalid = await request(appWith(async () => ({}))).post('/api/registrations').send({
    ...valid, name: ' ', sr_no: 'bad', email: 'bad', branch: 'CS', year: '5th Year',
  })
  assert.equal(invalid.status, 400)
  assert.ok(invalid.body.errors.name)
  assert.ok(invalid.body.errors.email)
  assert.ok(invalid.body.errors.branch)
  assert.ok(invalid.body.errors.year)
})

test('USN accepts lowercase after normalization and rejects wrong format', async () => {
  let saved
  const response = await request(appWith(async (value) => { saved = value; return {} })).post('/api/registrations').send({ ...valid, usn: '1js24is160' })
  assert.equal(response.status, 201)
  assert.equal(saved.usn, '1JS24IS160')

  const invalid = await request(appWith(async () => ({}))).post('/api/registrations').send({ ...valid, usn: '2JS24IS16' })
  assert.equal(invalid.status, 400)
  assert.ok(invalid.body.errors.usn)
})

test('non-string and extra fields are rejected', async () => {
  for (const body of [{ ...valid, email: 42 }, { ...valid, extra: 'nope' }]) {
    const response = await request(appWith(async () => ({}))).post('/api/registrations').send(body)
    assert.equal(response.status, 400)
  }
})

test('duplicate constraints map to safe messages', async () => {
  for (const [constraint, message] of Object.entries({
    registrations_sr_no_key: 'This Sr. No. is already registered.',
    registrations_usn_key: 'This USN is already registered.',
    registrations_email_key_key: 'This email is already registered.',
  })) {
    const response = await request(appWith(async () => { throw { code: '23505', constraint } })).post('/api/registrations').send(valid)
    assert.equal(response.status, 409)
    assert.deepEqual(response.body, { success: false, message })
  }
})

test('gmail aliases are reported as an email duplicate by the database constraint', async () => {
  const response = await request(appWith(async () => {
    throw { code: '23505', constraint: 'registrations_email_key_key' }
  })).post('/api/registrations').send({ ...valid, email: 'A.da+club@googlemail.com' })
  assert.equal(response.status, 409)
  assert.equal(response.body.message, 'This email is already registered.')
})

test('check violations and database failures are safe', async () => {
  const invalid = await request(appWith(async () => { throw { code: '23514' } })).post('/api/registrations').send(valid)
  assert.equal(invalid.status, 400)
  const failure = await request(appWith(async () => { throw new Error('database unavailable') })).post('/api/registrations').send(valid)
  assert.equal(failure.status, 500)
  assert.equal(failure.body.success, false)
})

test('honeypot returns fake success without inserting', async () => {
  let calls = 0
  const response = await request(appWith(async () => { calls += 1 })).post('/api/registrations').send({ ...valid, honeypot: 'bot' })
  assert.equal(response.status, 201)
  assert.equal(calls, 0)
})

test('public registration list is not exposed', async () => {
  const response = await request(appWith(async () => ({}))).get('/api/registrations')
  assert.equal(response.status, 404)
})
