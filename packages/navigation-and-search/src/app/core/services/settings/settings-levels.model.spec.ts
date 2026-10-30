import type { AssetHierarchy, AssetNode } from '../asset-store/asset-store.model';
import { settingsLevels } from './settings-levels.model';

function hierarchy(
  nodes: Pick<AssetNode, 'id' | 'type' | 'depth' | 'childIds'>[],
  pending: string[] = []
): AssetHierarchy {
  return {
    byId: new Map(nodes.map((node) => [node.id, node as AssetNode])),
    rootIds: nodes.filter((node) => node.depth === 0).map((node) => node.id),
    rollup: new Map(),
    asOf: '2026-10-30T00:00:00Z',
    mode: 'full',
    pendingChildren: new Set(pending),
  };
}

const node = (id: string, type: string, depth: number, childIds: string[] = []) => ({
  id,
  type,
  depth,
  childIds,
});

describe('settingsLevels', () => {
  const tree = hierarchy([
    node('r1', 'ps_Region', 0, ['f1', 'f2']),
    node('f1', 'ps_WindFarm', 1, ['t1', 't2']),
    node('f2', 'ps_WindFarm', 1, ['t3']),
    node('t1', 'ps_WindTurbine', 2),
    node('t2', 'ps_WindTurbine', 2),
    node('t3', 'ps_WindTurbine', 2),
    node('m1', 'ps_MetMast', 2),
  ]);

  it('lists the tree’s types from the root down, the more common first within a depth', () => {
    const { inTree } = settingsLevels(tree, {});

    expect(inTree.map((level) => level.type)).toEqual([
      'ps_Region',
      'ps_WindFarm',
      'ps_WindTurbine',
      'ps_MetMast',
    ]);
    expect(inTree.map((level) => level.count)).toEqual([1, 2, 3, 1]);
  });

  it('marks a type as a group when any of its assets has children, loaded or pending', () => {
    const levels = settingsLevels(
      hierarchy(
        [node('a', 'line', 0, ['b']), node('b', 'machine', 1), node('c', 'machine', 1)],
        ['c']
      ),
      {}
    ).inTree;

    expect(levels.map((level) => [level.type, level.branch])).toEqual([
      ['line', true],
      ['machine', true],
    ]);
  });

  it('places a type at its shallowest depth', () => {
    const levels = settingsLevels(
      hierarchy([
        node('a', 'site', 0, ['b']),
        node('b', 'machine', 1, ['c']),
        node('c', 'machine', 2),
      ]),
      {}
    ).inTree;

    expect(levels.find((level) => level.type === 'machine')?.depth).toBe(1);
  });

  it('flags the types with their own list and keeps configured types the tree does not show', () => {
    const { inTree, elsewhere } = settingsLevels(tree, {
      ps_WindTurbine: [],
      zz_Old: [],
      aa_Old: [],
    });

    expect(inTree.filter((level) => level.own).map((level) => level.type)).toEqual([
      'ps_WindTurbine',
    ]);
    expect(elsewhere.map((level) => level.type)).toEqual(['aa_Old', 'zz_Old']);
    expect(elsewhere[0]).toEqual(
      jasmine.objectContaining({ depth: null, count: 0, own: true, sampleId: null })
    );
  });

  it('picks a sample asset per type and a leaf without its own list for the default', () => {
    const levels = settingsLevels(tree, { ps_WindTurbine: [] });

    expect(levels.inTree.find((level) => level.type === 'ps_WindFarm')?.sampleId).toBe('f1');
    expect(levels.defaultSampleId).toBe('m1');
    expect(settingsLevels(tree, { ps_WindTurbine: [], ps_MetMast: [] }).defaultSampleId).toBeNull();
  });

  it('skips untyped assets and copes with no hierarchy yet', () => {
    expect(settingsLevels(hierarchy([node('x', '', 0)]), {}).inTree).toEqual([]);
    expect(settingsLevels(null, { a: [] })).toEqual({
      inTree: [],
      elsewhere: [jasmine.objectContaining({ type: 'a' })],
      defaultSampleId: null,
    });
  });
});
