import test from 'node:test'
import assert from 'node:assert/strict'
import { ADMIN_PATH, LEGACY_ADMIN_PATH, PUBLIC_PATH, routeKind } from '../src/adminRoute.js'

test('resolves the public, admin, legacy, and unknown routes explicitly', () => {
  assert.equal(PUBLIC_PATH, '/')
  assert.equal(ADMIN_PATH, '/gdg-control-panel-7x9')
  assert.equal(LEGACY_ADMIN_PATH, '/admin')
  assert.equal(routeKind('/'), 'registration')
  assert.equal(routeKind('/gdg-control-panel-7x9'), 'admin')
  assert.equal(routeKind('/admin'), 'not-found')
  assert.equal(routeKind('/unknown-path'), 'not-found')
})
