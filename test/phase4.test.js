import test from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { strFromU8, unzipSync } from 'fflate'
import { createApp } from '../server/app.js'
import { createCsv, createXlsx } from '../server/adminExport.js'

const rows = [{
  name: '=HYPERLINK("https://evil.example","click")',
  sr_no: '24-0001',
  usn: '',
  email: 'person@example.com',
  branch: 'CSE',
  year: '1st Year',
  ticket_reference: 'GDG-12345678',
  fallback_id: 1000,
  checked_in: 'No',
  checked_in_at: '',
  registered_at: '2026-01-01T00:00:00.000Z',
}]

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

test('CSV escapes cells and protects formula injection', () => {
  const csv = createCsv(rows)
  assert.match(csv, /"'=HYPERLINK/)
  assert.match(csv, /Name,Sr\./)
})

test('XLSX output is a real workbook with headers, rows, and safe formula cells', async () => {
  const workbook = createXlsx(rows)
  assert.equal(workbook.slice(0, 2).toString(), 'PK')
  const files = unzipSync(workbook)
  const sheet = strFromU8(files['xl/worksheets/sheet1.xml'])
  assert.match(sheet, /Name/)
  assert.match(sheet, /&apos;=HYPERLINK/)
  assert.match(sheet, /person@example.com/)
})

test('XLSX output supports empty results', () => {
  const workbook = createXlsx([])
  const files = unzipSync(workbook)
  const sheet = strFromU8(files['xl/worksheets/sheet1.xml'])
  assert.match(sheet, /<sheetData><row/)
  assert.match(sheet, /Name/)
})

test('dashboard, pagination, filters, and empty results use repository data', async () => {
  const app = adminApp({
    getAdminDashboard: async () => ({ total: 2, checked_in: 1, remaining: 1 }),
    listAdminAttendees: async (params) => {
      assert.deepEqual(params, { page: 2, pageSize: 10, search: 'CSE', checkedIn: false })
      return { attendees: [], total: 0 }
    },
  })
  const summary = await request(app).get('/api/admin/dashboard').set('Authorization', 'Bearer token')
  assert.deepEqual(summary.body.dashboard, { total: 2, checked_in: 1, remaining: 1 })
  const list = await request(app).get('/api/admin/attendees?page=2&page_size=10&search=CSE&checked_in=false').set('Authorization', 'Bearer token')
  assert.equal(list.status, 200)
  assert.deepEqual(list.body.attendees, [])
})

test('rejects invalid admin query parameters and repository errors safely', async () => {
  const app = adminApp({
    getAdminDashboard: async () => { throw new Error('database down') },
  })
  assert.equal((await request(app).get('/api/admin/attendees?page_size=101').set('Authorization', 'Bearer token')).status, 400)
  assert.equal((await request(app).get('/api/admin/dashboard').set('Authorization', 'Bearer token')).status, 500)
})

test('dashboard and exports are protected', async () => {
  const app = createApp({ adminAuthConfigured: true, adminAuth: async (req, res) => res.status(401).json({ success: false }) })
  assert.equal((await request(app).get('/api/admin/dashboard')).status, 401)
  assert.equal((await request(app).get('/api/admin/attendees.csv')).status, 401)
  assert.equal((await request(app).get('/api/admin/attendees.xlsx')).status, 401)
})
