import type { EstimateDoc } from '../../lib/smeta-studio/model';
import { qidiruvKaliti } from '../../i18n/lotin-kirill';

/** Presentation index only: never a second editable estimate or source of quantity/price. */
export type OutlineRow = {
  key: string; parentKey: string | null; kind: 'section' | 'work' | 'resource';
  label: string; code: string | null; depth: number; expandable: boolean;
  sectionId: string; occurrenceId?: string; recipeId?: string;
  searchKey: string;
};
export type OutlineIndex = { rows: OutlineRow[]; byKey: Map<string, number> };
const key = (...parts: string[]) => JSON.stringify(parts);
export function searchKey(value: string): string {
  return qidiruvKaliti(value.normalize('NFKC')).replace(/\s+/g, ' ').trim();
}

/** Iterative preorder; O(sections + works + recipes), even for a 30k-deep input. */
export function indexEstimate(doc: EstimateDoc): OutlineIndex {
  const rows: OutlineRow[] = [], byKey = new Map<string, number>();
  const seenSections = new Set<string>(), seenWorks = new Set<string>();
  type Visit = { id: string; parent: string | null; depth: number };
  const stack: Visit[] = doc.rootOrder.map(id => ({ id, parent: null, depth: 0 })).reverse();
  const add = (row: Omit<OutlineRow, 'searchKey'>) => {
    if (byKey.has(row.key)) throw new Error('OUTLINE_DUPLICATE_ID');
    byKey.set(row.key, rows.length);
    rows.push({ ...row, searchKey: searchKey(`${row.code ?? ''} ${row.label}`) });
  };
  // A section's works are emitted after its nested sections, preserving the current calcDoc order.
  type Task = Visit | { workId: string; sectionId: string; parent: string; depth: number };
  const tasks: Task[] = stack;
  while (tasks.length) {
    const visit = tasks.pop()!;
    if ('workId' in visit) {
      const work = doc.occurrences[visit.workId];
      if (!work || work.id !== visit.workId || work.sectionId !== visit.sectionId) throw new Error('OUTLINE_WORK_LINEAGE');
      if (seenWorks.has(work.id)) throw new Error('OUTLINE_DUPLICATE_WORK');
      seenWorks.add(work.id);
      const workKey = key('work', work.id);
      add({ key: workKey, parentKey: visit.parent, kind: 'work', label: work.source.name ?? '',
        code: work.source.code, depth: visit.depth, expandable: work.recipe.length > 0,
        sectionId: visit.sectionId, occurrenceId: work.id });
      for (const recipe of work.recipe) {
        const selected = work.overrides[recipe.recipeId]?.substitution?.resource ?? recipe.resource;
        add({ key: key('resource', work.id, recipe.recipeId), parentKey: workKey, kind: 'resource',
          label: selected?.name ?? '', code: selected?.code ?? null, depth: visit.depth + 1,
          expandable: false, sectionId: visit.sectionId, occurrenceId: work.id, recipeId: recipe.recipeId });
      }
      continue;
    }
    const section = doc.sections[visit.id];
    if (!section || section.id !== visit.id) throw new Error('OUTLINE_SECTION_MISSING');
    if (seenSections.has(visit.id)) throw new Error('OUTLINE_CYCLE_OR_DUPLICATE_SECTION');
    seenSections.add(visit.id);
    const expectedParent = visit.parent === null ? null : rows[byKey.get(visit.parent)!].sectionId;
    if (section.parentId !== expectedParent) throw new Error('OUTLINE_SECTION_LINEAGE');
    const sectionKey = key('section', section.id);
    add({ key: sectionKey, parentKey: visit.parent, kind: 'section', label: section.name, code: null,
      depth: visit.depth, expandable: section.children.length + section.items.length > 0, sectionId: section.id });
    for (let i = section.items.length - 1; i >= 0; i--) {
      tasks.push({ workId: section.items[i], sectionId: section.id, parent: sectionKey, depth: visit.depth + 1 });
    }
    for (let i = section.children.length - 1; i >= 0; i--) {
      tasks.push({ id: section.children[i], parent: sectionKey, depth: visit.depth + 1 });
    }
  }
  if (seenSections.size !== Object.keys(doc.sections).length || seenWorks.size !== Object.keys(doc.occurrences).length) {
    throw new Error('OUTLINE_ORPHAN');
  }
  return { rows, byKey };
}

/** A single reverse pass retains ancestors of matches; no per-row find()/ancestor scans. */
export function visibleOutline(index: OutlineIndex, expanded: ReadonlySet<string>, query = ''): OutlineRow[] {
  const q = searchKey(query), keep = q ? new Set<string>() : null;
  if (keep) {
    for (let i = index.rows.length - 1; i >= 0; i--) {
      const row = index.rows[i];
      if (row.searchKey.includes(q) || keep.has(row.key)) {
        keep.add(row.key);
        if (row.parentKey !== null) keep.add(row.parentKey);
      }
    }
  }
  const visible = new Set<string>(), result: OutlineRow[] = [];
  for (const row of index.rows) {
    if (keep ? keep.has(row.key) : row.parentKey === null || (visible.has(row.parentKey) && expanded.has(row.parentKey))) {
      visible.add(row.key); result.push(row);
    }
  }
  return result;
}

export function expandThroughDepth(index: OutlineIndex, depth: number): Set<string> {
  return new Set(index.rows.filter(row => row.expandable && row.depth < depth).map(row => row.key));
}

export function outlineBreadcrumb(index: OutlineIndex, row: OutlineRow): string[] {
  const path: string[] = [];
  let current: OutlineRow | undefined = row;
  while (current) {
    path.push(current.label || current.code || '');
    current = current.parentKey === null ? undefined : index.rows[index.byKey.get(current.parentKey)!];
  }
  return path.reverse();
}
