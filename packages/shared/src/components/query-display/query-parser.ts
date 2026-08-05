import {
  AstNode,
  Token,
  TokenOfType,
  TokenType,
  ValueTokenType,
} from './reverse-queries-util.model';
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

  /**
   * Matches a value-carrying token and returns its text, or `undefined` when the
   * current token is of a different type. Keeps the value narrowing local instead
   * of re-reading `previousToken` as a wide union.
   */
  private matchValue(type: ValueTokenType): string | undefined {
    if (this.current.type !== type) {
      return undefined;
    }

    return this.expect(type).value;
  }

  /** Generic so that `expect('IDENT')` is narrowed to the value-carrying token. */
  private expect<T extends TokenType>(type: T): TokenOfType<T> {
    if (this.current.type !== type) {
      throw new Error(`Expected ${type}, got ${this.current.type}`);
    }

    return this.advance() as TokenOfType<T>;
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
    const lower = field.toLowerCase();

    if (lower === 'has' && this.peek().type === 'LPAREN') {
      this.expect('LPAREN');
      const fragment = this.expect('IDENT').value;

      this.expect('RPAREN');

      return { type: 'has', fragment };
    }

    if (lower === 'hasany' && this.peek().type === 'LPAREN') {
      this.expect('LPAREN');
      const fragments = this.parseIdentList();

      this.expect('RPAREN');

      return { type: 'hasany', fragments };
    }

    if (lower === 'bygroupid' && this.peek().type === 'LPAREN') {
      this.expect('LPAREN');
      const groupIds = this.parseNumberList();

      this.expect('RPAREN');

      return { type: 'bygroupid', groupIds };
    }

    if (lower === 'isinhierarchyof' && this.peek().type === 'LPAREN') {
      this.expect('LPAREN');
      const ids = this.parseNumberList();

      this.expect('RPAREN');

      return { type: 'isinhierarchyof', ids };
    }

    const operator = this.expect('OP').value as 'eq' | 'lt' | 'le' | 'gt' | 'ge';

    return {
      type: 'comparison',
      field,
      operator,
      value: this.parseLiteral(),
    };
  }

  private parseIdentList(): string[] {
    const items: string[] = [this.expect('IDENT').value];

    while (this.match('COMMA')) {
      items.push(this.expect('IDENT').value);
    }

    return items;
  }

  private parseNumberList(): number[] {
    const items: number[] = [Number(this.expect('NUMBER').value)];

    while (this.match('COMMA')) {
      items.push(Number(this.expect('NUMBER').value));
    }

    return items;
  }

  private parseLiteral(): string | number | null {
    const stringValue = this.matchValue('STRING');

    if (stringValue !== undefined) {
      return stringValue;
    }

    const numberValue = this.matchValue('NUMBER');

    if (numberValue !== undefined) {
      return Number(numberValue);
    }

    // null literal
    if (this.current.type === 'IDENT' && this.current.value?.toLowerCase() === 'null') {
      this.advance();

      return null;
    }

    throw new Error(`Expected literal, got ${this.current.type}`);
  }
}
