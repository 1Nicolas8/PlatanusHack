const AppError = require('../errors/AppError');

/**
 * Clave de tenencia de la red.
 *
 * El mismo perfil llega escrito de muchas formas: con y sin `www`, con barra
 * final, con los parametros de campana que LinkedIn pega al copiar. Si cada
 * variante fuera un dueno distinto, una persona terminaria con tres copias
 * parciales de su red y ninguna completa.
 */
function normalizeProfileUrl(raw) {
  const value = String(raw ?? '').trim();
  if (!value) {
    throw AppError.badRequest('Falta la URL del perfil de LinkedIn.');
  }

  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;

  let url;
  try {
    url = new URL(withScheme);
  } catch {
    throw AppError.badRequest(`"${raw}" no es una URL valida.`);
  }

  const slug = url.pathname.match(/^\/in\/([^/]+)/i)?.[1];
  if (!slug) {
    throw AppError.badRequest(
      `"${raw}" no apunta a un perfil de LinkedIn. Tiene que ser linkedin.com/in/tu-nombre.`,
    );
  }

  return `linkedin.com/in/${decodeURIComponent(slug).toLowerCase()}`;
}

module.exports = { normalizeProfileUrl };
