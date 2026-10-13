import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import QRCode from 'qrcode'
import { validateRegistration } from './validation.js'
import { ticketReference } from './ticket.js'
import { createCsv, createXlsx } from './adminExport.js'

const duplicateMessages = {
  registrations_sr_no_key: 'This Sr. No. is already registered.',
  registrations_usn_key: 'This USN is already registered.',
  registrations_email_key_key: 'This email is already registered.',
}

function isAllowedOrigin(origin, configuredOrigin) {
  if (!origin) return true
  return configuredOrigin.split(',').map((value) => value.trim()).includes(origin)
}

function duplicateMessage(error) {
  const text = `${error?.constraint || ''} ${error?.message || ''} ${error?.details || ''}`
  for (const [name, message] of Object.entries(duplicateMessages)) {
    if (text.includes(name)) return message
  }
  if (text.includes('(sr_no)')) return 'This Sr. No. is already registered.'
  if (text.includes('(usn)')) return 'This USN is already registered.'
  if (text.includes('(email_key)')) return 'This email is already registered.'
  return 'A registration already exists with these details.'
}

function lookupInput(body) {
  const token = typeof body?.token === 'string' ? body.token.trim() : ''
  const fallbackId = typeof body?.fallback_id === 'string' && /^\d{4}$/.test(body.fallback_id)
    ? Number(body.fallback_id)
    : Number.isInteger(body?.fallback_id) ? body.fallback_id : null
  const reference = typeof body?.ticket_reference === 'string' ? body.ticket_reference.trim().toUpperCase() : ''
  const usn = typeof body?.usn === 'string' ? body.usn.trim().toUpperCase() : ''
  if (token && (token.length > 100 || !/^[a-f0-9]+$/i.test(token))) return null
  if (fallbackId !== null && (fallbackId < 1000 || fallbackId > 9999)) return null
  if (reference && !/^GDG-[A-F0-9]{8}$/.test(reference)) return null
  if (usn && !/^1JS[0-9]{2}[A-Z]{2}[0-9]{3}$/.test(usn)) return null
  const fields = [token, fallbackId, reference, usn].filter((value) => value !== '' && value !== null)
  if (fields.length !== 1) return null
  return { token, fallbackId, ticketReference: reference, usn }
}

function safeCheckinError(res, error) {
  console.error('Admin check-in request failed:', { code: error?.code || 'database_error' })
  return res.status(500).json({ success: false, message: 'The check-in request could not be completed.' })
}

function adminQuery(req, res) {
  const page = Number(req.query.page || 1)
  const pageSize = Number(req.query.page_size || 25)
  const search = typeof req.query.search === 'string'
    ? req.query.search.replace(/[^\w@.+\-() ]/g, '').trim().slice(0, 100)
    : ''
  const filter = req.query.checked_in
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    res.status(400).json({ success: false, message: 'Invalid pagination parameters.' })
    return null
  }

  if (filter !== undefined && filter !== 'true' && filter !== 'false') {
    res.status(400).json({ success: false, message: 'Invalid check-in filter.' })
    return null
  }
  return { page, pageSize, search, checkedIn: filter === undefined ? undefined : filter === 'true' }
}

function ticketFromRegistration(registration, input) {
  return {
    token: registration.qr_token,
    reference: ticketReference(registration.qr_token),
    participant: {
      name: input?.name || registration.name,
      sr_no: input?.sr_no || registration.sr_no,
      usn: input?.usn ?? registration.usn,
      branch: input?.branch || registration.branch,
      year: input?.year || registration.year,
      fallback_id: registration.fallback_id,
    },
  }
}

async function safeTicketResponse(ticket) {
  const qrDataUrl = await QRCode.toDataURL(ticket.token, { errorCorrectionLevel: 'M', margin: 2, width: 360 })
  const { token: _token, ...safeTicket } = ticket
  return { ...safeTicket, qr_data_url: qrDataUrl }
}

function recoveryInput(body) {
  const srNo = typeof body?.sr_no === 'string' ? body.sr_no.trim().toUpperCase() : ''
  if (!/^\d{2}-\d{4}$/.test(srNo)) return null
  return srNo
}

