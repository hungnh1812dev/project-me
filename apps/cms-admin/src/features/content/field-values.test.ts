import {
  datetimeToApi,
  datetimeToForm,
  integerToApi,
  jsonToApi,
  jsonToForm,
  numberToForm,
  textToApi,
  textToForm,
} from './field-values';

describe('field values', () => {
  it('maps text and null both ways', () => {
    expect(textToForm(null)).toBe('');
    expect(textToForm('a')).toBe('a');
    expect(textToApi('')).toBeNull();
    expect(textToApi('a')).toBe('a');
  });

  it('maps numbers through text', () => {
    expect(numberToForm(12)).toBe('12');
    expect(numberToForm('12.50')).toBe('12.50');
    expect(numberToForm(null)).toBe('');
    expect(integerToApi('12')).toBe(12);
    expect(integerToApi('')).toBeNull();
  });

  it('round-trips a datetime through the local input format', () => {
    const iso = '2026-03-04T09:30:00.000Z';
    const local = datetimeToForm(iso);
    expect(local).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(datetimeToApi(local)).toBe(iso);
    expect(datetimeToForm(null)).toBe('');
    expect(datetimeToApi('')).toBeNull();
    expect(datetimeToApi('nonsense')).toBeNull();
  });

  it('maps json to pretty text and back', () => {
    expect(jsonToForm(null)).toBe('');
    expect(jsonToApi('')).toBeNull();
    expect(jsonToApi(jsonToForm(['a', { b: 1 }]))).toEqual(['a', { b: 1 }]);
    expect(jsonToApi('{bad')).toBeNull();
  });
});
