import { AstNode } from './reverse-queries-util.model';
import { QueryParser } from './query-parser';
import { Tokenizer } from './string-tokenizer';

function parse(query: string): AstNode {
  return new QueryParser(new Tokenizer(query)).parse();
}

describe('QueryParser', () => {
  describe('has()', () => {
    it('parses has(fragment)', () => {
      expect(parse('has(c8y_IsDevice)')).toEqual({ type: 'has', fragment: 'c8y_IsDevice' });
    });
  });

  describe('hasany()', () => {
    it('parses hasany with one argument', () => {
      expect(parse('hasany(c8y_IsDevice)')).toEqual({
        type: 'hasany',
        fragments: ['c8y_IsDevice'],
      });
    });

    it('parses hasany with multiple arguments', () => {
      expect(parse('hasany(c8y_IsDevice, c8y_Position, c8y_Firmware)')).toEqual({
        type: 'hasany',
        fragments: ['c8y_IsDevice', 'c8y_Position', 'c8y_Firmware'],
      });
    });
  });

  describe('bygroupid()', () => {
    it('parses single-arg bygroupid', () => {
      expect(parse('bygroupid(12)')).toEqual({ type: 'bygroupid', groupIds: [12] });
    });

    it('parses multi-arg bygroupid', () => {
      expect(parse('bygroupid(12, 23)')).toEqual({ type: 'bygroupid', groupIds: [12, 23] });
    });
  });

  describe('isinhierarchyof()', () => {
    it('parses single-arg isinhierarchyof', () => {
      expect(parse('isinhierarchyof(100)')).toEqual({ type: 'isinhierarchyof', ids: [100] });
    });

    it('parses multi-arg isinhierarchyof', () => {
      expect(parse('isinhierarchyof(100, 200, 300)')).toEqual({
        type: 'isinhierarchyof',
        ids: [100, 200, 300],
      });
    });
  });

  describe('comparisons', () => {
    it('parses string eq', () => {
      expect(parse("type eq 'Pump'")).toEqual({
        type: 'comparison',
        field: 'type',
        operator: 'eq',
        value: 'Pump',
      });
    });

    it('parses numeric gt', () => {
      expect(parse('c8y_ActiveAlarmsStatus.critical gt 0')).toEqual({
        type: 'comparison',
        field: 'c8y_ActiveAlarmsStatus.critical',
        operator: 'gt',
        value: 0,
      });
    });

    it('parses decimal number with f suffix', () => {
      const node = parse('temperature gt 3.5f');
      expect(node).toEqual({ type: 'comparison', field: 'temperature', operator: 'gt', value: 3.5 });
    });

    it('parses decimal number with d suffix', () => {
      const node = parse('temperature ge 16.5d');
      expect(node).toEqual({
        type: 'comparison',
        field: 'temperature',
        operator: 'ge',
        value: 16.5,
      });
    });

    it('parses null literal', () => {
      expect(parse('name eq null')).toEqual({
        type: 'comparison',
        field: 'name',
        operator: 'eq',
        value: null,
      });
    });
  });

  describe('logical operators', () => {
    it('parses and expression', () => {
      const result = parse("has(c8y_IsDevice) and type eq 'Pump'");
      expect(result.type).toBe('and');
      if (result.type === 'and') {
        expect(result.nodes).toHaveSize(2);
        expect(result.nodes[0]).toEqual({ type: 'has', fragment: 'c8y_IsDevice' });
      }
    });

    it('parses or expression', () => {
      const result = parse("type eq 'A' or type eq 'B'");
      expect(result.type).toBe('or');
    });

    it('parses not expression', () => {
      const result = parse('not(has(c8y_IsDevice))');
      expect(result.type).toBe('not');
      if (result.type === 'not') {
        expect(result.node).toEqual({ type: 'has', fragment: 'c8y_IsDevice' });
      }
    });

    it('parses nested parentheses', () => {
      const result = parse("(has(c8y_IsDevice) and type eq 'Pump') or has(c8y_IsGateway)");
      expect(result.type).toBe('or');
    });
  });
});
