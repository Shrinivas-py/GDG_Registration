export function ticketReference(token) {
  return `GDG-${token.slice(0, 8).toUpperCase()}`
}