export function createApp({
  repository,
  adminAuth,
  adminAuthConfigured = false,
  frontendOrigin = 'http://localhost:5173',
} = {}) {
  const app = express()
  app.disable('x-powered-by')
  app.use(helmet())
  app.use(cors({
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin, frontendOrigin)) return callback(null, true)
      return callback(new Error('Origin is not allowed.'))
    },
    methods: ['GET', 'POST', 'OPTIONS'],
  }))
  app.use(express.json({ limit: '10kb' }))
  app.use('/api/registrations', rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 120,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) => res.status(429).json({ success: false, message: 'Too many registration attempts. Please try again later.' }),
  }))
  app.use('/api/ticket-recovery', rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) => res.status(429).json({ success: false, message: 'Too many recovery attempts. Please try again later.' }),
  }))
  app.use('/api/admin', rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) => res.status(429).json({ success: false, message: 'Too many authentication attempts. Please try again later.' }),
  }))
  app.use('/api/admin', (req, res, next) => {
    if (!adminAuthConfigured) return res.status(503).json({ success: false, message: 'Admin authentication is not configured.' })
    if (!adminAuth) return res.status(503).json({ success: false, message: 'Admin authentication is unavailable.' })
    return adminAuth(req, res, next)
  })

  app.get('/api/health', (_req, res) => res.status(200).json({ success: true, message: 'ok' }))

  app.post('/api/ticket-recovery', async (req, res) => {
    const input = recoveryInput(req.body)
    const generic = { success: false, message: 'That Sr. No. did not match an existing registration.' }
    if (!input || !repository?.recoverTicketBySrNo) return res.status(400).json(generic)
    try {
      const ticket = await repository.recoverTicketBySrNo(input)
      if (!ticket?.token) return res.status(400).json(generic)
      return res.status(200).json({ success: true, ticket: await safeTicketResponse(ticket) })
    } catch (error) {
      console.error('Ticket recovery request failed:', { code: error?.code || 'database_error' })
      return res.status(400).json(generic)
    }
  })

  app.get('/api/admin/session', (req, res) => res.status(200).json({ success: true, user: req.adminUser }))
  app.get('/api/admin/dashboard', async (req, res) => {
    if (!repository?.getAdminDashboard) return res.status(503).json({ success: false, message: 'Dashboard is unavailable.' })
    try {
      return res.status(200).json({ success: true, dashboard: await repository.getAdminDashboard() })
    } catch (error) {
      console.error('Admin dashboard request failed:', { code: error?.code || 'database_error' })
      return res.status(500).json({ success: false, message: 'Dashboard data could not be loaded.' })
    }
  })
  app.post('/api/admin/check-in/lookup', async (req, res) => {
    const input = lookupInput(req.body)
    if (!input || !repository?.lookupAdminAttendee) return res.status(400).json({ success: false, message: 'Provide one valid ticket token, ticket reference, fallback ID, or USN.' })
    try {
      const result = await repository.lookupAdminAttendee(input)
      if (result.kind === 'not_found') return res.status(404).json({ success: false, result: 'not_found', message: 'No matching attendee was found.' })
      if (result.kind === 'ambiguous') return res.status(409).json({ success: false, result: 'ambiguous', message: 'More than one attendee matches that lookup.' })
      return res.status(200).json({ success: true, result: 'found', attendee: result.attendee })
    } catch (error) {
      return safeCheckinError(res, error)
    }
  })
  app.post('/api/admin/check-in', async (req, res) => {
    const input = lookupInput(req.body)
    if (!input || !repository?.checkInAdminAttendee || !repository?.lookupAdminAttendee) {
      return res.status(400).json({ success: false, message: 'A valid attendee lookup is required before check-in.' })
    }
    try {
      const found = await repository.lookupAdminAttendee(input)
      if (found.kind === 'not_found') return res.status(404).json({ success: false, result: 'not_found', message: 'No matching attendee was found.' })
      if (found.kind === 'ambiguous') return res.status(409).json({ success: false, result: 'ambiguous', message: 'More than one attendee matches that lookup.' })
      const result = await repository.checkInAdminAttendee(found.internalId)
      if (result.kind === 'not_found') return res.status(404).json({ success: false, result: 'not_found', message: 'No matching attendee was found.' })
      if (result.kind === 'already_checked_in') return res.status(200).json({ success: true, result: 'already_checked_in', attendee: result.attendee })
      return res.status(200).json({ success: true, result: 'checked_in', attendee: result.attendee })
    } catch (error) {
      return safeCheckinError(res, error)
    }
  })
  app.post('/api/admin/ticket-recovery', async (req, res) => {
    const input = lookupInput(req.body)
    if (!input || !repository?.getAdminTicket) return res.status(400).json({ success: false, message: 'Provide one valid ticket reference, fallback ID, or USN.' })
    if (input.token) return res.status(400).json({ success: false, message: 'Use a ticket reference, fallback ID, or USN for staff recovery.' })
    try {
      const result = await repository.getAdminTicket(input)
      if (result.kind === 'not_found') return res.status(404).json({ success: false, message: 'No matching attendee was found.' })
      if (result.kind === 'ambiguous') return res.status(409).json({ success: false, message: 'More than one attendee matches that lookup.' })
      return res.status(200).json({ success: true, ticket: await safeTicketResponse(result.ticket) })
    } catch (error) {
      return safeCheckinError(res, error)
    }
  })
  app.get('/api/admin/attendees', async (req, res) => {
    const params = adminQuery(req, res)
    if (!params) return
    if (!repository?.listAdminAttendees) return res.status(503).json({ success: false, message: 'Attendee data is unavailable.' })
    try {
      const result = await repository.listAdminAttendees(params)
      return res.status(200).json({ success: true, ...result, page: params.page, page_size: params.pageSize })
    } catch (error) {
      console.error('Admin attendee list request failed:', { code: error?.code || 'database_error' })
      return res.status(500).json({ success: false, message: 'Attendee data could not be loaded.' })
    }
  })
  app.get('/api/admin/attendance', async (req, res) => {
    const params = adminQuery(req, res)
    if (!params) return
    if (!repository?.listAdminAttendees) return res.status(503).json({ success: false, message: 'Attendance data is unavailable.' })
    try {
      const result = await repository.listAdminAttendees(params)
      return res.status(200).json({ success: true, ...result, page: params.page, page_size: params.pageSize })
    } catch (error) {
      console.error('Admin attendance request failed:', { code: error?.code || 'database_error' })
      return res.status(500).json({ success: false, message: 'Attendance data could not be loaded.' })
    }
  })
  for (const format of ['csv', 'xlsx']) {
    app.get(`/api/admin/attendees.${format}`, async (req, res) => {
      const params = adminQuery(req, res)
      if (!params) return
      if (!repository?.exportAdminAttendees) return res.status(503).json({ success: false, message: 'Export is unavailable.' })
      try {
        const rows = await repository.exportAdminAttendees({ search: params.search, checkedIn: params.checkedIn })
        if (format === 'csv') {
          res.type('text/csv').attachment('gdg-attendees.csv').send(createCsv(rows))
        } else {
          res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').attachment('gdg-attendees.xlsx').send(createXlsx(rows))
        }
      } catch (error) {
        console.error('Admin attendee export failed:', { code: error?.code || 'database_error' })
        return res.status(500).json({ success: false, message: 'Export could not be generated.' })
      }
    })
    app.get(`/api/admin/attendance.${format}`, async (req, res) => {
      const params = adminQuery(req, res)
      if (!params) return
      if (!repository?.exportAdminAttendees) return res.status(503).json({ success: false, message: 'Attendance export is unavailable.' })
      try {
        const rows = await repository.exportAdminAttendees({ search: params.search, checkedIn: params.checkedIn })
        const filename = `gdg-attendance.${format}`
        if (format === 'csv') res.type('text/csv').attachment(filename).send(createCsv(rows, 'Attendance'))
        else res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').attachment(filename).send(createXlsx(rows, 'Attendance'))
      } catch (error) {
        console.error('Admin attendance export failed:', { code: error?.code || 'database_error' })
        return res.status(500).json({ success: false, message: 'Attendance export could not be generated.' })
      }
    })
  }

  app.post('/api/registrations', async (req, res) => {
    const result = validateRegistration(req.body)
    if (!result.valid) return res.status(400).json({ success: false, message: 'Please correct the highlighted fields.', errors: result.errors })
    if (result.value.honeypot) return res.status(201).json({ success: true, message: 'Registration submitted successfully.' })
    if (!repository) return res.status(500).json({ success: false, message: 'Registration could not be saved. Please try again later.' })

    try {
      const saved = await repository.createRegistration(result.value)
      if (!saved?.qr_token || typeof saved.qr_token !== 'string' || !Number.isInteger(saved.fallback_id) || saved.fallback_id < 1000 || saved.fallback_id > 9999) {
        console.error('Registration database response did not include a ticket token.')
        return res.status(500).json({ success: false, message: 'Registration could not be completed. Please try again later.' })
      }
      const ticket = ticketFromRegistration(saved, result.value)
      return res.status(201).json({
        success: true,
        message: 'Registration submitted successfully.',
        ticket: await safeTicketResponse(ticket),
      })
    } catch (error) {
      if (error?.code === '23505') {
        return res.status(409).json({ success: false, message: duplicateMessage(error) })
      }
      if (error?.code === '23514') {
        return res.status(400).json({ success: false, message: 'Please correct the highlighted fields.' })
      }
      if (error?.code === 'P0001' && `${error?.message || ''}`.includes('fallback ID namespace exhausted')) {
        return res.status(503).json({ success: false, message: 'Registration is temporarily unavailable. Please try again later.' })
      }
      console.error('Registration database request failed:', { code: error?.code || 'unknown', message: error?.message })
      return res.status(500).json({ success: false, message: 'Registration could not be saved. Please try again later.' })
    }
  })

  app.use((error, _req, res, _next) => {
    if (error?.message === 'Origin is not allowed.') return res.status(403).json({ success: false, message: 'Request origin is not allowed.' })
    if (error?.type === 'entity.parse.failed') return res.status(400).json({ success: false, message: 'Request body must be valid JSON.' })
    if (error?.type === 'entity.too.large') return res.status(413).json({ success: false, message: 'Request body is too large.' })
    console.error('Unhandled request error:', { type: error?.type || 'unknown' })
    return res.status(500).json({ success: false, message: 'An unexpected server error occurred.' })
  })

  return app
}