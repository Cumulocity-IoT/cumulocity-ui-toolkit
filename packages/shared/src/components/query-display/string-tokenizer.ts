import { StructuralTokenType, Token } from './reverse-queries-util.model';

export class Tokenizer {
  private pos = 0;

  constructor(private input: string) {}

  next(): Token {
    const s = this.input;

    while (this.pos < s.length && /\s/.test(s[this.pos])) {
      this.pos++;
    }
    if (this.pos >= s.length) return { type: 'EOF' };

    const ch = s[this.pos];

    if (ch === '(') return this.consume('LPAREN');
    if (ch === ')') return this.consume('RPAREN');
    if (ch === ',') return this.consume('COMMA');

    if (ch === "'" || ch === '"') {
      return this.readString();
    }

    if (/[0-9]/.test(ch)) {
      return this.readNumber();
    }

    if (/[a-zA-Z_]/.test(ch)) {
      return this.readIdentifierOrOperator();
    }

    throw new Error(`Unexpected character: ${ch}`);
  }

  /** Consumes a single character and returns the matching structural token. */
  private consume(type: StructuralTokenType): Token {
    this.pos++;

    return { type };
  }

  private readString(): Token {
    const quote = this.input[this.pos++];
    let value = '';

    while (this.pos < this.input.length && this.input[this.pos] !== quote) {
      value += this.input[this.pos++];
    }

    if (this.pos >= this.input.length) {
      throw new Error(`Unterminated string literal: ${quote}${value}`);
    }

    this.pos++; // skip ending quote

    return { type: 'STRING', value };
  }

  private readNumber(): Token {
    let value = '';

    while (this.pos < this.input.length && /[0-9]/.test(this.input[this.pos])) {
      value += this.input[this.pos++];
    }

    // decimal part
    if (this.pos < this.input.length && this.input[this.pos] === '.') {
      value += this.input[this.pos++];

      while (this.pos < this.input.length && /[0-9]/.test(this.input[this.pos])) {
        value += this.input[this.pos++];
      }
    }

    // optional f/d suffix (Cumulocity float/double literals, e.g. 3.5f, 16.5d)
    if (this.pos < this.input.length && /[fFdD]/.test(this.input[this.pos])) {
      this.pos++;
    }

    return { type: 'NUMBER', value };
  }

  private readIdentifierOrOperator(): Token {
    let value = '';

    while (this.pos < this.input.length && /[a-zA-Z0-9_.]/.test(this.input[this.pos])) {
      value += this.input[this.pos++];
    }

    const lower = value.toLowerCase();

    if (lower === 'and') return { type: 'AND' };
    if (lower === 'or') return { type: 'OR' };
    if (lower === 'not') return { type: 'NOT' };

    const ops = ['eq', 'lt', 'le', 'gt', 'ge'];

    if (ops.includes(lower)) {
      return { type: 'OP', value: lower };
    }

    // Handle operators like __gt, __lt, etc (but not __ne since it's not supported)
    if (value.startsWith('__') && ops.includes(lower.substring(2))) {
      return { type: 'OP', value: lower.substring(2) };
    }

    return { type: 'IDENT', value };
  }
}
