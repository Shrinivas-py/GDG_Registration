import assert from 'node:assert/strict'
import test from 'node:test'
import { createRegistrationRepository } from '../server/repository.js'

test('repository sends validated registration data to the atomic RPC', async () => {
  let call
  const repository = createRegistrationRepository({
    supabase: {
      rpc: async (name, params) => {
        call = { name, params }
        return { data: [{ id: 'id-1', created_at: '2026-10-11T00:00:00Z' }], error: null }
      },
    },
  })

  const result = await repository.createRegistration({
    name: 'Ada Lovelace',
    usnOrSrno: '00042',
    email: 'ada@example.com',
    branch: 'CSE',
    year: '1st Year',
  })

  assert.equal(call.name, 'create_registration')
  assert.deepEqual(call.params, {
    p_name: 'Ada Lovelace',
    p_usn_or_srno: '00042',
    p_email: 'ada@example.com',
    p_branch: 'CSE',
    p_year: '1st Year',
  })
  assert.equal(result.id, 'id-1')
})

test('repository propagates schema, permission, and network errors', async () => {
  for (const code of ['PGRST204', 'PGRST205', '42501']) {
    const repository = createRegistrationRepository({
      supabase: {
        rpc: async () => ({ data: null, error: { code, message: 'test error' } }),
      },
    })
    await assert.rejects(
      repository.createRegistration({ name: 'A', usnOrSrno: '1', email: 'a@example.com', branch: 'CSE', year: '1st Year' }),
      (error) => error.code === code,
    )
  }
})
