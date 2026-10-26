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

    this.warnAboutUnsupportedOperators(filter);

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

  /**
   * `QueriesUtil.buildQuery()` does not render every JSON operator. For the
   * unsupported ones (e.g. `__ne`) it emits the operator key itself in place of
   * the field name — `{ id: { __ne: 2 } }` becomes `(__ne eq 2)`, so the field
   * is lost and the result cannot be converted back faithfully.
   *
   * The expression still parses, so warn instead of failing.
   */
  private warnAboutUnsupportedOperators(filter: string): void {
    const unsupported = filter.match(/(?<![\w.])__[a-z]+(?=\s)/gi);

    if (!unsupported?.length) {
      return;
    }

    console.warn(
      `ReverseQueriesUtil: query contains unsupported operator(s) ${[...new Set(unsupported)].join(
        ', '
      )} used as a field name. ` +
        'The original field name is not part of the query string and cannot be restored.'
    );
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
