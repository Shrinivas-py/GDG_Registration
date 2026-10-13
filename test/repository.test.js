import assert from 'node:assert/strict'
import test from 'node:test'
import { createRegistrationRepository } from '../server/repository.js'

test('repository inserts the independent registration fields', async () => {
  let call
  const repository = createRegistrationRepository({
    supabase: {
      from: (table) => {
        assert.equal(table, 'registrations')
        return {
          insert: (value) => {
            call = value
            return {
              select: (columns) => {
                assert.equal(columns, 'id, qr_token, fallback_id, email, created_at')
                return { single: async () => ({ data: { id: 'id-1', qr_token: 'token-1', fallback_id: 1000, email: 'ada@example.com' }, error: null }) }
              },
            }
          },
        }
      },
    },
  })

  const result = await repository.createRegistration({
    name: 'Ada Lovelace',
    sr_no: '24-0540',
    usn: null,
    email: 'ada@example.com',
    branch: 'CSE',
    year: '1st Year',
  })

  assert.deepEqual(call, {
    name: 'Ada Lovelace',
    sr_no: '24-0540',
    usn: null,
    email: 'ada@example.com',
    branch: 'CSE',
    year: '1st Year',
  })
  assert.deepEqual(result, { id: 'id-1', qr_token: 'token-1', fallback_id: 1000, email: 'ada@example.com' })
})

test('repository retries a fallback ID collision without retrying other duplicates', async () => {
  let attempts = 0
  const repository = createRegistrationRepository({
    supabase: {
      from: () => ({
        insert: () => {
          attempts += 1
          return {
            select: () => ({
              single: async () => attempts === 1
                ? { data: null, error: { code: '23505', constraint: 'registrations_fallback_id_key' } }
                : { data: { id: 'id-2', qr_token: 'token-2', fallback_id: 1001, email: 'ada@example.com' }, error: null },
            }),
          }
        },
      }),
    },
  })

  const result = await repository.createRegistration({
    name: 'Ada Lovelace',
    sr_no: '24-0540',
    usn: null,
    email: 'ada@example.com',
    branch: 'CSE',
    year: '1st Year',
  })
  assert.equal(attempts, 2)
  assert.equal(result.fallback_id, 1001)
})
