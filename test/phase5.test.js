import test from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { createApp } from '../server/app.js'

function adminApp(repository = {}) {
  return createApp({
    repository,
    adminAuth: async (req, _res, next) => {
      req.adminUser = { id: 'admin', email: 'approved@example.com' }
      next()
    },
    adminAuthConfigured: true,
  })
}

test('all Phase 5 endpoints reject unauthenticated requests', async () => {
  const app = createApp({
    adminAuthConfigured: true,
    adminAuth: async (_req, res) => res.status(401).json({ success: false }),
  })
  const paths = [
    ['/api/admin/check-in/lookup', 'post'],
    ['/api/admin/check-in', 'post'],
    ['/api/admin/attendance', 'get'],
    ['/api/admin/attendance.csv', 'get'],
    ['/api/admin/attendance.xlsx', 'get'],
  ]
  for (const [path, method] of paths) {
    const response = method === 'post'
      ? await request(app).post(path).send({})
      : await request(app).get(path)
    assert.equal(response.status, 401, path)
  }
})

test('looks up a QR token without returning it and rejects unknown or invalid tokens', async () => {
  const app = adminApp({
    lookupAdminAttendee: async ({ token }) => token === 'abc123'
      ? { kind: 'found', internalId: '12345678-1234-1234-1234-123456789012', attendee: { name: 'A Student', fallback_id: 1234, checked_in: false } }
      : { kind: 'not_found' },
  })
  const found = await request(app).post('/api/admin/check-in/lookup').send({ token: 'abc123' }).set('Authorization', 'Bearer token')
  assert.equal(found.status, 200)
  assert.equal(found.body.attendee.fallback_id, 1234)
  assert.equal(found.body.attendee.token, undefined)
  assert.equal(found.body.lookup_id, undefined)
  assert.equal((await request(app).post('/api/admin/check-in/lookup').send({ token: 'deadbeef' }).set('Authorization', 'Bearer token')).status, 404)
  assert.equal((await request(app).post('/api/admin/check-in/lookup').send({ token: 'not valid!' }).set('Authorization', 'Bearer token')).status, 400)
})

test('allows an authenticated manual lookup and rejects a missing bearer token', async () => {
  let authorization
  const app = createApp({
    repository: {
      lookupAdminAttendee: async () => ({
        kind: 'found',
        internalId: '12345678-1234-1234-1234-123456789012',
        attendee: { name: 'A Student', fallback_id: 2508, checked_in: false },
      }),
    },
    adminAuth: async (req, res, next) => {
      authorization = req.get('authorization')
      if (!authorization) return res.status(401).json({ success: false, message: 'Authentication is required.' })
      req.adminUser = { id: 'admin', email: 'approved@example.com' }
      next()
    },
    adminAuthConfigured: true,
  })
  const found = await request(app)
    .post('/api/admin/check-in/lookup')
    .send({ fallback_id: '2508' })
    .set('Authorization', 'Bearer session-token')
  assert.equal(found.status, 200)
  assert.equal(authorization, 'Bearer session-token')
  assert.equal((await request(app).post('/api/admin/check-in/lookup').send({ fallback_id: '2508' })).status, 401)
})

test('does not block scan requests based on the client IP', async () => {
  const app = adminApp({
    lookupAdminAttendee: async () => ({ kind: 'not_found' }),
  })
  const responses = await Promise.all(Array.from({ length: 31 }, () => (
    request(app)
      .post('/api/admin/check-in/lookup')
      .set('Authorization', '******')
      .send({ fallback_id: '2508' })
  )))
  assert.ok(responses.every((response) => response.status !== 429))
})

test('supports manual lookup and requires explicit check-in confirmation', async () => {
  let checkIns = 0
  const app = adminApp({
    lookupAdminAttendee: async ({ fallbackId }) => fallbackId === 1234
      ? { kind: 'found', internalId: '12345678-1234-1234-1234-123456789012', attendee: { name: 'A Student', sr_no: '24-0001', fallback_id: 1234, checked_in: false } }
      : { kind: 'not_found' },
    checkInAdminAttendee: async () => {
      checkIns += 1
      return { kind: 'checked_in', attendee: { name: 'A Student', fallback_id: 1234, checked_in: true, checked_in_at: '2026-10-13T10:00:00.000Z' } }
    },
  })

  test('supports manual ticket-reference lookup', async () => {
    const app = adminApp({
      lookupAdminAttendee: async ({ ticketReference }) => ticketReference === 'GDG-ABCDEF12'
        ? { kind: 'found', internalId: '12345678-1234-1234-1234-123456789012', attendee: { name: 'A Student', sr_no: '24-0001', fallback_id: 1234, checked_in: false } }
        : { kind: 'not_found' },
    })
    const response = await request(app)
      .post('/api/admin/check-in/lookup')
      .send({ ticket_reference: 'gdg-abcdef12' })
      .set('Authorization', '******')
    assert.equal(response.status, 200)
    assert.equal(response.body.attendee.fallback_id, 1234)
    assert.equal(response.body.attendee.token, undefined)
  })
  const lookup = await request(app).post('/api/admin/check-in/lookup').send({ fallback_id: '1234' }).set('Authorization', 'Bearer token')
  assert.equal(lookup.status, 200)
  assert.equal(checkIns, 0)
  const checkIn = await request(app).post('/api/admin/check-in').send({ fallback_id: '1234' }).set('Authorization', 'Bearer token')
  assert.equal(checkIn.body.result, 'checked_in')
  assert.equal(checkIns, 1)
})

