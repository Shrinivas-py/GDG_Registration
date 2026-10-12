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
            return { select: () => ({ single: async () => ({ data: { id: 'id-1' }, error: null }) }) }
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
  assert.equal(result.id, 'id-1')
})
