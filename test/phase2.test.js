import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import request from 'supertest'
import QRCode from 'qrcode'
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

function registration() {
  return { id: 'registration-id', ...valid, qr_token: 'a'.repeat(64), fallback_id: 1000 }
}

function appWith(repository, options = {}) {
  return createApp({
    repository,
    adminAuth: options.adminAuth,
    adminAuthConfigured: options.adminAuthConfigured || false,
    frontendOrigin: 'http://localhost:5173',
  })
}

test('successful registration returns a ticket without attempting email delivery', async () => {
  let calls = 0
  const response = await request(appWith({
    createRegistration: async () => {
      calls += 1
      return registration()
    },
  })).post('/api/registrations').send(valid)
  assert.equal(response.status, 201)
  assert.equal(calls, 1)
  assert.equal(response.body.ticket.participant.fallback_id, 1000)
  assert.equal(response.body.ticket.reference, 'GDG-AAAAAAAA')
})

test('ticket recovery returns the existing ticket without exposing its raw QR token', async () => {
  const originalToken = 'a'.repeat(64)
  const app = appWith({
    recoverTicketBySrNo: async (srNo) => {
      assert.equal(srNo, valid.sr_no)
      return {
        token: originalToken,
        reference: 'GDG-AAAAAAAA',
        participant: { name: valid.name, sr_no: valid.sr_no, usn: valid.usn, branch: valid.branch, year: valid.year, fallback_id: 1000 },
      }
    },
  })
  const response = await request(app).post('/api/ticket-recovery').send({ sr_no: valid.sr_no })
  assert.equal(response.status, 200)
  assert.equal(response.body.ticket.reference, 'GDG-AAAAAAAA')
  assert.equal('token' in response.body.ticket, false)
  assert.equal(response.body.ticket.qr_data_url, await QRCode.toDataURL(originalToken, { errorCorrectionLevel: 'M', margin: 2, width: 360 }))
})

test('ticket recovery returns a generic error for incorrect details', async () => {
  const app = appWith({ recoverTicketBySrNo: async () => null })
  const response = await request(app).post('/api/ticket-recovery').send({ sr_no: valid.sr_no })
  assert.equal(response.status, 400)
  assert.deepEqual(response.body, { success: false, message: 'That Sr. No. did not match an existing registration.' })
})

test('ticket recovery rate limits repeated attempts', async () => {
  const app = appWith({ recoverTicketBySrNo: async () => null })
  const responses = []
  for (let index = 0; index < 6; index += 1) {
    responses.push(await request(app).post('/api/ticket-recovery').send({ sr_no: valid.sr_no }))
  }
  assert.deepEqual(responses.map((response) => response.status), [400, 400, 400, 400, 400, 429])
})

test('allowlisted admins can recover a ticket by a non-token identifier', async () => {
  const repository = {
    getAdminTicket: async (input) => {
      assert.deepEqual(input, { token: '', fallbackId: 1000, ticketReference: '', usn: '' })
      return {
        kind: 'found',
        ticket: {
          token: 'a'.repeat(64),
          reference: 'GDG-AAAAAAAA',
          participant: { name: valid.name, sr_no: valid.sr_no, usn: valid.usn, branch: valid.branch, year: valid.year, fallback_id: 1000 },
        },
      }
    },
  }
  const app = appWith(repository, {
    adminAuthConfigured: true,
    adminAuth: (req, _res, next) => {
      req.adminUser = { email: 'admin@example.com' }
      next()
    },
  })
  const response = await request(app).post('/api/admin/ticket-recovery').set('Authorization', 'Bearer test').send({ fallback_id: '1000' })
  assert.equal(response.status, 200)
  assert.equal(response.body.ticket.reference, 'GDG-AAAAAAAA')
  assert.equal('token' in response.body.ticket, false)
  assert.ok(response.body.ticket.qr_data_url.startsWith('data:image/png;base64,'))
})

test('admin ticket recovery rejects raw QR-token recovery', async () => {
  const app = appWith({ getAdminTicket: async () => { throw new Error('must not be called') } }, {
    adminAuthConfigured: true,
    adminAuth: (_req, _res, next) => next(),
  })
  const response = await request(app).post('/api/admin/ticket-recovery').send({ token: 'a'.repeat(64) })
  assert.equal(response.status, 400)
  assert.match(response.body.message, /ticket reference/i)
})

test('fallback ID migration defines the complete concurrency and exhaustion safeguards', () => {
  const migration = fs.readFileSync(path.join(process.cwd(), 'supabase', 'phase-2-email-recovery.sql'), 'utf8')
  assert.match(migration, /fallback_id integer/)
  assert.match(migration, /between 1000 and 9999/)
  assert.match(migration, /unique \(fallback_id\)/)
  assert.match(migration, /pg_advisory_xact_lock/)
  assert.match(migration, /generate_series\(1000, 9999\)/)
  assert.match(migration, /fallback ID namespace exhausted/)
})

test('fallback ID allocation model remains unique under concurrent requests and retries collisions', async () => {
  const used = new Set()
  let nextCandidate = 1000
  let allocationLock = Promise.resolve()
  const allocate = async () => {
    const allocation = allocationLock.then(async () => {
      while (used.has(nextCandidate)) nextCandidate += 1
      const candidate = nextCandidate
      await new Promise((resolve) => setImmediate(resolve))
      used.add(candidate)
      return candidate
    })
    allocationLock = allocation.then(() => undefined)
    return allocation
  }
  const allocated = await Promise.all(Array.from({ length: 20 }, () => allocate()))
  assert.equal(new Set(allocated).size, 20)
  assert.ok(allocated.every((id) => id >= 1000 && id <= 9999))
})

test('fallback ID namespace exhaustion is represented as an explicit server failure', async () => {
  const app = appWith({ createRegistration: async () => { throw { code: 'P0001', message: 'fallback ID namespace exhausted' } } })
  const response = await request(app).post('/api/registrations').send(valid)
  assert.equal(response.status, 503)
  assert.deepEqual(response.body, { success: false, message: 'Registration is temporarily unavailable. Please try again later.' })
})