test('returns ambiguous lookup and preserves already checked-in result', async () => {
  const app = adminApp({
    lookupAdminAttendee: async ({ usn }) => usn
      ? { kind: 'ambiguous' }
      : { kind: 'found', internalId: '12345678-1234-1234-1234-123456789012' },
    checkInAdminAttendee: async () => ({ kind: 'already_checked_in', attendee: { fallback_id: 1234, checked_in: true, checked_in_at: '2026-10-13T10:00:00.000Z' } }),
  })
  const ambiguous = await request(app).post('/api/admin/check-in/lookup').send({ usn: '1JS24IS160' }).set('Authorization', 'Bearer token')
  assert.equal(ambiguous.status, 409)
  const repeated = await request(app).post('/api/admin/check-in').send({ fallback_id: '1234' }).set('Authorization', 'Bearer token')
  assert.equal(repeated.body.result, 'already_checked_in')
  assert.equal(repeated.body.attendee.checked_in_at, '2026-10-13T10:00:00.000Z')
})

test('dashboard reports zero-safe percentage and attendance records support filters', async () => {
  const app = adminApp({
    getAdminDashboard: async () => ({ total: 0, checked_in: 0, remaining: 0, attendance_percentage: 0, recent_checkins: [] }),
    listAdminAttendees: async (params) => {
      assert.equal(params.checkedIn, true)
      return { attendees: [], total: 0 }
    },
    exportAdminAttendees: async () => [],
  })
  const dashboard = await request(app).get('/api/admin/dashboard').set('Authorization', 'Bearer token')
  assert.equal(dashboard.body.dashboard.attendance_percentage, 0)
  const records = await request(app).get('/api/admin/attendance?checked_in=true').set('Authorization', 'Bearer token')
  assert.equal(records.body.total, 0)
  assert.equal((await request(app).get('/api/admin/attendance.csv').set('Authorization', 'Bearer token')).status, 200)
  assert.equal((await request(app).get('/api/admin/attendance.xlsx').set('Authorization', 'Bearer token')).status, 200)
})

test('check-in validates lookup identity and handles repository failures safely', async () => {
  const app = adminApp({
    lookupAdminAttendee: async () => ({ kind: 'found', internalId: '12345678-1234-1234-1234-123456789012' }),
    checkInAdminAttendee: async () => { throw new Error('database failure') },
  })
  assert.equal((await request(app).post('/api/admin/check-in').send({ lookup_id: 'bad' }).set('Authorization', 'Bearer token')).status, 400)
  assert.equal((await request(app).post('/api/admin/check-in').send({ fallback_id: '1234' }).set('Authorization', 'Bearer token')).status, 500)
})

test('concurrent check-in attempts produce one success and one already-checked-in result', async () => {
  let claimed = false
  const app = adminApp({
    lookupAdminAttendee: async () => ({ kind: 'found', internalId: '12345678-1234-1234-1234-123456789012' }),
    checkInAdminAttendee: async () => {
      await new Promise((resolve) => setTimeout(resolve, 2))
      if (!claimed) {
        claimed = true
        return { kind: 'checked_in', attendee: { fallback_id: 1234, checked_in: true, checked_in_at: '2026-10-13T10:00:00.000Z' } }
      }
      return { kind: 'already_checked_in', attendee: { fallback_id: 1234, checked_in: true, checked_in_at: '2026-10-13T10:00:00.000Z' } }
    },
  })
  const responses = await Promise.all([
    request(app).post('/api/admin/check-in').send({ fallback_id: '1234' }).set('Authorization', 'Bearer token'),
    request(app).post('/api/admin/check-in').send({ fallback_id: '1234' }).set('Authorization', 'Bearer token'),
  ])
  assert.deepEqual(responses.map((response) => response.body.result).sort(), ['already_checked_in', 'checked_in'])
})
