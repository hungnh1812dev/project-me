import { ContentEngineError } from './ContentDocument.entity';
import type { DestructiveChange, MigrationPlan } from './SqlGenerator.rules';

/**
 * A data step is the SQL a developer writes to move data before the destructive
 * statements of a migration run (ADR 0026). Top comment lines declare, one per
 * line, `-- carries <target>` or `-- discards <target>: <reason>`; the rest is
 * DML and `DO` blocks. Pure: the CLI reads the file, the runner is unchanged.
 */
export interface DataStepDeclaration {
  /** `<table>.<column>` or `<table>`, as in `DestructiveChange.target`. */
  target: string;
  kind: 'carries' | 'discards';
  /** Who decided and when; required for `discards`. */
  reason?: string;
}

export interface DataStep {
  /** The file text, trimmed, written verbatim into the migration. */
  body: string;
  declarations: DataStepDeclaration[];
}

export class DataStepError extends ContentEngineError {
  constructor(message: string) {
    super(`Invalid data step: ${message}`);
    this.name = 'DataStepError';
  }
}

const ALLOWED_FIRST_WORDS = new Set(['INSERT', 'UPDATE', 'DELETE', 'SELECT', 'WITH', 'DO']);
const DECLARATION_PATTERN = /^--\s*(carries|discards)\s+(\S+?)(?:\s*:\s*(.*))?$/i;
const TARGET_PATTERN = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)?$/;
const DOLLAR_QUOTE_PATTERN = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/;

export function parseDataStep(sql: string): DataStep {
  const body = sql.trim();
  const declarations = parseDeclarations(body);
  const statements = splitStatements(body);
  if (statements.length === 0) {
    throw new DataStepError('it has no statement besides comments');
  }
  for (const statement of statements) {
    const firstWord = /^[A-Za-z]+/.exec(statement)?.[0].toUpperCase() ?? '';
    if (!ALLOWED_FIRST_WORDS.has(firstWord)) {
      throw new DataStepError(
        `a statement starts with ${firstWord || 'a non-keyword'}; the runner owns the transaction and the DDL (only INSERT, UPDATE, DELETE, SELECT and DO blocks)`,
      );
    }
  }
  return { body, declarations };
}

/** Destructive changes of the plan that the data step does not declare. */
export function undeclaredDestructiveChanges(
  plan: Pick<MigrationPlan, 'destructiveChanges'>,
  dataStep: DataStep,
): DestructiveChange[] {
  const declared = new Set(dataStep.declarations.map(({ target }) => target));
  return plan.destructiveChanges.filter(({ target }) => !declared.has(target));
}

/** Refuses a declaration that names no destructive change of the plan. */
export function assertDeclarationsMatchPlan(
  plan: Pick<MigrationPlan, 'destructiveChanges'>,
  dataStep: DataStep,
): void {
  const targets = new Set(plan.destructiveChanges.map(({ target }) => target));
  for (const { kind, target } of dataStep.declarations) {
    if (!targets.has(target)) {
      throw new DataStepError(`"${kind} ${target}" matches no destructive change of this plan`);
    }
  }
}

function parseDeclarations(body: string): DataStepDeclaration[] {
  const declarations: DataStepDeclaration[] = [];
  for (const rawLine of body.split('\n')) {
    const line = rawLine.trim();
    if (line !== '' && !line.startsWith('--')) break;
    const match = DECLARATION_PATTERN.exec(line);
    if (match === null) continue;
    const [, keyword = '', target = '', rawReason] = match;
    const kind = keyword.toLowerCase() as DataStepDeclaration['kind'];
    const reason = rawReason?.trim();
    if (!TARGET_PATTERN.test(target)) {
      throw new DataStepError(`"${target}" is not a <table>.<column> or <table> target`);
    }
    if (kind === 'carries') {
      declarations.push({ target, kind });
      continue;
    }
    if (!reason) throw new DataStepError(`"discards ${target}" needs a reason (who decided, date)`);
    declarations.push({ target, kind, reason });
  }
  return declarations;
}

/** Splits on `;` outside comments, quotes and dollar-quoted bodies; comments are dropped. */
function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let index = 0;
  const flush = (): void => {
    if (current.trim() !== '') statements.push(current.trim());
    current = '';
  };
  while (index < sql.length) {
    const rest = sql.slice(index);
    if (rest.startsWith('--')) {
      const end = sql.indexOf('\n', index);
      index = end === -1 ? sql.length : end;
    } else if (rest.startsWith('/*')) {
      const end = sql.indexOf('*/', index + 2);
      if (end === -1) throw new DataStepError('a block comment is not closed');
      index = end + 2;
    } else if (rest[0] === "'" || rest[0] === '"') {
      const end = closingQuote(sql, index);
      current += sql.slice(index, end);
      index = end;
    } else if (DOLLAR_QUOTE_PATTERN.test(rest)) {
      const tag = DOLLAR_QUOTE_PATTERN.exec(rest)![0];
      const end = sql.indexOf(tag, index + tag.length);
      if (end === -1) throw new DataStepError(`a ${tag} quoted block is not closed`);
      current += sql.slice(index, end + tag.length);
      index = end + tag.length;
    } else if (rest[0] === ';') {
      flush();
      index += 1;
    } else {
      current += rest[0];
      index += 1;
    }
  }
  flush();
  return statements;
}

/** Index just after the quote that closes the one at `start` (a doubled quote is an escape). */
function closingQuote(sql: string, start: number): number {
  const quote = sql[start];
  let index = start + 1;
  while (index < sql.length) {
    if (sql[index] === quote) {
      if (sql[index + 1] !== quote) return index + 1;
      index += 1;
    }
    index += 1;
  }
  throw new DataStepError(`a ${quote} quote is not closed`);
}
