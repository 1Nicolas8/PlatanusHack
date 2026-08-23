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

describe('reposts: el autor del post no siempre es el dueño', () => {
  // Medido contra el dataset real de juan-nicolas-torrente: 2 de 7 posts eran
  // reposts de Syndel Callisaya. Tomar el primer post a ciegas muestra la cara
  // de otra persona cuando la publicacion mas reciente es un repost — que es
  // exactamente lo que se veia en algunos perfiles.
  const propio = {
    author: {
      publicIdentifier: 'juan-nicolas-torrente',
      name: 'Juan Nicolas Torrente',
      avatar: { url: 'https://media.licdn.com/yo.jpg' },
    },
  };
  const repost = {
    author: {
      publicIdentifier: 'syndelcallisaya',
      name: 'Syndel Callisaya',
      avatar: { url: 'https://media.licdn.com/otra-persona.jpg' },
    },
  };

  it('ignora el repost aunque venga primero', () => {
    const foto = pickOwnerPhoto([repost, propio], 'https://linkedin.com/in/juan-nicolas-torrente');
    expect(foto).toBe('https://media.licdn.com/yo.jpg');
  });

  it('sin ningun post propio devuelve null, no la cara de otro', () => {
    // Preferir nada antes que la persona equivocada: una foto ajena presentada
    // como el dueño es peor que un placeholder.
    expect(pickOwnerPhoto([repost], 'https://linkedin.com/in/juan-nicolas-torrente')).toBeNull();
  });

  it('empareja aunque la URL venga con www, barra final o querystring', () => {
    const foto = pickOwnerPhoto([propio], 'https://www.linkedin.com/in/juan-nicolas-torrente/?trk=x');
    expect(foto).toBe('https://media.licdn.com/yo.jpg');
  });

  it('sin perfil de referencia se comporta como antes', () => {
    expect(pickOwnerPhoto([propio])).toBe('https://media.licdn.com/yo.jpg');
  });
});
