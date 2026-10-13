import { strToU8, zipSync } from 'fflate'

const headers = [
  ['Name', 'name'],
  ['Sr. No.', 'sr_no'],
  ['USN', 'usn'],
  ['Email', 'email'],
  ['Branch', 'branch'],
  ['Year', 'year'],
  ['Ticket reference', 'ticket_reference'],
  ['Fallback ID', 'fallback_id'],
  ['Checked in', 'checked_in'],
  ['Checked in at', 'checked_in_at'],
  ['Registered at', 'registered_at'],
]

function safeCell(value) {
  if (typeof value !== 'string') return value
  return /^[\t\r\n ]*[=+\-@]/.test(value) ? `'${value}` : value
}

export function exportRows(rows) {
  return rows.map((row) => headers.map(([, key]) => safeCell(row[key])))
}

export function createCsv(rows, title = 'Attendees') {
  const values = [headers.map(([label]) => label), ...exportRows(rows)]
  return `${values.map((row) => row.map((value) => {
    const text = String(value ?? '')
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
  }).join(',')).join('\r\n')}\r\n`
}

export function createXlsx(rows, title = 'Attendees') {
  const allRows = [headers.map(([label]) => label), ...exportRows(rows)]
  const xml = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
  const columnName = (index) => {
    let result = ''
    for (let value = index + 1; value; value = Math.floor((value - 1) / 26)) {
      result = String.fromCharCode(65 + ((value - 1) % 26)) + result
    }
    return result
  }
  const cells = allRows.map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((value, columnIndex) => {
    const reference = `${columnName(columnIndex)}${rowIndex + 1}`
    if (typeof value === 'number') return `<c r="${reference}"><v>${value}</v></c>`
    return `<c r="${reference}" t="inlineStr"><is><t>${xml(value)}</t></is></c>`
  }).join('')}</row>`).join('')
  const lastCell = `${columnName(headers.length - 1)}${Math.max(1, allRows.length)}`
  const safeTitle = xml(title.slice(0, 31))
  const files = {
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`),
    '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${safeTitle}" sheetId="1" r:id="rId1"/></sheets></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`),
    'xl/worksheets/sheet1.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${lastCell}"/><sheetData>${cells}</sheetData><autoFilter ref="A1:${lastCell}"/></worksheet>`),
  }
  return Buffer.from(zipSync(files, { level: 6 }))
}
