/**
 * Lector del export oficial de LinkedIn (`Connections.csv`).
 *
 * Por qué existe: la lista de conexiones de LinkedIn no es pública. Ningún
 * scraper la ve deslogueado, así que la única forma de traer tu primer grado
 * sin ceder una cookie de sesión es tu propio export — dato tuyo, gratis y
 * completo. Se parsea acá y no en el backend para que el archivo no salga del
 * navegador entero: viajan solo las columnas que el análisis usa.
 */

/** CSV con comillas y comas dentro de campo. El export las trae en headlines. */
function parseRows(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"'
        i += 1
      } else if (char === '"') quoted = false
      else field += char
    } else if (char === '"') quoted = true
    else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (char !== '\r') field += char
  }
  if (field || row.length) {
    row.push(field)
    rows.push(row)
  }

  return rows
}

/** Las columnas que el análisis usa. El resto del export no aporta y pesa. */
const COLUMNAS = ['First Name', 'Last Name', 'URL', 'Company', 'Position', 'Connected On']

export class CsvInvalidoError extends Error {}

/**
 * Devuelve las filas listas para el actor, que ya sabe leer estos encabezados.
 *
 * @throws {CsvInvalidoError} si el archivo no es el export de conexiones
 */
export function parseConnectionsCsv(text) {
  const rows = parseRows(text)

  // El export abre con unas líneas de aviso antes del encabezado real, y su
  // cantidad cambió entre versiones: se busca el encabezado, no se saltan N.
  const headerIndex = rows.findIndex((r) => r.some((c) => /first name|url|company/i.test(c)))
  if (headerIndex === -1) {
    throw new CsvInvalidoError(
      'Ese archivo no parece el Connections.csv de LinkedIn: no encuentro la fila de encabezados.',
    )
  }

  const header = rows[headerIndex].map((h) => h.trim())
  const contactos = rows
    .slice(headerIndex + 1)
    .filter((r) => r.length === header.length && r.some((c) => c.trim()))
    .map((r) => {
      const fila = {}
      header.forEach((columna, i) => {
        if (COLUMNAS.includes(columna)) fila[columna] = r[i].trim()
      })
      return fila
    })
    .filter((fila) => fila['First Name'] || fila['Last Name'] || fila.URL)

  if (contactos.length === 0) {
    throw new CsvInvalidoError('El archivo tiene encabezados pero ninguna conexión adentro.')
  }

  return contactos
}
