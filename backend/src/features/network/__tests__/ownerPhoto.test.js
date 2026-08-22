const { pickOwnerPhoto } = require('../ownerPhoto');

describe('pickOwnerPhoto', () => {
  it('toma la foto del autor anidado que trae harvestapi', () => {
    expect(
      pickOwnerPhoto([
        {
          text: 'hola',
          raw: {
            author: {
              name: 'Thomas',
              profilePictures: [{ url: 'https://media.licdn.com/dms/image/yo.jpg', width: 100 }],
            },
          },
        },
      ]),
    ).toBe('https://media.licdn.com/dms/image/yo.jpg');
  });

  it('acepta el campo plano si el scraper no anida', () => {
    expect(
      pickOwnerPhoto([{ authorPhoto: 'https://img.example/me.jpg', text: 'hola' }]),
    ).toBe('https://img.example/me.jpg');
  });

  it('sin foto en ningún post devuelve null', () => {
    expect(pickOwnerPhoto([{ text: 'hola' }])).toBeNull();
    expect(pickOwnerPhoto([])).toBeNull();
  });
});

describe('formato real de harvestapi', () => {
  it('lee la foto cuando avatar es un objeto, no un string', () => {
    // Forma medida contra el dataset real: `author.avatar` viene como
    // {url, width, height}, no como string. `firstHttpUrl` solo aceptaba
    // strings, asi que descartaba el objeto y devolvia null aunque la foto
    // estuviera ahi — el sintoma era "el dueño no tiene foto".
    const foto = pickOwnerPhoto([
      {
        type: 'post',
        author: {
          name: 'Juan Nicolas Torrente Heredia',
          avatar: { url: 'https://media.licdn.com/dms/image/v2/foto.jpg', width: 800 },
        },
      },
    ]);

    expect(foto).toBe('https://media.licdn.com/dms/image/v2/foto.jpg');
  });

  it('sobrevive a normalizePosts, que mete el crudo bajo raw', () => {
    const foto = pickOwnerPhoto([
      { raw: { author: { avatar: { url: 'https://media.licdn.com/x.jpg' } } } },
    ]);

    expect(foto).toBe('https://media.licdn.com/x.jpg');
  });

  it('un avatar sin url no rompe: sigue buscando en el resto', () => {
    const foto = pickOwnerPhoto([
      { author: { avatar: {} } },
      { author: { avatar: { url: 'https://media.licdn.com/segundo.jpg' } } },
    ]);

    expect(foto).toBe('https://media.licdn.com/segundo.jpg');
  });
});
