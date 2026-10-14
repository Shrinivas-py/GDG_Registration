const baseUrl = process.env.LOAD_TEST_URL || 'http://localhost:3001'
const count = Number(process.env.LOAD_TEST_COUNT || 250)
const runId = Date.now()

const requests = Array.from({ length: count }, (_, index) => fetch(`${baseUrl}/api/registrations`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    name: `Load Test ${runId}-${index}`,
    sr_no: `${String(index % 100).padStart(2, '0')}-${String(runId + index).slice(-4)}`,
    email: `load-${runId}-${index}@example.invalid`,
    branch: 'CSE',
    year: '1st Year',
  }),
}))

const responses = await Promise.all(requests)
const counts = responses.reduce((result, response) => {
  result[response.status] = (result[response.status] || 0) + 1
  return result
}, {})
console.log(JSON.stringify({ url: baseUrl, count, statuses: counts }, null, 2))
