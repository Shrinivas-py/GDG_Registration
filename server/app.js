import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { createRegistrationRepository } from './repository.js'
import { validateRegistration } from './validation.js'

const duplicateConstraints = new Set(['registrations_email_normalized_key', 'registrations_identifier_normalized_key', 'registrations_canonical_sr_no_key'])

function isAllowedOrigin(origin, configuredOrigin) {
  if (!origin) return true
  if (!configuredOrigin) return false
  return configuredOrigin.split(',').map((value) => value.trim()).includes(origin)
}

export function createApp({ repository, frontendOrigin = '' } = {}) {
  const app = express()
  const registrationRepository = repository
  app.disable('x-powered-by')
  app.use(helmet())
  app.use(cors({
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin, frontendOrigin)) return callback(null, true)
      return callback(new Error('Origin is not allowed.'))
    },
    methods: ['POST', 'OPTIONS'],
  }))
  app.use(express.json({ limit: '10kb' }))
  app.use('/api/registrations', rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 120,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { message: 'Too many registration attempts. Please try again later.' },
  }))

  app.post('/api/registrations', async (req, res) => {
    const result = validateRegistration(req.body)
    if (!result.valid) return res.status(400).json({ message: 'Please correct the highlighted fields.', errors: result.errors })
    if (!registrationRepository) return res.status(503).json({ message: 'Registration service is unavailable. Please try again later.' })

    try {
      const saved = await registrationRepository.createRegistration(result.value)
      return res.status(201).json({ id: saved.id, createdAt: saved.created_at })
    } catch (error) {
      if (error?.code === '23505' && duplicateConstraints.has(error.constraint)) {
        const field = error.constraint.includes('email') ? 'email' : 'usnOrSrno'
        return res.status(409).json({ message: field === 'email' ? 'This email address is already registered.' : 'This USN or serial number is already registered.', field })
      }
      const databaseContext = {
        code: error?.code || 'unknown',
        message: error?.message || 'unknown database error',
        details: error?.details || undefined,
        hint: error?.hint || undefined,
        operation: 'create_registration RPC',
      }
      console.error('Registration database request failed:', databaseContext)
      if (['PGRST204', 'PGRST205', 'PGRST202', '42501'].includes(error?.code)) {
        return res.status(503).json({ message: 'Registration service schema or permissions need configuration. Please contact the administrator.' })
      }
      return res.status(503).json({ message: 'Registration could not be saved. Please try again later.' })
    }
  })

  app.use((error, _req, res, _next) => {
    if (error?.message === 'Origin is not allowed.') return res.status(403).json({ message: 'Request origin is not allowed.' })
    if (error?.type === 'entity.parse.failed') return res.status(400).json({ message: 'Request body must be valid JSON.' })
    if (error?.type === 'entity.too.large') return res.status(413).json({ message: 'Request body is too large.' })
    console.error('Unhandled request error:', error?.message || 'unknown request error')
    return res.status(500).json({ message: 'An unexpected server error occurred.' })
  })

  return app
}

export { createRegistrationRepository }
