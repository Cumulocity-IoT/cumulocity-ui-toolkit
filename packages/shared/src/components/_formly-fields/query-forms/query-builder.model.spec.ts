import {
  BuilderNode,
  makeNode,
  nodeToJson,
  parseToRoot,
  serializeNode,
} from './query-builder.model';

describe('query-builder.model', () => {
  describe('makeNode', () => {
    it('creates a default comparison', () => {
      expect(makeNode('comparison')).toEqual({
        kind: 'comparison',
        field: '',
        operator: 'eq',
        valueType: 'string',
        value: '',
      });
    });

    it('creates a not node wrapping a comparison', () => {
      const node = makeNode('not');
      expect(node.kind).toBe('not');
      expect(node.child?.kind).toBe('comparison');
    });

    it('creates empty groups', () => {
      expect(makeNode('and')).toEqual({ kind: 'and', children: [] });
      expect(makeNode('or')).toEqual({ kind: 'or', children: [] });
    });
  });

  describe('serializeNode', () => {
    it('returns empty string for an empty group', () => {
      expect(serializeNode({ kind: 'and', children: [] })).toBe('');
    });

    it('prunes incomplete clauses', () => {
      const root: BuilderNode = {
        kind: 'and',
        children: [
          { kind: 'comparison', field: '', operator: 'eq', valueType: 'string', value: 'x' },
          { kind: 'has', fragment: 'c8y_Position' },
        ],
      };
      expect(serializeNode(root)).toBe('has(c8y_Position)');
    });

    it('serializes a string comparison with quotes', () => {
      const root: BuilderNode = {
        kind: 'and',
        children: [{ kind: 'comparison', field: 'type', operator: 'eq', valueType: 'string', value: 'Pump' }],
      };
      expect(serializeNode(root)).toBe("type eq 'Pump'");
    });

    it('serializes a numeric comparison without quotes', () => {
      const root: BuilderNode = {
        kind: 'and',
        children: [{ kind: 'comparison', field: 'count', operator: 'gt', valueType: 'number', value: '0' }],
      };
      // QueriesUtil appends an f-suffix to float operands for gt/ge/lt/le
      expect(serializeNode(root)).toBe('count gt 0f');
    });

    it('serializes null comparisons', () => {
      const root: BuilderNode = {
        kind: 'and',
        children: [{ kind: 'comparison', field: 'owner', operator: 'eq', valueType: 'null', value: '' }],
      };
      expect(serializeNode(root)).toBe('owner eq null');
    });

    it('serializes has / hasany / bygroupid / isinhierarchyof', () => {
      expect(serializeNode({ kind: 'and', children: [{ kind: 'has', fragment: 'c8y_IsDevice' }] })).toBe(
        'has(c8y_IsDevice)'
      );
      expect(
        serializeNode({ kind: 'and', children: [{ kind: 'hasany', fragments: 'a, b' }] })
      ).toBe('hasany(a,b)');
      expect(
        serializeNode({ kind: 'and', children: [{ kind: 'bygroupid', ids: '10300' }] })
      ).toBe('bygroupid(10300)');
      expect(
        serializeNode({ kind: 'and', children: [{ kind: 'isinhierarchyof', ids: '12345' }] })
      ).toBe('isinhierarchyof(12345)');
    });

    it('combines clauses with and', () => {
      const root: BuilderNode = {
        kind: 'and',
        children: [
          { kind: 'has', fragment: 'c8y_Position' },
          { kind: 'comparison', field: 'type', operator: 'eq', valueType: 'string', value: 'Pump' },
        ],
      };
      const result = serializeNode(root);
      expect(result).toContain('has(c8y_Position)');
      expect(result).toContain("type eq 'Pump'");
      expect(result).toContain(' and ');
    });

    it('wraps a negation', () => {
      const root: BuilderNode = {
        kind: 'and',
        children: [
          {
            kind: 'not',
            child: { kind: 'comparison', field: 'type', operator: 'eq', valueType: 'string', value: 'Pump' },
          },
        ],
      };
      expect(serializeNode(root)).toBe("not(type eq 'Pump')");
    });
  });

  describe('parseToRoot round-trips', () => {
    // Single-clause queries serialise back string-identical.
    const identicalCases = [
      "type eq 'Pump'",
      'has(c8y_Position)',
      "not(type eq 'Pump')",
      'bygroupid(10300)',
      'isinhierarchyof(12345)',
    ];

    for (const query of identicalCases) {
      it(`round-trips identically: ${query}`, () => {
        const root = parseToRoot(query);
        expect(root).not.toBeNull();
        expect(serializeNode(root as BuilderNode)).toBe(query);
      });
    }

    // Multi-clause queries are semantically equivalent but QueriesUtil adds
    // explicit per-operand parentheses — assert the round-trip is idempotent.
    const idempotentCases = [
      "has(c8y_Position) and type eq 'Pump'",
      "type eq 'Pump' or type eq 'Valve'",
      "not(type eq 'Pump') and has(c8y_Position)",
    ];

    for (const query of idempotentCases) {
      it(`round-trips idempotently: ${query}`, () => {
        const once = serializeNode(parseToRoot(query) as BuilderNode);
        const twice = serializeNode(parseToRoot(once) as BuilderNode);
        expect(twice).toBe(once);
      });
    }

    it('wraps a single leaf in an and-group root', () => {
      const root = parseToRoot("type eq 'Pump'");
      expect(root?.kind).toBe('and');
      expect(root?.children?.length).toBe(1);
      expect(root?.children?.[0].kind).toBe('comparison');
    });

    it('returns null for unparseable input', () => {
      expect(parseToRoot('type eq')).toBeNull();
    });
  });

  describe('nodeToJson', () => {
    it('returns null for an empty group', () => {
      expect(nodeToJson({ kind: 'and', children: [] })).toBeNull();
    });

    it('unwraps a single-child group', () => {
      expect(nodeToJson({ kind: 'and', children: [{ kind: 'has', fragment: 'x' }] })).toEqual({
        __has: 'x',
      });
    });
  });
});
