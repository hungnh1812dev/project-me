// Copy functions take a name, a count or a list of positions; the first sample a function accepts is used.
const SAMPLE_ARGUMENTS: readonly unknown[] = ['SAMPLE', 3, [1, 2]];

const callWithFirstAcceptedSample = (
  copyFunction: (argument: unknown) => unknown,
) => {
  for (const sample of SAMPLE_ARGUMENTS) {
    try {
      return copyFunction(sample);
    } catch {
      continue;
    }
  }
  throw new Error('No sample argument fits this copy function');
};

/** Plain-data view of a copy tree: functions are replaced by their result for a sample argument. */
export const toComparableCopy = (node: unknown): unknown => {
  if (typeof node === 'function') {
    return callWithFirstAcceptedSample(node as (argument: unknown) => unknown);
  }
  if (node !== null && typeof node === 'object') {
    return Object.fromEntries(
      Object.entries(node).map(([key, value]) => [
        key,
        toComparableCopy(value),
      ]),
    );
  }
  return node;
};
