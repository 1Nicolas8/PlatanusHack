require('dotenv').config();

/**
 * Prisma 7 moved connection URLs out of schema.prisma into this file.
 *
 * `datasource.url` is used by Prisma Migrate only. It must point at the
 * Supabase *session* pooler (port 5432), not the transaction pooler (6543),
 * because DDL cannot run over a transaction-mode pgbouncer connection.
 */
module.exports = {
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DIRECT_URL,
  },
};
