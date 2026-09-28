export interface FlatTreeRow<T> { node: T; depth: number }

/** Preorder flattening with collapsed branches and filtered ancestors preserved. O(n). */
export function flattenVisibleTree<T>(
  roots: readonly T[],
  childrenOf: (node: T) => readonly T[],
  idOf: (node: T) => string | number,
  matches: (node: T) => boolean,
  isExpanded: (id: string | number) => boolean,
): FlatTreeRow<T>[] {
  const matchCache = new Map<T, boolean>();
  const subtreeMatches = (node: T): boolean => {
    const cached = matchCache.get(node);
    if (cached != null) return cached;
    const result = matches(node) || childrenOf(node).some(subtreeMatches);
    matchCache.set(node, result);
    return result;
  };
  const rows: FlatTreeRow<T>[] = [];
  const visit = (nodes: readonly T[], depth: number) => {
    for (const node of nodes) {
      if (!subtreeMatches(node)) continue;
      rows.push({ node, depth });
      const id = idOf(node);
      if (childrenOf(node).length && isExpanded(id)) visit(childrenOf(node), depth + 1);
    }
  };
  visit(roots, 0);
  return rows;
}

export function expandableDepths<T>(
  roots: readonly T[],
  childrenOf: (node: T) => readonly T[],
): number[] {
  const depths = new Set<number>();
  const visit = (nodes: readonly T[], depth: number) => {
    for (const node of nodes) {
      const children = childrenOf(node);
      if (children.length) depths.add(depth);
      visit(children, depth + 1);
    }
  };
  visit(roots, 0);
  return [...depths].sort((a, b) => a - b);
}

export function expandableIdsAtDepth<T>(
  roots: readonly T[],
  childrenOf: (node: T) => readonly T[],
  idOf: (node: T) => string | number,
  depth: number,
): Array<string | number> {
  const ids: Array<string | number> = [];
  const visit = (nodes: readonly T[], at: number) => {
    for (const node of nodes) {
      const children = childrenOf(node);
      if (at === depth && children.length) ids.push(idOf(node));
      visit(children, at + 1);
    }
  };
  visit(roots, 0);
  return ids;
}

export function toggleTreeDepth<T>(
  roots: readonly T[],
  childrenOf: (node: T) => readonly T[],
  idOf: (node: T) => string | number,
  current: ReadonlySet<string | number>,
  depth: number,
  expanded: boolean,
): Set<string | number> {
  const next = new Set(current);
  const visit = (nodes: readonly T[], at: number) => {
    for (const node of nodes) {
      const children = childrenOf(node);
      if (at === depth && children.length) {
        const id = idOf(node);
        if (expanded) next.add(id); else next.delete(id);
      }
      visit(children, at + 1);
    }
  };
  visit(roots, 0);
  return next;
}
