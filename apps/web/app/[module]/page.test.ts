import { describe, expect, it } from 'vitest';

import * as modulePage from './page';

describe('operations module route', () => {
  it('only serves the seven pre-rendered modules (unknown slugs are not rendered on demand)', () => {
    expect(modulePage.dynamicParams).toBe(false);
    expect(modulePage.generateStaticParams()).toHaveLength(7);
  });
});
