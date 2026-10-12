import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { validateRegistration } from './validation.js'

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

export function createApp({ repository, frontendOrigin = 'http://localhost:5173' } = {}) {
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

  app.get('/api/health', (_req, res) => res.status(200).json({ success: true, message: 'ok' }))

  app.post('/api/registrations', async (req, res) => {
    const result = validateRegistration(req.body)
    if (!result.valid) return res.status(400).json({ success: false, message: 'Please correct the highlighted fields.', errors: result.errors })
    if (result.value.honeypot) return res.status(201).json({ success: true, message: 'Registration submitted successfully.' })
    if (!repository) return res.status(500).json({ success: false, message: 'Registration could not be saved. Please try again later.' })

    try {
      await repository.createRegistration(result.value)
      return res.status(201).json({ success: true, message: 'Registration submitted successfully.' })
    } catch (error) {
      if (error?.code === '23505') {
        return res.status(409).json({ success: false, message: duplicateMessage(error) })
      }
      if (error?.code === '23514') {
        return res.status(400).json({ success: false, message: 'Please correct the highlighted fields.' })
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