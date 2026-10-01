import type { SaytSahifa, SaytScope } from './types';

export const SAYT_TREE_NODE = {
  root: { width: 220, height: 72 },
  scope: { width: 220, height: 64 },
  page: { width: 284, height: 76 },
} as const;

const X_GAP = 36;
const Y_GAP = 14;
const ROOT_TO_SCOPE_GAP = 44;
const SCOPE_TO_PAGE_GAP = 38;
const PADDING = 28;

export const SAYT_SCOPE_ORDER: readonly SaytScope[] = [
  'GLOBAL',
  'COMPANY',
  'PROJECT',
  'OBJECT',
  'USER',
  'LEGACY',
];

export interface SaytTreeNode {
  id: string;
  kind: 'root' | 'scope' | 'page';
  label: string;
  route?: string;
  scope?: SaytScope;
  page?: SaytSahifa;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SaytTreeEdge {
  id: string;
  from: string;
  to: string;
  path: string;
}

export interface SaytTreeLayout {
  width: number;
  height: number;
  root: SaytTreeNode;
  nodes: SaytTreeNode[];
  edges: SaytTreeEdge[];
}

function edgePath(from: SaytTreeNode, to: SaytTreeNode) {
  const fromX = from.x + from.width / 2;
  const fromY = from.y + from.height;
  const toX = to.x + to.width / 2;
  const toY = to.y;
  const bendY = fromY + Math.max(18, (toY - fromY) / 2);
  return `M ${fromX} ${fromY} V ${bendY} H ${toX} V ${toY}`;
}

/**
 * Manifestdan chiziladigan, deterministik yuqoridan-pastga 2D daraxt.
 *
 * Root → scope → page qatlamlari ataylab oddiy: bu panel navigatsiya va
 * biznes scope'ni tushuntiradi, canonical entity relation saqlamaydi.
 * Shuning uchun layout uchun alohida backend yoki qo'lda chizilgan edge yo'q.
 */
export function buildSaytTree(sahifalar: readonly SaytSahifa[]): SaytTreeLayout {
  const groups = SAYT_SCOPE_ORDER
    .map((scope) => ({ scope, pages: sahifalar.filter((page) => page.scope === scope) }))
    .filter((group) => group.pages.length > 0);

  const columnWidth = SAYT_TREE_NODE.page.width;
  const pageY = PADDING + SAYT_TREE_NODE.root.height + ROOT_TO_SCOPE_GAP + SAYT_TREE_NODE.scope.height + SCOPE_TO_PAGE_GAP;
  const canvasWidth = Math.max(
    SAYT_TREE_NODE.root.width + PADDING * 2,
    groups.length * columnWidth + Math.max(0, groups.length - 1) * X_GAP + PADDING * 2,
  );
  let cursorX = PADDING;
  const nodes: SaytTreeNode[] = [];
  const edges: SaytTreeEdge[] = [];

  const pagesByScope = new Map<SaytScope, SaytTreeNode[]>();
  for (const group of groups) {
    const pages: SaytTreeNode[] = [];
    for (const page of group.pages) {
      const node: SaytTreeNode = {
        id: `page:${page.yol}`,
        kind: 'page',
        label: page.nom,
        route: page.yol,
        scope: page.scope,
        page,
        x: cursorX,
        y: pageY + pages.length * (SAYT_TREE_NODE.page.height + Y_GAP),
        ...SAYT_TREE_NODE.page,
      };
      nodes.push(node);
      pages.push(node);
    }
    pagesByScope.set(group.scope, pages);
    cursorX += columnWidth + X_GAP;
  }

  const scopeNodes: SaytTreeNode[] = [];
  cursorX = PADDING;
  for (const group of groups) {
    const pages = pagesByScope.get(group.scope) ?? [];
    const first = pages[0];
    const last = pages[pages.length - 1];
    if (!first || !last) continue;
    const node: SaytTreeNode = {
      id: `scope:${group.scope}`,
      kind: 'scope',
      label: group.scope,
      scope: group.scope,
      x: cursorX + (columnWidth - SAYT_TREE_NODE.scope.width) / 2,
      y: PADDING + SAYT_TREE_NODE.root.height + ROOT_TO_SCOPE_GAP,
      ...SAYT_TREE_NODE.scope,
    };
    scopeNodes.push(node);
    nodes.push(node);
    cursorX += columnWidth + X_GAP;
  }

  const longestColumn = Math.max(0, ...groups.map((group) => group.pages.length));
  const totalHeight = Math.max(pageY + longestColumn * (SAYT_TREE_NODE.page.height + Y_GAP) - Y_GAP + PADDING, SAYT_TREE_NODE.root.height + PADDING * 2);
  const root: SaytTreeNode = {
    id: 'root:tizim-02',
    kind: 'root',
    label: 'TIZIM_02',
    // Gorizontal scroll boshlanganda ham root ko'rinib turadi; katta ekranlarda
    // qolgan scope ustunlari uning o'ng tomonida davom etadi.
    x: PADDING,
    y: PADDING,
    ...SAYT_TREE_NODE.root,
  };
  nodes.unshift(root);

  for (const scope of scopeNodes) {
    edges.push({ id: `${root.id}->${scope.id}`, from: root.id, to: scope.id, path: edgePath(root, scope) });
    for (const page of pagesByScope.get(scope.scope!) ?? []) {
      edges.push({ id: `${scope.id}->${page.id}`, from: scope.id, to: page.id, path: edgePath(scope, page) });
    }
  }

  return { width: canvasWidth, height: totalHeight, root, nodes, edges };
}
