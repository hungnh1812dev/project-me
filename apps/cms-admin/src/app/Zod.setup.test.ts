import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import './Zod.setup';

const FIRST_IMPORT = /^\s*import\s+(?:[^'"]*from\s+)?'([^']+)'/m;

describe('Zod.setup', () => {
  it('turns Zod JIT off', () => {
    expect(z.config().jitless).toBe(true);
  });

  it('builds and parses an object schema without calling Function', () => {
    const functionSpy = vi.spyOn(globalThis, 'Function');
    const schema = z.object({ a: z.string() });

    expect(schema.parse({ a: 'x' })).toEqual({ a: 'x' });
    expect(functionSpy).not.toHaveBeenCalled();
    functionSpy.mockRestore();
  });

  it('is the first import of main.tsx', () => {
    const mainSource = readFileSync(
      resolve(import.meta.dirname, '../main.tsx'),
      'utf8',
    );

    expect(FIRST_IMPORT.exec(mainSource)?.[1]).toBe('./app/Zod.setup');
  });
});
