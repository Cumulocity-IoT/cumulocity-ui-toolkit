import { AstNode, Token, TokenType } from './reverse-queries-util.model';
import { Tokenizer } from './tokenizer';

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

  /** Like `expect`, for the token types the tokenizer always attaches a value to. */
  private expectValue(type: TokenType): string {
    const token = this.expect(type);

    if (token.value === undefined) {
      throw new Error(`Expected ${type} to carry a value`);
    }

    return token.value;
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
    const field = this.expectValue('IDENT');

    if (field.toLowerCase() === 'has') {
      this.expect('LPAREN');
      const fragment = this.expectValue('IDENT');

      this.expect('RPAREN');

      return { type: 'has', fragment };
    }

    if (field.toLowerCase() === 'bygroupid') {
      this.expect('LPAREN');
      // Group ids are opaque identifiers; keep them as written in the query.
      const id = this.expectValue('NUMBER');

      this.expect('RPAREN');

      return { type: 'bygroupid', groupId: id };
    }

    const operator = this.expectValue('OP') as 'eq' | 'lt' | 'le' | 'gt' | 'ge';

    return {
      type: 'comparison',
      field,
      operator,
      value: this.parseLiteral(),
    };
  }

  private parseLiteral(): string | number {
    if (this.current.type === 'STRING') {
      return this.expectValue('STRING');
    }

    if (this.current.type === 'NUMBER') {
      return Number(this.expectValue('NUMBER'));
    }

    throw new Error(`Expected literal, got ${this.current.type}`);
  }
}
