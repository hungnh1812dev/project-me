import * as ts from 'typescript';

export interface FieldTypeBranch {
  type: string;
  line: number;
}

const EQUALITY_OPERATORS = new Set([
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
]);

function stringLiteralText(node: ts.Node): string | null {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
    ? node.text
    : null;
}

/** `typeof x === 'string'` compares a JS type, not a field type. */
function isTypeofOperand(literal: ts.Node): boolean {
  const comparison = literal.parent;
  if (!ts.isBinaryExpression(comparison)) return false;
  const other =
    comparison.left === literal ? comparison.right : comparison.left;
  return ts.isTypeOfExpression(other);
}

/**
 * Every `case '<type>'` and `=== '<type>'` (either side, also `!==`) whose
 * literal is one of `types`, except `typeof` checks. Branching on a field type belongs to the
 * field-type registry.
 */
export function findFieldTypeBranches(
  code: string,
  types: readonly string[],
): FieldTypeBranch[] {
  const source = ts.createSourceFile(
    'file.ts',
    code,
    ts.ScriptTarget.Latest,
    true,
  );
  const found: FieldTypeBranch[] = [];
  const check = (literal: ts.Node) => {
    if (isTypeofOperand(literal)) return;
    const text = stringLiteralText(literal);
    if (text === null || !types.includes(text)) return;
    found.push({
      type: text,
      line: source.getLineAndCharacterOfPosition(literal.getStart()).line + 1,
    });
  };
  const visit = (node: ts.Node) => {
    if (ts.isCaseClause(node)) check(node.expression);
    if (
      ts.isBinaryExpression(node) &&
      EQUALITY_OPERATORS.has(node.operatorToken.kind)
    ) {
      check(node.left);
      check(node.right);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}
