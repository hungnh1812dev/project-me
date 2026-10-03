import { describe, expect, it, vi } from 'vitest';

import { describeJsonError, formatJson, parseJson } from './json';

describe('parseJson', () => {
  it.each([
    ['{"a":1}', { a: 1 }],
    ['[1, 2, 3]', [1, 2, 3]],
    ['"text"', 'text'],
    ['42', 42],
    ['true', true],
    ['null', null],
    ['  {"nested": {"deep": [{"x": "y"}]}}  ', { nested: { deep: [{ x: 'y' }] } }],
    ['{"emoji": "é中"}', { emoji: 'é中' }],
  ])('parses %s', (text, value) => {
    expect(parseJson(text)).toEqual({ ok: true, value });
  });

  it('treats an empty or blank field as valid with no value when not required', () => {
    expect(parseJson('')).toEqual({ ok: true, value: undefined });
    expect(parseJson('  \n ')).toEqual({ ok: true, value: undefined });
  });

  it('rejects an empty field when required', () => {
    expect(parseJson(' ', { required: true })).toEqual({
      ok: false,
      message: 'This field is required.',
    });
  });

  it('reports the reason with a 1-based line and column', () => {
    expect(parseJson('{\n  "a": 1\n  "b": 2\n}')).toEqual({
      ok: false,
      message: "Invalid JSON: Expected ',' or '}' after property value (line 3, column 3)",
      line: 3,
      column: 3,
    });
  });

  it('reports the reason alone when the engine gives no position', () => {
    const result = parseJson('abc');

    expect(result).toMatchObject({ ok: false });
    expect(result).not.toHaveProperty('line');
    expect(result.ok === false && result.message).toMatch(/^Invalid JSON: \S/);
    expect(result.ok === false && result.message).not.toContain('is not valid JSON');
  });

  it('rethrows anything that is not a SyntaxError', () => {
    vi.spyOn(JSON, 'parse').mockImplementation(() => {
      throw new RangeError('boom');
    });

    expect(() => parseJson('{}')).toThrow('boom');
  });

  it.each([
    ['{}', 'object', true],
    ['[]', 'object', false],
    ['null', 'object', false],
    ['1', 'object', false],
    ['[]', 'array', true],
    ['{}', 'array', false],
    ['"s"', 'any', true],
  ] as const)('checks %s against expect=%s', (text, expectKind, ok) => {
    const result = parseJson(text, { expect: expectKind });

    expect(result.ok).toBe(ok);
  });

  it('names the expected kind in the message', () => {
    expect(parseJson('[]', { expect: 'object' })).toEqual({
      ok: false,
      message: 'Expected a JSON object.',
    });
    expect(parseJson('{}', { expect: 'array' })).toEqual({
      ok: false,
      message: 'Expected a JSON array.',
    });
  });

  it('accepts an empty optional field whatever the expected kind', () => {
    expect(parseJson('', { expect: 'object' })).toEqual({ ok: true, value: undefined });
  });
});

describe('describeJsonError', () => {
  it('reads "(line L column C)" from V8 messages', () => {
    expect(
      describeJsonError('Unterminated string in JSON at position 2 (line 1 column 3)', '"x'),
    ).toEqual({ reason: 'Unterminated string', line: 1, column: 3 });
  });

  it('derives line and column from a bare V8 position', () => {
    expect(
      describeJsonError("Expected ':' after property name in JSON at position 9", '{\n  "ab" 1}'),
    ).toEqual({ reason: "Expected ':' after property name", line: 2, column: 8 });
  });

  it('reads Firefox messages', () => {
    expect(
      describeJsonError(
        'JSON.parse: unexpected character at line 2 column 5 of the JSON data',
        'ignored',
      ),
    ).toEqual({ reason: 'unexpected character', line: 2, column: 5 });
  });

  it('strips the Safari prefix and keeps a message without a position', () => {
    expect(describeJsonError('JSON Parse error: Unexpected identifier "abc"', 'abc')).toEqual({
      reason: 'Unexpected identifier "abc"',
    });
  });

  it('drops the echoed input from V8 "is not valid JSON" messages', () => {
    expect(describeJsonError('Unexpected token \'a\', "abc" is not valid JSON', 'abc')).toEqual({
      reason: "Unexpected token 'a'",
    });
  });

  it('drops a multi-line echoed input from V8 "is not valid JSON" messages', () => {
    expect(
      describeJsonError('Unexpected token \'a\', "{\n  a" is not valid JSON', '{\n  a'),
    ).toEqual({ reason: "Unexpected token 'a'" });
  });

  it('drops a multi-line tail after a V8 position', () => {
    expect(
      describeJsonError('Unexpected token in JSON at position 4\nwhile parsing', '{\n  a'),
    ).toEqual({ reason: 'Unexpected token', line: 2, column: 3 });
  });

  it('keeps an unknown message as is', () => {
    expect(describeJsonError('Unexpected end of JSON input', '{')).toEqual({
      reason: 'Unexpected end of JSON input',
    });
  });
});

describe('formatJson', () => {
  it('pretty-prints valid text with 2 spaces', () => {
    expect(formatJson('{"a":[1,{"b":"é"}]}')).toBe(
      '{\n  "a": [\n    1,\n    {\n      "b": "é"\n    }\n  ]\n}',
    );
  });

  it('returns invalid or empty text unchanged', () => {
    expect(formatJson('{oops')).toBe('{oops');
    expect(formatJson('  ')).toBe('  ');
  });
});
