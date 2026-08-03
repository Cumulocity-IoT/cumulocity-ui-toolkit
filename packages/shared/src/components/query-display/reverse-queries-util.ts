import { AstNode, QueryJson } from './reverse-queries-util.model';
import { QueryParser } from './query-parser';
import { Tokenizer } from './string-tokenizer';

/**
 * Parses a Cumulocity OData-style query string back into a `QueryJson` object
 * compatible with `@c8y/client`'s `QueriesUtil.buildQuery()`.
 *
 * This is the inverse of `QueriesUtil.buildQuery()` — useful for deserialising
 * stored query strings so they can be merged with additional clauses before
 * being re-serialised.
 *
 * @example
 * const util = new ReverseQueriesUtil();
 * const json = util.buildQueryJSON("has(c8y_IsDevice) and type eq 'Pump'");
 * // → { __and: [{ __has: 'c8y_IsDevice' }, { type: 'Pump' }] }
 */
export class ReverseQueriesUtil {
  private convert(ast: AstNode): QueryJson {
    switch (ast.type) {
      case 'and':
        return { __and: ast.nodes.map((node) => this.convert(node)) };

      case 'or':
        return { __or: ast.nodes.map((node) => this.convert(node)) };

      case 'not':
        return { __not: this.convert(ast.node) };

      case 'has':
        return { __has: ast.fragment };

      case 'hasany':
        return { __hasany: ast.fragments };

      case 'bygroupid':
        return { __bygroupid: ast.groupIds.length === 1 ? ast.groupIds[0] : ast.groupIds };

      case 'isinhierarchyof':
        return { __isinhierarchyof: ast.ids.length === 1 ? ast.ids[0] : ast.ids };

      case 'comparison': {
        const { field, operator, value } = ast;

        // eq is implicit in QueriesUtil JSON — no wrapper needed
        if (operator === 'eq') {
          return { [field]: value };
        }

        return { [field]: { [`__${operator}`]: value } };
      }

      default:
        throw new Error(`Unknown AST node type: ${(ast as AstNode)['type']}`);
    }
  }

  /**
   * Converts a query string into a `QueryJson` object, stripping any
   * `$filter=(…)` wrapper first.
   *
   * Returns `null` when the query is empty or cannot be parsed.
   */
  buildQueryJSON(query?: string): QueryJson | null {
    if (!query || query.length === 0) {
      return null;
    }

    try {
      let processed = query.trim();

      if (processed.startsWith('$filter=')) {
        processed = processed.slice('$filter='.length).trim();

        if (processed.startsWith('(') && processed.endsWith(')')) {
          processed = processed.slice(1, -1).trim();
        }
      }

      const parser = new QueryParser(new Tokenizer(processed));
      return this.convert(parser.parse());
    } catch (e) {
      console.error('ReverseQueriesUtil: failed to parse query', e);

      return null;
    }
  }
}
