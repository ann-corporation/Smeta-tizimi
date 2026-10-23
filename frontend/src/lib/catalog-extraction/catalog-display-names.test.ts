import {expect,it} from 'vitest';
import {nameCatalogTree} from './catalog-display-names';
import type {TreeNode} from './norm-shards';
it('names every code-only or blank group from its own works without rewriting source facts',()=>{
 const source:TreeNode[]=[['u',-1,'',2,null,'GROUP'],['c',0,'Е20',2,null,'GROUP'],['t',1,'E20-1-5',2,'tuple','MISSING']];
 const before=structuredClone(source);
 const view=nameCatalogTree(source,[{tableKey:'tuple',code:'a',name:'Устройство вентиляционных каналов первого типа'},{tableKey:'tuple',code:'b',name:'Устройство вентиляционных каналов второго типа'}]);
 expect(view.nodes[2][2]).toContain('Устройство вентиляционных каналов');
 expect(view.nodes[1][2]).toContain('Устройство вентиляционных каналов');
 expect(view.nodes.every(n=>n[2].trim().length>0)).toBe(true);
 expect(view.editorial.size).toBe(3);
 expect(source).toEqual(before);
 expect(view.nodes.map(n=>[n[0],n[1],n[3],n[4],n[5]])).toEqual(before.map(n=>[n[0],n[1],n[3],n[4],n[5]]));
});
it('preserves genuine source titles and keeps curated labels separate',()=>{
 const source:TreeNode[]=[['c',-1,'Название из источника',1,null,'BOOK'],['t',0,'Источник: таблица',1,'t','EXACT']];
 const view=nameCatalogTree(source,[],new Map([[0,'Опоры, настилы и ограждения']]));
 expect(view.nodes[0][2]).toBe('Опоры, настилы и ограждения');
 expect(view.nodes[1][2]).toBe(source[1][2]);
 expect([...view.editorial]).toEqual([0]);
});
