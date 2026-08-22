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
