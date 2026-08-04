import { AstNode, QueryJson } from './reverse-queries-util.model';
import { QueryParser } from './parser';
import { Tokenizer } from './tokenizer';

export class ReverseQueriesUtil {
  buildQueryJSON(query?: string): object | null {
    if (!query || query.length === 0) {
      return null;
    }

    // `QueriesUtil.buildQuery()` returns a full OData-style query string
    // (`$filter=… $orderby=…`); the tokenizer only understands the filter body.
    const filter = this.extractFilter(query);

    if (!filter) {
      return null;
    }

    try {
      const parser = new QueryParser(new Tokenizer(filter));
      const syntaxTree = parser.parse();
      const json = this.convert(syntaxTree);
      return json;
    } catch (e) {
      console.error(e);

      return null;
    }
  }

  /**
   * Returns the filter expression of a query string, accepting both a bare
   * expression and a `$filter=…` prefixed one (optionally followed by
   * `$orderby=…`).
   */
  private extractFilter(query: string): string {
    const trimmed = query.trim();

    if (!trimmed.startsWith('$filter=')) {
      return trimmed;
    }

    const withoutFilter = trimmed.slice('$filter='.length);
    const orderByIndex = withoutFilter.indexOf('$orderby=');

    return (orderByIndex === -1 ? withoutFilter : withoutFilter.slice(0, orderByIndex)).trim();
  }

  private convert(ast: AstNode): QueryJson {
    switch (ast.type) {
      case 'and':
        return {
          __and: ast.nodes.map((node) => this.convert(node)),
        };

      case 'or':
        return {
          __or: ast.nodes.map((node) => this.convert(node)),
        };

      case 'not':
        return {
          __not: this.convert(ast.node),
        };

      case 'has':
        return {
          __has: ast.fragment,
        };

      case 'bygroupid':
        return {
          __bygroupid: ast.groupId,
        };

      case 'comparison': {
        const { field, operator, value } = ast;

        // eq is implicit in QueriesUtil JSON
        if (operator === 'eq') {
          return { [field]: value };
        }

        return {
          [field]: {
            [`__${operator}`]: value,
          },
        };
      }

      default: {
        throw new Error('Unknown AST node type: ' + JSON.stringify(ast));
      }
    }
  }
}
