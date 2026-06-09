import { AstNode, QueryJson } from './reverse-queries-util.model';
import { QueryParser } from './parser';
import { Tokenizer } from './tokenizer';

export class ReverseQueriesUtil {
  buildQueryJSON(query?: string): object | null {
    if (!query || query.length === 0) {
      return null;
    }

    try {
      const parser = new QueryParser(new Tokenizer(query));
      const syntaxTree = parser.parse();
      const json = this.convert(syntaxTree);
      return json;
    } catch (e) {
      console.error(e);

      return null;
    }
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
