import type { TreeNode } from './norm-shards';

export type NamingWork = { tableKey: string; code: string; name: string | null };
const readable = (name: string) => !!name.trim() && !/^[\s—?\-]+$/.test(name)
  && !/^[A-Za-zА-ЯЁа-яё]{0,3}\d+(?:[-./]\d+)*$/.test(name.trim());
const compact = (text: string) => text.replace(/\s+/g, ' ').trim();
const shorten = (text: string) => text.length <= 150 ? text : text.slice(0,150).replace(/\s+\S*$/, '') + '…';

/** An editorial display overlay. IDs, source titles, parents and normative facts stay unchanged. */
export function nameCatalogTree(source: TreeNode[], works: Iterable<NamingWork>, overrides: ReadonlyMap<number,string> = new Map()) {
  const nodes = source.map(n => [...n] as TreeNode), editorial = new Set<number>();
  const byTable = new Map<string, string[]>();
  for (const work of works) {
    const name = compact(work.name ?? '');
    if (!name) continue;
    const list = byTable.get(work.tableKey) ?? [];
    if (!list.includes(name)) list.push(name);
    byTable.set(work.tableKey,list);
  }
  const summary = (names: string[]) => {
    if (!names.length) return 'Состав и виды работ';
    const first = names[0].split(' ');
    let count = first.length;
    for (const name of names.slice(1)) {
      const words = name.split(' '); let same = 0;
      while (same < count && words[same]?.toLowerCase() === first[same].toLowerCase()) same++;
      count = same;
    }
    const shared = first.slice(0,count).join(' ').replace(/[,:;\-]+$/,'').trim();
    return shorten(shared.length >= 16 ? shared : names.slice(0,2).join(' / '));
  };
  nodes.forEach((node,index) => {
    const override = overrides.get(index);
    if (override) { node[2] = override; editorial.add(index); }
    else if (node[4] && !readable(node[2])) {
      node[2] = `${node[2] || byTable.get(node[4])?.[0] || 'Виды работ'} · ${summary(byTable.get(node[4]) ?? [])}`;
      editorial.add(index);
    }
  });
  const children = new Map<number,number[]>();
  nodes.forEach((n,i)=>{const list=children.get(n[1])??[];list.push(i);children.set(n[1],list);});
  const descendants = (index:number, seen = new Set<number>()): string[] => {
    if(seen.has(index)) throw new Error('NORM_TREE_CYCLE');
    seen.add(index);
    const n=nodes[index];
    if(n[4]) return byTable.get(n[4]) ?? [];
    return (children.get(index)??[]).flatMap(i=>descendants(i,new Set(seen)));
  };
  nodes.forEach((node,index)=>{
    if (readable(node[2])) return;
    const names=descendants(index);
    node[2]=node[1]===-1 ? 'Работы по сборникам и разделам' : `${node[2] ? node[2]+' · ' : ''}${summary(names)}`;
    editorial.add(index);
  });
  return {nodes,editorial};
}
