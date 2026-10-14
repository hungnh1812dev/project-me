import { createElement } from 'react';
import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  isJsonConfig,
  type CheckboxConfig,
  type DatePickerConfig,
  type InputConfig,
  type InputProps,
  type InputStateProps,
  type InputValueProps,
  type JsonConfig,
  type JsonInputConfig,
  type JsonValue,
  type PasswordInputConfig,
  type RadioGroupConfig,
  type SelectConfig,
  type SwitchConfig,
  type TextareaConfig,
} from './inputContract';

/** One filled-in example of every config documented in SPEC.md "The contract". */
const DOCUMENTED_CONFIGS: [string, JsonConfig][] = [
  [
    'Input',
    {
      type: 'email',
      placeholder: 'you@example.com',
      maxLength: 120,
      minLength: 3,
      autoComplete: 'email',
      inputMode: 'email',
      pattern: '.+@.+',
      spellCheck: false,
      autoFocus: true,
      min: 1,
      max: 100,
      step: 1,
    } satisfies InputConfig,
  ],
  [
    'PasswordInput',
    { placeholder: 'Password', autoComplete: 'current-password' } satisfies PasswordInputConfig,
  ],
  ['Textarea', { rows: 4, maxLength: 500, placeholder: 'Describe it' } satisfies TextareaConfig],
  [
    'JsonInput',
    {
      expect: 'object',
      rows: 8,
      label: 'Settings',
      description: 'A JSON object.',
    } satisfies JsonInputConfig,
  ],
  ['Switch', {} satisfies SwitchConfig],
  ['Checkbox', { indeterminate: true } satisfies CheckboxConfig],
  [
    'Select',
    {
      placeholder: 'Pick one',
      options: [
        { value: 'a', label: 'Alpha' },
        { value: 'b', label: 'Beta' },
      ],
    } satisfies SelectConfig,
  ],
  [
    'RadioGroup',
    {
      options: [
        { value: 'x', label: 'Ex' },
        { value: 'y', label: 'Why' },
      ],
      orientation: 'horizontal',
    } satisfies RadioGroupConfig,
  ],
  ['DatePicker', { locale: 'en-GB', placeholder: 'Pick a date' } satisfies DatePickerConfig],
];

describe('documented configs', () => {
  it.each(DOCUMENTED_CONFIGS)('%s config survives a JSON round trip', (_name, config) => {
    expect(JSON.parse(JSON.stringify(config))).toEqual(config);
  });

  it.each(DOCUMENTED_CONFIGS)('%s config passes isJsonConfig', (_name, config) => {
    expect(isJsonConfig(config)).toBe(true);
  });
});

describe('isJsonConfig', () => {
  it.each([
    ['an empty object', {}],
    ['primitives and null', { s: 'a', n: 1.5, z: 0, t: true, f: false, nil: null }],
    ['nested objects and arrays', { a: [1, 'two', null, { b: [true] }], c: { d: { e: [] } } }],
    ['an optional key left undefined', { placeholder: undefined, rows: 3 }],
    ['an object without a prototype', Object.assign(Object.create(null), { a: 1 })],
  ])('accepts %s', (_name, value) => {
    expect(isJsonConfig(value)).toBe(true);
  });

  it.each([
    ['a function value', { onChange: () => undefined }],
    ['a React element', { icon: createElement('span') }],
    ['a Date', { when: new Date(0) }],
    ['undefined inside an array', { list: [1, undefined] }],
    ['a nested function', { a: { b: [{ c: () => 1 }] } }],
    ['a symbol', { s: Symbol('x') }],
    ['a bigint', { b: BigInt(1) }],
    ['NaN', { n: Number.NaN }],
    ['Infinity', { n: Number.POSITIVE_INFINITY }],
    ['a Map', { m: new Map() }],
    ['a class instance', { c: new (class Point {})() }],
    ['a RegExp', { r: /x/ }],
  ])('rejects %s', (_name, value) => {
    expect(isJsonConfig(value)).toBe(false);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a string', 'text'],
    ['a number', 1],
    ['an array', [{ a: 1 }]],
    ['a function', () => undefined],
    ['a Date', new Date(0)],
    ['a React element', createElement('span')],
  ])('rejects %s at the top level', (_name, value) => {
    expect(isJsonConfig(value)).toBe(false);
  });

  it('rejects a cycle instead of recursing forever', () => {
    const cyclic: Record<string, unknown> = { a: 1 };
    cyclic.self = cyclic;
    expect(isJsonConfig(cyclic)).toBe(false);
  });

  it('accepts the same object used twice (shared, not cyclic)', () => {
    const option = { value: 'a', label: 'A' };
    expect(isJsonConfig({ options: [option, option] })).toBe(true);
  });

  it('narrows unknown to JsonConfig', () => {
    const value: unknown = { a: 1 };
    if (isJsonConfig(value)) {
      expectTypeOf(value).toEqualTypeOf<JsonConfig>();
    }
  });
});

describe('contract types', () => {
  it('InputValueProps<T> requires value and onChange(value: T)', () => {
    expectTypeOf<InputValueProps<string>['value']>().toEqualTypeOf<string>();
    expectTypeOf<InputValueProps<boolean>['onChange']>().toEqualTypeOf<(value: boolean) => void>();
    expectTypeOf<InputValueProps<Date | undefined>['onBlur']>().toEqualTypeOf<
      (() => void) | undefined
    >();
    expectTypeOf<InputValueProps<string>['name']>().toEqualTypeOf<string | undefined>();

    // @ts-expect-error value is required
    const noValue: InputValueProps<string> = { onChange: () => undefined };
    // @ts-expect-error onChange is required
    const noOnChange: InputValueProps<string> = { value: '' };
    expect([noValue, noOnChange]).toHaveLength(2);
  });

  it('InputStateProps holds disabled and readOnly only', () => {
    expectTypeOf<InputStateProps>().toEqualTypeOf<{ disabled?: boolean; readOnly?: boolean }>();
  });

  it('InputProps<T, C> combines value, state, Field wiring, config, className and ref', () => {
    type Props = InputProps<string | null, SelectConfig>;
    expectTypeOf<Props['value']>().toEqualTypeOf<string | null>();
    expectTypeOf<Props['config']>().toEqualTypeOf<SelectConfig | undefined>();
    expectTypeOf<Props['className']>().toEqualTypeOf<string | undefined>();
    expectTypeOf<Props['ref']>().toEqualTypeOf<React.Ref<HTMLElement> | undefined>();
    expectTypeOf<Props>().toHaveProperty('id');
    expectTypeOf<Props>().toHaveProperty('aria-invalid');
    expectTypeOf<Props>().toHaveProperty('aria-label');
    expectTypeOf<Props>().toHaveProperty('aria-labelledby');
    expectTypeOf<Props>().toHaveProperty('disabled');
  });

  it('InputProps rejects a defaultValue prop', () => {
    const props: InputProps<string, InputConfig> = {
      value: '',
      onChange: () => undefined,
      // @ts-expect-error there is no defaultValue: inputs are controlled only
      defaultValue: 'x',
    };
    expect(props.value).toBe('');
  });

  it('a config type may hold only JSON values', () => {
    // @ts-expect-error functions are not JSON
    type WithFunction = InputProps<string, { onPick: () => void }>;
    // @ts-expect-error Dates are not JSON
    type WithDate = InputProps<string, { min: Date }>;
    expectTypeOf<WithFunction>().not.toBeNever();
    expectTypeOf<WithDate>().not.toBeNever();
    expectTypeOf<{ a: JsonValue[] }>().toExtend<JsonConfig>();
  });
});
