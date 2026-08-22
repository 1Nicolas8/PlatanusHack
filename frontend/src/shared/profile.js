/** Utilidades del perfil, compartidas entre features. */

function profileHandle(perfil) {
  return perfil?.match(/linkedin\.com\/in\/([^/?]+)/i)?.[1] ?? "tu perfil";
}

function initialsOf(nombre) {
  return nombre
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}

export { profileHandle, initialsOf };
