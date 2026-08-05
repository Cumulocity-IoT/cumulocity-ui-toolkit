/** Token kinds that are fully described by their type. */
export type StructuralTokenType = 'AND' | 'OR' | 'NOT' | 'LPAREN' | 'RPAREN' | 'COMMA' | 'EOF';

/** Token kinds that always carry the matched text. */
export type ValueTokenType = 'OP' | 'IDENT' | 'NUMBER' | 'STRING';

export type TokenType = StructuralTokenType | ValueTokenType;

/**
 * A discriminated union rather than `{ type; value?: string }`: consumers such as
 * `QueryParser.parsePredicate()` read `expect('IDENT').value` as a plain `string`,
 * which an optional property could not guarantee.
 */
type StructuralToken = { [K in StructuralTokenType]: { type: K } }[StructuralTokenType];
type ValueToken = { [K in ValueTokenType]: { type: K; value: string } }[ValueTokenType];

// Distributed per member (rather than `{ type: ValueTokenType; value: string }`)
// so that `Extract<Token, { type: 'IDENT' }>` resolves to a single token shape.
export type Token = StructuralToken | ValueToken;

/** Narrows a token type to its matching token shape. */
export type TokenOfType<T extends TokenType> = Extract<Token, { type: T }>;

export type AstNode =
  | AndNode
  | OrNode
  | NotNode
  | ComparisonNode
  | HasNode
  | HasAnyNode
  | ByGroupIdNode
  | IsInHierarchyOfNode;

export interface AndNode {
  type: 'and';
  nodes: AstNode[];
}

export interface OrNode {
  type: 'or';
  nodes: AstNode[];
}

export interface NotNode {
  type: 'not';
  node: AstNode;
}

export interface ComparisonNode {
  type: 'comparison';
  field: string;
  operator: 'eq' | 'lt' | 'le' | 'gt' | 'ge';
  value: string | number | null;
}

export interface HasNode {
  type: 'has';
  fragment: string;
}

export interface HasAnyNode {
  type: 'hasany';
  fragments: string[];
}

export interface ByGroupIdNode {
  type: 'bygroupid';
  groupIds: number[];
}

export interface IsInHierarchyOfNode {
  type: 'isinhierarchyof';
  ids: number[];
}

export type QueryJson =
  | { __and: QueryJson[] }
  | { __or: QueryJson[] }
  | { __not: QueryJson }
  | { __has: string }
  | { __hasany: string[] }
  | { __bygroupid: number | number[] }
  | { __isinhierarchyof: number | number[] }
  | { [fragment: string]: unknown };
