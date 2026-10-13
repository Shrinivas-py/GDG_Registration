import assert from 'node:assert/strict'
import test from 'node:test'
import request from 'supertest'
import { createApp } from '../server/app.js'

const valid = {
  name: 'Ada Lovelace',
  sr_no: '24-0540',
  usn: '1JS24IS160',
  email: 'ada@example.com',
  branch: 'CSE',
  year: '1st Year',
  honeypot: '',
}

function emailKey(email) {
  const [local, domain] = email.split('@')
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    return `${local.split('+')[0].replaceAll('.', '')}@gmail.com`
  }
  return email
}

function createIsolatedDatabase() {
  const rows = []
  const insert = (registration) => {
    const checks = [
      ['registrations_sr_no_key', (row) => row.sr_no === registration.sr_no],
      ['registrations_usn_key', (row) => registration.usn !== null && row.usn === registration.usn],
      ['registrations_email_key_key', (row) => emailKey(row.email) === emailKey(registration.email)],
    ]
    const duplicate = checks.find(([, matches]) => rows.some(matches))
    if (duplicate) throw { code: '23505', constraint: duplicate[0] }
    const stored = { ...registration }
    rows.push({ ...stored, qr_token: `${rows.length + 1}`.padStart(64, '0'), fallback_id: 1000 + rows.length, email: registration.email })
    return rows[rows.length - 1]
  }
  return {
    rows,
    repository: { createRegistration: async (registration) => insert(registration) },
  }
}

function appFor(database) {
  return createApp({ repository: database.repository, frontendOrigin: 'http://localhost:5173' })
}

test('stores normalized values and SQL-NULL-equivalent missing USNs', async () => {
  const database = createIsolatedDatabase()
  const response = await request(appFor(database)).post('/api/registrations').send({
    ...valid,
    name: '  Ada   Lovelace ',
    sr_no: ' 24-0540 ',
    usn: ' ',
    email: ' ADA@Example.COM ',
  })

  assert.equal(response.status, 201)
  assert.equal(database.rows.length, 1)
  assert.equal(database.rows[0].usn, null)
  assert.equal(database.rows[0].sr_no, '24-0540')
  assert.equal(database.rows[0].email, 'ada@example.com')
})

test('allows distinct optional-USN registrations', async () => {
  const database = createIsolatedDatabase()
  const responses = await Promise.all([
    request(appFor(database)).post('/api/registrations').send({ ...valid, usn: '', sr_no: '24-0541', email: 'one@example.com' }),
    request(appFor(database)).post('/api/registrations').send({ ...valid, usn: '', sr_no: '24-0542', email: 'two@example.com' }),
  ])
  assert.deepEqual(responses.map((response) => response.status), [201, 201])
  assert.deepEqual(database.rows.map((row) => row.usn), [null, null])
})

test('enforces database uniqueness for Sr. No., USN, and email', async () => {
  for (const field of ['sr_no', 'usn', 'email']) {
    const database = createIsolatedDatabase()
    const first = await request(appFor(database)).post('/api/registrations').send(valid)
    const second = await request(appFor(database)).post('/api/registrations').send({
      ...valid,
      name: 'Grace Hopper',
      ...(field === 'sr_no' ? { sr_no: valid.sr_no } : {}),
      ...(field === 'usn' ? { usn: valid.usn } : {}),
      ...(field === 'email' ? { email: valid.email } : {}),
    })
    assert.equal(first.status, 201, field)
    assert.equal(second.status, 409, field)
  }
})

test('handles simultaneous duplicate submissions with one winner', async () => {
  const database = createIsolatedDatabase()
  const responses = await Promise.all([
    request(appFor(database)).post('/api/registrations').send(valid),
    request(appFor(database)).post('/api/registrations').send(valid),
  ])
  assert.deepEqual(responses.map((response) => response.status).sort(), [201, 409])
  assert.equal(database.rows.length, 1)
})

test('applies Gmail dot and plus equivalence only to Gmail-family domains', async () => {
  const gmail = createIsolatedDatabase()
  assert.equal((await request(appFor(gmail)).post('/api/registrations').send({
    ...valid, email: 'ada@gmail.com',
  })).status, 201)
  const gmailAlias = await request(appFor(gmail)).post('/api/registrations').send({
    ...valid, sr_no: '24-0541', usn: '1JS24IS161', email: 'a.da+club@googlemail.com',
  })
  assert.equal(gmailAlias.status, 409)

  const provider = createIsolatedDatabase()
  assert.equal((await request(appFor(provider)).post('/api/registrations').send(valid)).status, 201)
  const providerAlias = await request(appFor(provider)).post('/api/registrations').send({
    ...valid, sr_no: '24-0541', usn: '1JS24IS161', email: 'ada+club@example.com',
  })
  assert.equal(providerAlias.status, 201)
})

test('rejects invalid requests sent directly to the API', async () => {
  const app = appFor(createIsolatedDatabase())
  for (const body of [
    {},
    { ...valid, name: 'A' },
    { ...valid, branch: 'INVALID' },
    { ...valid, year: '0th Year' },
    { ...valid, usn: 'not-a-usn' },
    { ...valid, extra: 'ignored-by-frontend-but-not-by-api' },
  ]) {
    const response = await request(app).post('/api/registrations').send(body)
    assert.equal(response.status, 400)
  }
})

test('safely handles malformed JSON, database failures, and honeypot submissions', async () => {
  const malformed = await request(appFor(createIsolatedDatabase()))
    .post('/api/registrations')
    .set('Content-Type', 'application/json')
    .send('{"name":')
  assert.equal(malformed.status, 400)

  const failureApp = createApp({
    repository: { createRegistration: async () => { throw new Error('secret database detail') } },
    frontendOrigin: 'http://localhost:5173',
  })
  const failure = await request(failureApp).post('/api/registrations').send(valid)
  assert.equal(failure.status, 500)
  assert.deepEqual(failure.body, { success: false, message: 'Registration could not be saved. Please try again later.' })

  const database = createIsolatedDatabase()
  const bot = await request(appFor(database)).post('/api/registrations').send({ ...valid, honeypot: 'bot' })
  assert.equal(bot.status, 201)
  assert.equal(database.rows.length, 0)
})
