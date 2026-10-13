import test from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { createAdminAuth, parseAdminAllowlist } from '../server/auth.js'
import { createApp } from '../server/app.js'

function appFor(verifyUser, allowlist = 'approved@example.com') {
  return createApp({
    adminAuth: createAdminAuth({
      allowedEmails: parseAdminAllowlist(allowlist),
      verifyUser,
    }),
    adminAuthConfigured: true,
  })
}

test('normalizes the explicit admin allowlist', () => {
  assert.deepEqual([...parseAdminAllowlist(' Approved@Example.com,second@example.com ')], [
    'approved@example.com',
    'second@example.com',
  ])
})

test('allows a verified allowlisted user and ignores browser-supplied identity', async () => {
  const app = appFor(async () => ({ id: 'user-1', email: 'Approved@Example.com' }))
  const response = await request(app)
    .get('/api/admin/session')
    .set('Authorization', 'Bearer valid-token')
    .send({ email: 'attacker@example.com', role: 'admin' })

  assert.equal(response.status, 200)
  assert.deepEqual(response.body.user, { id: 'user-1', email: 'approved@example.com' })
})

test('rejects missing, invalid, expired, and non-allowlisted credentials', async () => {
  const app = appFor(async (token) => {
    if (token === 'expired') throw new Error('expired')
    if (token === 'invalid') return null
    return { id: 'user-2', email: 'unapproved@example.com' }
  })

  assert.equal((await request(app).get('/api/admin/session')).status, 401)
  assert.equal((await request(app).get('/api/admin/session').set('Authorization', 'Bearer invalid')).status, 403)
  assert.equal((await request(app).get('/api/admin/session').set('Authorization', 'Bearer expired')).status, 401)
  assert.equal((await request(app).get('/api/admin/session').set('Authorization', 'Bearer valid')).status, 403)
})

test('fails closed when admin allowlist configuration is missing', async () => {
  const app = createApp({ adminAuthConfigured: false })
  const response = await request(app).get('/api/admin/session').set('Authorization', 'Bearer valid-token')
  assert.equal(response.status, 503)
})

test('protects every admin data and action endpoint before route handling', async () => {
  const app = createApp({
    adminAuthConfigured: true,
    adminAuth: async (_req, res) => res.status(401).json({ success: false, message: 'Authentication is required.' }),
  })
  const endpoints = [
    ['get', '/api/admin/session'],
    ['get', '/api/admin/dashboard'],
    ['post', '/api/admin/check-in/lookup'],
    ['post', '/api/admin/check-in'],
    ['post', '/api/admin/ticket-recovery'],
    ['get', '/api/admin/attendees'],
    ['get', '/api/admin/attendance'],
    ['get', '/api/admin/attendees.csv'],
    ['get', '/api/admin/attendees.xlsx'],
    ['get', '/api/admin/attendance.csv'],
    ['get', '/api/admin/attendance.xlsx'],
  ]
  for (const [method, path] of endpoints) {
    const response = method === 'post'
      ? await request(app).post(path).send({})
      : await request(app).get(path)
    assert.equal(response.status, 401, path)
  }
})

test('rate limits repeated admin authentication requests', async () => {
  const app = appFor(async () => null)
  const responses = await Promise.all(Array.from({ length: 31 }, () => (
    request(app).get('/api/admin/session').set('Authorization', 'Bearer invalid')
  )))
  assert.equal(responses.at(-1).status, 429)
})
