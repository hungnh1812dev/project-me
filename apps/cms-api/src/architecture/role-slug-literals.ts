import * as ts from 'typescript';

const ACTOR_KIND_PROPERTY = 'kind';
const ACTOR_KIND_TYPE = 'ActorKind';

export interface SlugLiteral {
  slug: string;
  line: number;
}

function isKindAccess(node: ts.Node): boolean {
  return (
    ts.isPropertyAccessExpression(node) &&
    node.name.text === ACTOR_KIND_PROPERTY
  );
}

function isKindProperty(name: ts.PropertyName | undefined): boolean {
  return (
    name !== undefined &&
    (ts.isIdentifier(name) || ts.isStringLiteral(name)) &&
    name.text === ACTOR_KIND_PROPERTY
  );
}

/** `kind: 'x'` in an object or a type literal. */
function isKindPropertyValue(literal: ts.Node): boolean {
  const holder = ts.isLiteralTypeNode(literal.parent)
    ? literal.parent.parent
    : literal.parent;
  return (
    (ts.isPropertyAssignment(holder) || ts.isPropertySignature(holder)) &&
    isKindProperty(holder.name)
  );
}

/** `actor.kind === 'x'` and its negations. */
function isKindComparison(literal: ts.Node): boolean {
  const parent = literal.parent;
  if (!ts.isBinaryExpression(parent)) return false;
  const other = parent.left === literal ? parent.right : parent.left;
  return isKindAccess(other);
}

/** `case 'x':` inside a `switch (actor.kind)`. */
function isKindCase(literal: ts.Node): boolean {
  const clause = literal.parent;
  if (!ts.isCaseClause(clause)) return false;
  const switchStatement = clause.parent.parent;
  return isKindAccess(switchStatement.expression);
}

/** An array typed `satisfies readonly ActorKind[]`. */
function isActorKindList(literal: ts.Node): boolean {
  if (!ts.isArrayLiteralExpression(literal.parent)) return false;
  for (let node = literal.parent.parent; node; node = node.parent) {
    if (ts.isSatisfiesExpression(node)) {
      return node.type.getText().includes(ACTOR_KIND_TYPE);
    }
    if (!ts.isAsExpression(node) && !ts.isParenthesizedExpression(node)) {
      return false;
    }
  }
  return false;
}

function isActorKindUse(literal: ts.Node): boolean {
  return (
    isKindPropertyValue(literal) ||
    isKindComparison(literal) ||
    isKindCase(literal) ||
    isActorKindList(literal)
  );
}

/**
 * Every string literal in `text` equal to one of `slugs`, except where it
 * names an actor kind by its code context (`kind:`, a comparison with
 * `.kind`, a `case` of `switch (x.kind)`, a list typed `ActorKind[]`).
 * Comments are never string literals, so they are not scanned.
 */
export function findRoleSlugLiterals(
  text: string,
  slugs: readonly string[],
): SlugLiteral[] {
  const source = ts.createSourceFile(
    'scanned.ts',
    text,
    ts.ScriptTarget.Latest,
    true,
  );
  const found: SlugLiteral[] = [];
  const visit = (node: ts.Node): void => {
    if (
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
      slugs.includes(node.text) &&
      !isActorKindUse(node)
    ) {
      const { line } = source.getLineAndCharacterOfPosition(node.getStart());
      found.push({ slug: node.text, line: line + 1 });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}
