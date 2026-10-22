// export const ADMIN_PATH = '/gdg-control-panel-7x9'
export const PUBLIC_PATH = '/'
export const LEGACY_ADMIN_PATH = '/admin'

export function routeKind(pathname) {
  if (pathname === PUBLIC_PATH) return 'registration'
  if (pathname === LEGACY_ADMIN_PATH) return 'not-found'
  if (pathname === ADMIN_PATH) return 'admin'
  return 'not-found'
}
