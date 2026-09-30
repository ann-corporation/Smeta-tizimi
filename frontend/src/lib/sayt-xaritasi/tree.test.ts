import { describe, expect, it } from 'vitest';
import { SAHIFA_KATALOGI } from './pageCatalog';
import { buildSaytTree } from './tree';

describe('sayt xaritasi 2D daraxt layouti', () => {
  it('canonical katalogdan root → scope → sahifa chiziqlarini quradi', () => {
    const layout = buildSaytTree(SAHIFA_KATALOGI);
    const pages = layout.nodes.filter((node) => node.kind === 'page');
    const scopes = layout.nodes.filter((node) => node.kind === 'scope');

    expect(layout.root.id).toBe('root:tizim-02');
    expect(pages).toHaveLength(SAHIFA_KATALOGI.length);
    expect(scopes.length).toBeGreaterThan(1);
    expect(layout.edges).toHaveLength(pages.length + scopes.length);
    expect(new Set(layout.edges.map((edge) => edge.id)).size).toBe(layout.edges.length);
    expect(layout.edges.every((edge) => edge.path.startsWith('M '))).toBe(true);
  });

  it('filterlangan katalogda faqat ko‘rinayotgan scope va sahifalar qoladi', () => {
    const pages = SAHIFA_KATALOGI.filter((page) => page.scope === 'OBJECT' && /f2|hujjat/i.test(`${page.nom} ${page.yol}`));
    const layout = buildSaytTree(pages);

    expect(layout.nodes.filter((node) => node.kind === 'page').map((node) => node.route)).toEqual(['/admin/documents', '/admin/hujjat-nazorat', '/admin/f2-tarix', '/admin/f2', '/admin/f2-tayyorlash']);
    expect(layout.nodes.filter((node) => node.kind === 'scope').map((node) => node.scope)).toEqual(['OBJECT']);
    expect(layout.edges).toHaveLength(6);
    expect(layout.width).toBeGreaterThan(layout.root.width);
    expect(layout.height).toBeGreaterThan(0);
  });

  it('bo‘sh filterda ham root canvas qaytadi va edge yaratmaydi', () => {
    const layout = buildSaytTree([]);
    expect(layout.nodes).toHaveLength(1);
    expect(layout.nodes[0]?.kind).toBe('root');
    expect(layout.edges).toEqual([]);
  });
});
