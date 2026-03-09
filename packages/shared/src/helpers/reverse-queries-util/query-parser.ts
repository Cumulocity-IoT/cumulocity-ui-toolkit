import { AstNode, Token, TokenType } from './reverse-queries-util.model';
import { Tokenizer } from './string-tokenizer';

export class QueryParser {
  private current: Token;
  private previousToken: Token | null = null;

  constructor(private tokenizer: Tokenizer) {
    this.current = tokenizer.next();
  }

  parse(): AstNode {
    const expr = this.parseOr();

    this.expect('EOF');

    return expr;
  }

  private advance(): Token {
    this.previousToken = this.current;
    this.current = this.tokenizer.next();

    return this.previousToken;
  }

  private peek(): Token {
    return this.current;
  }

  private match(type: TokenType): boolean {
    if (this.current.type === type) {
      this.advance();

      return true;
    }

    return false;
  }

  private expect(type: TokenType): Token {
    if (this.current.type !== type) {
      throw new Error(`Expected ${type}, got ${this.current.type}`);
    }

    return this.advance();
  }

  private parseOr(): AstNode {
    const left = this.parseAnd();
    const nodes = [left];

    while (this.match('OR')) {
      nodes.push(this.parseAnd());
    }

    return nodes.length === 1 ? left : { type: 'or', nodes };
  }

  private parseAnd(): AstNode {
    const left = this.parseUnary();
    const nodes = [left];

    while (this.match('AND')) {
      nodes.push(this.parseUnary());
    }

    return nodes.length === 1 ? left : { type: 'and', nodes };
  }

  private parseUnary(): AstNode {
    if (this.match('NOT')) {
      // Support both: not X  AND  not(X)
      if (this.match('LPAREN')) {
        const expr = this.parseOr();

        this.expect('RPAREN');

        return { type: 'not', node: expr };
      }

      return { type: 'not', node: this.parseUnary() };
    }

    return this.parsePrimary();
  }

  private parsePrimary(): AstNode {
    if (this.match('LPAREN')) {
      const expr = this.parseOr();

      this.expect('RPAREN');

      return expr;
    }

    return this.parsePredicate();
  }

  private parsePredicate(): AstNode {
    const field = this.expect('IDENT').value;

    if (field.toLowerCase() === 'has') {
      // Check if it's function syntax has(...) or comparison syntax has eq/lt/etc
      if (this.peek().type === 'LPAREN') {
        this.expect('LPAREN');
        const fragment = this.expect('IDENT').value;

        this.expect('RPAREN');

        return { type: 'has', fragment };
      }
      // Otherwise treat as normal comparison
    }

    if (field.toLowerCase() === 'bygroupid') {
      // Check if it's function syntax bygroupid(...) or comparison syntax
      if (this.peek().type === 'LPAREN') {
        this.expect('LPAREN');
        const id = Number(this.expect('NUMBER').value);

        this.expect('RPAREN');

        return { type: 'bygroupid', groupId: id };
      }
      // Otherwise treat as normal comparison
    }

    const operator = this.expect('OP').value as 'eq' | 'lt' | 'le' | 'gt' | 'ge';

    return {
      type: 'comparison',
      field,
      operator,
      value: this.parseLiteral(),
    };
  }

  private parseLiteral(): string | number {
    if (this.match('STRING')) {
      return this.previousToken.value;
    }

    if (this.match('NUMBER')) {
      return Number(this.previousToken.value);
    }

    throw new Error(`Expected literal, got ${this.current.type}`);
  }
}
