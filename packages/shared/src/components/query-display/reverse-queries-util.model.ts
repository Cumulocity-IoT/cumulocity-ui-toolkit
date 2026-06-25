export type TokenType =
  | 'AND'
  | 'OR'
  | 'NOT'
  | 'LPAREN'
  | 'RPAREN'
  | 'OP'
  | 'IDENT'
  | 'NUMBER'
  | 'STRING'
  | 'COMMA'
  | 'EOF';

export interface Token {
  type: TokenType;
  value?: string;
}

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
