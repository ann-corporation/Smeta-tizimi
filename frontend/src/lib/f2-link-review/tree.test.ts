import { describe, expect, it } from 'vitest';
import { expandableDepths, flattenVisibleTree, toggleTreeDepth } from './tree';

type Node = { id: number; name: string; children: Node[] };
const tree: Node[] = [{ id: 1, name: 'A', children: [
  { id: 2, name: 'Section', children: [{ id: 3, name: 'unbound leaf', children: [] }] },
  { id: 4, name: 'Other', children: [] },
] }];
const children = (node: Node) => node.children;
const id = (node: Node) => node.id;

describe('large hierarchical workbench tree helpers', () => {
  it('preserves ancestors of matching rows and honors collapsed levels', () => {
    const rows = flattenVisibleTree(tree, children, id, (node) => node.name.includes('unbound'), () => true);
    expect(rows.map((row) => [row.node.id, row.depth])).toEqual([[1, 0], [2, 1], [3, 2]]);
    const collapsed = flattenVisibleTree(tree, children, id, () => true, (nodeId) => nodeId !== 2);
    expect(collapsed.map((row) => row.node.id)).toEqual([1, 2, 4]);
  });

  it('opens/closes every expandable row at one depth without changing other levels', () => {
    expect(expandableDepths(tree, children)).toEqual([0, 1]);
    const openDepthOne = toggleTreeDepth(tree, children, id, new Set([1]), 1, true);
    expect(openDepthOne).toEqual(new Set([1, 2]));
    const closeDepthZero = toggleTreeDepth(tree, children, id, openDepthOne, 0, false);
    expect(closeDepthZero).toEqual(new Set([2]));
  });

  it('processes a 50k flat source list in one visible-tree pass without rendering every match', () => {
    const rows: Node[] = Array.from({ length: 50_000 }, (_, index) => ({
      id: index + 1, name: index === 49_999 ? 'operator issue' : `line ${index}`, children: [],
    }));
    const visible = flattenVisibleTree(rows, children, id, (node) => node.name === 'operator issue', () => true);
    expect(visible).toHaveLength(1);
    expect(visible[0].node.id).toBe(50_000);
  });
});
