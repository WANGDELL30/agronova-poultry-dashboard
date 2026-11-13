import { afterEach, describe, expect, it } from 'vitest';

import { DatabaseService } from './database.service.js';

describe('DatabaseService DATABASE_URL (R16)', () => {
  const previous = process.env.DATABASE_URL;
  afterEach(async () => {
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
  });

  it.each(['not a url', 'http://example.invalid', 'postgresql://u:p@localhost:abc/db'])(
    'fails fast at startup on %j instead of reporting the database as down',
    (url) => {
      process.env.DATABASE_URL = url;
      expect(() => new DatabaseService()).toThrow(/DATABASE_URL/);
    },
  );

  it('accepts postgres: and postgresql: URLs and bounds every query', async () => {
    for (const url of ['postgres://u:p@localhost:5432/db', 'postgresql://u:p@localhost/db']) {
      process.env.DATABASE_URL = url;
      const service = new DatabaseService();
      const pool = (service as unknown as { pool: { options: { query_timeout?: number } } }).pool;
      expect(pool.options.query_timeout).toBe(3000);
      await service.onApplicationShutdown();
    }
  });

  it('stays not_configured without DATABASE_URL', async () => {
    delete process.env.DATABASE_URL;
    expect(await new DatabaseService().connectivity()).toBe('not_configured');
  });
});
