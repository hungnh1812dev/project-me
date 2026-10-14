/**
 * Field validation with any Standard Schema library (zod 3.24+ and 4, valibot, ArkType, ...),
 * without depending on one. The interface is copied from `@standard-schema/spec` 1.1, as the spec
 * invites: https://standardschema.dev
 */

/** The Standard Schema interface (`@standard-schema/spec` `StandardSchemaV1`). */
export interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly '~standard': StandardSchemaV1.Props<Input, Output>;
}

// The namespace mirrors the spec's own types, so a schema from any library fits.
// oxlint-disable-next-line typescript/no-namespace
export declare namespace StandardSchemaV1 {
  interface Props<Input = unknown, Output = Input> {
    readonly version: 1;
    readonly vendor: string;
    readonly validate: (
      value: unknown,
      options?: Options | undefined,
    ) => Result<Output> | Promise<Result<Output>>;
    readonly types?: Types<Input, Output> | undefined;
  }
  type Result<Output> = SuccessResult<Output> | FailureResult;
  interface SuccessResult<Output> {
    readonly value: Output;
    readonly issues?: undefined;
  }
  interface Options {
    readonly libraryOptions?: Record<string, unknown> | undefined;
  }
  interface FailureResult {
    readonly issues: ReadonlyArray<Issue>;
  }
  interface Issue {
    readonly message: string;
    readonly path?: ReadonlyArray<PropertyKey | PathSegment> | undefined;
  }
  interface PathSegment {
    readonly key: PropertyKey;
  }
  interface Types<Input = unknown, Output = Input> {
    readonly input: Input;
    readonly output: Output;
  }
}

/** What a react-hook-form `validate` function returns: `true`, or the error message. */
export type RuleResult = true | string;

const toRuleResult = (result: StandardSchemaV1.Result<unknown>): RuleResult =>
  result.issues ? (result.issues[0]?.message ?? 'Invalid value.') : true;

/**
 * A react-hook-form `validate` function from a schema: `true` when `schema` accepts the value,
 * otherwise the first issue's message. Async schemas give a Promise, which react-hook-form awaits.
 *
 * @example rules={{ validate: schemaRule(z.string().email('Enter a valid email address.')) }}
 */
export function schemaRule(
  schema: StandardSchemaV1,
): (value: unknown) => RuleResult | Promise<RuleResult> {
  return (value) => {
    const result = schema['~standard'].validate(value);
    return result instanceof Promise ? result.then(toRuleResult) : toRuleResult(result);
  };
}
