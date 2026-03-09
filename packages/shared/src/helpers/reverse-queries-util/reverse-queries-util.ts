import { QueryParser } from './query-parser';
import { AstNode, QueryJson } from './reverse-queries-util.model';
import { Tokenizer } from './string-tokenizer';

export class ReverseQueriesUtil {
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
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        throw new Error(`Unknown AST node type: ${ast['type']}`);
      }
    }
  }

  buildQueryJSON(query?: string): object | null {
    if (!query || query.length === 0) {
      return null;
    }

    try {
      // Strip $filter=() wrapper if present
      let processedQuery = query;

      if (processedQuery.startsWith('$filter=')) {
        processedQuery = processedQuery.substring(8); // Remove '$filter='

        if (processedQuery.startsWith('(') && processedQuery.endsWith(')')) {
          processedQuery = processedQuery.slice(1, -1); // Remove outer parentheses
        }
      }

      const parser = new QueryParser(new Tokenizer(processedQuery));
      const syntaxTree = parser.parse();
      const json = this.convert(syntaxTree);
      return json;
    } catch (e) {
      console.error(e);

      return null;
    }
  }
}
