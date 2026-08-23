const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizePosts, parseMetric, pickPostUrl, summarizePostMetrics } = require('../src/posts');

/**
 * Forma medida de harvestapi/linkedin-profile-posts: métricas anidadas en
 * `engagement`, autor en `{name, avatar:{url}}`, URL del post en `linkedinUrl`.
 * Buscar `post.likes` o `post.reactions` en la raíz da null en todos.
 */
function harvestPost({ likes, comments = 0, shares = 0, content = 'texto' }) {
  return {
    type: 'post',
    content,
    postedAt: '2024-06-01T12:00:00.000Z',
    linkedinUrl: 'https://www.linkedin.com/posts/juan-nicolas-torrente_demo',
    author: {
      name: 'Juan Nicolas Torrente Heredia',
      avatar: { url: 'https://media.licdn.com/dms/image/v2/foto.jpg' },
      linkedinUrl: 'https://www.linkedin.com/in/juan-nicolas-torrente',
    },
    engagement: {
      likes,
      comments,
      shares,
      reactions: [
        { type: 'LIKE', count: Math.min(likes, 20) },
        { type: 'PRAISE', count: Math.max(likes - 20, 0) },
      ],
    },
  };
}

const TORRENTE = [33, 50, 109, 43, 66, 19, 13];

test('lee las métricas anidadas en engagement, no las planas de la raíz', () => {
  const [post] = normalizePosts([harvestPost({ likes: 33, comments: 3, shares: 0 })]);

  assert.equal(post.reactions, 33);
  assert.equal(post.comments, 3);
  assert.equal(post.shares, 0);
  assert.equal(post.impressions, null);
  assert.equal(post.metricsAvailable.reactions, true);
  assert.equal(post.metricsAvailable.impressions, false);
});

test('el autor anidado y la URL del post no se pierden', () => {
  const [post] = normalizePosts([harvestPost({ likes: 33 })]);

  assert.equal(post.author, 'Juan Nicolas Torrente Heredia');
  assert.equal(post.url, 'https://www.linkedin.com/posts/juan-nicolas-torrente_demo');
  assert.equal(post.mediaType, '');
});

test('linkedinUrl del post gana sobre el linkedinUrl del autor (que es el perfil)', () => {
  const url = pickPostUrl(harvestPost({ likes: 1 }));
  assert.equal(url, 'https://www.linkedin.com/posts/juan-nicolas-torrente_demo');
  assert.doesNotMatch(url, /\/in\//);
});

test('el promedio de Torrente da 47.6 — 7 posts públicos medidos', () => {
  const posts = normalizePosts(TORRENTE.map((likes) => harvestPost({ likes })));
  const resumen = summarizePostMetrics(posts);

  assert.deepEqual(posts.map((p) => p.reactions), TORRENTE);
  assert.equal(resumen.conMetrica, 7);
  assert.equal(resumen.promedioReacciones.toFixed(1), '47.6');
});

test('un post sin métrica no entra al promedio como cero', () => {
  const posts = normalizePosts([
    harvestPost({ likes: 33 }),
    { type: 'post', content: 'sin engagement' },
  ]);
  const resumen = summarizePostMetrics(posts);

  assert.equal(resumen.posts, 2);
  assert.equal(resumen.conMetrica, 1);
  assert.equal(resumen.promedioReacciones, 33);
  assert.equal(posts[1].reactions, null);
});

test('cero reacciones es un dato, no un ausente', () => {
  const [post] = normalizePosts([harvestPost({ likes: 0 })]);
  const resumen = summarizePostMetrics([post]);

  assert.equal(post.reactions, 0);
  assert.equal(post.metricsAvailable.reactions, true);
  assert.equal(resumen.promedioReacciones, 0);
});

test('un export plano sigue funcionando: no se exige el anidamiento', () => {
  const [post] = normalizePosts([{
    text: 'export csv',
    reactions: 12,
    comments: 1,
    shares: 2,
    impressions: 400,
    url: 'https://linkedin.com/posts/plano',
    author: 'Ana',
  }]);

  assert.equal(post.reactions, 12);
  assert.equal(post.impressions, 400);
  assert.equal(post.url, 'https://linkedin.com/posts/plano');
  assert.equal(post.author, 'Ana');
});

test('postedAt anidado no deja la fecha vacía', () => {
  const [post] = normalizePosts([{
    type: 'post',
    content: 'hola',
    postedAt: {
      timestamp: 1780248753577,
      date: '2026-05-31T17:32:33.577Z',
      postedAgoText: '2 months ago',
    },
    engagement: { likes: 1 },
  }]);
  assert.equal(post.date, '2026-05-31T17:32:33.577Z');
});

test('el array de reacciones por tipo no se toma como el total', () => {
  assert.equal(parseMetric([{ type: 'LIKE', count: 20 }]), null);
  const [post] = normalizePosts([{
    type: 'post',
    content: 'solo desglose',
    engagement: { likes: 33, reactions: [{ type: 'LIKE', count: 20 }] },
  }]);
  assert.equal(post.reactions, 33);
});
