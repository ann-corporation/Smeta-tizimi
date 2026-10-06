/** Source-backed navigation proposals. Never changes names, recipes or normative truth. */
const LOOKALIKE = { А: 'A', В: 'B', С: 'C', Е: 'E', Н: 'H', К: 'K', М: 'M', О: 'O', Р: 'P', Т: 'T', Х: 'X' };
export const codeVariant = value => value == null ? null : String(value).replace(/[АВСЕНКМОРТХ]/g, c => LOOKALIKE[c]);
const key = parts => JSON.stringify(parts);
const add = (map, k, value) => { if (!map.has(k)) map.set(k, []); map.get(k).push(value); };
const sort = rows => rows.sort((a, b) => a.ID < b.ID ? -1 : a.ID > b.ID ? 1 : 0);

export function reviewHierarchy(book, works, nodes) {
  const byId = new Map(), exact = new Map(), variants = new Map(), collections = new Map();
  for (const row of book) {
    if (!row.ID || byId.has(row.ID)) throw new Error('BOOK_ID_INVALID_OR_DUPLICATE');
    byId.set(row.ID, row);
    if (row.KODTAB != null) {
      add(exact, key([row.TIPBOOK, row.KODA, row.KODTAB]), row);
      add(variants, key([row.TIPBOOK, codeVariant(row.KODA), codeVariant(row.KODTAB)]), row);
    } else if (row.KODA != null && row.KODRAZ == null && row.KODPRAZ == null) {
      add(collections, key([row.TIPBOOK, codeVariant(row.KODA)]), row);
    }
  }
  // Iterative, cached parent walks: no stack overflow on deeply nested catalogues.
  const paths = new Map();
  function path(id) {
    if (paths.has(id)) return paths.get(id);
    const trail = [], seen = new Set(); let cursor = id;
    while (cursor && cursor !== '0' && !paths.has(cursor)) {
      if (seen.has(cursor)) throw new Error('BOOK_PARENT_CYCLE');
      const row = byId.get(cursor);
      if (!row) throw new Error('BOOK_PARENT_MISSING');
      seen.add(cursor); trail.push(row); cursor = row.IDPARENT;
    }
    let resolved = paths.get(cursor) ?? [];
    for (const row of trail.reverse()) {
      resolved = [...resolved, { id: row.ID, name: row.NAME }];
      paths.set(row.ID, resolved);
    }
    return paths.get(id);
  }
  const unresolved = new Map();
  for (const node of nodes) if (node[4] != null && ['MISSING', 'AMBIGUOUS'].includes(node[5])) {
    if (unresolved.has(node[4])) throw new Error('DUPLICATE_UNRESOLVED_TABLE');
    unresolved.set(node[4], node[5]);
  }
  const ids = new Set(), result = [];
  for (const work of works) {
    if (!work[0] || ids.has(work[0])) throw new Error('WORK_ID_INVALID_OR_DUPLICATE');
    ids.add(work[0]);
    if (!unresolved.has(work[3])) continue;
    const parts = JSON.parse(work[3]);
    if (!Array.isArray(parts) || parts.length !== 3) throw new Error('SOURCE_KEY_INVALID');
    const candidates = sort([...(exact.get(key(parts)) ?? variants.get(key([parts[0], codeVariant(parts[1]), codeVariant(parts[2])])) ?? [])]);
    const groups = sort([...(collections.get(key([parts[0], codeVariant(parts[1])])) ?? [])]);
    let status, reason, destination;
    if (candidates.length === 1) {
      status = 'UNIQUE_CODE_VARIANT_REVIEW';
      reason = 'Manbadagi shifrning lotin/kirill yozilishi farq qiladi; bitta BOOK kandidati. Bu nashr/norma tengligini tasdiqlamaydi.';
      destination = { kind: 'BOOK_CANDIDATE', path: path(candidates[0].ID) };
    } else if (candidates.length > 1) {
      status = 'AMBIGUOUS_BOOK_REVIEW';
      reason = 'Bir nechta BOOK kandidati; hech biri avtomatik tanlanmadi.';
      destination = { kind: 'SOURCE_NAVIGATION', label: `${parts[1] ?? 'Manba to‘plami ko‘rsatilmagan'} / ${parts[2] ?? 'Jadval ko‘rsatilmagan'}` };
    } else if (groups.length === 1) {
      status = 'COLLECTION_NAVIGATION_REVIEW';
      reason = 'BOOK jadvali topilmadi. Shu turdagi bitta manba to‘plami ostida izohli navigatsiya guruhi; rasmiy razdel tasnifi emas.';
      destination = { kind: 'COLLECTION_CANDIDATE', path: path(groups[0].ID), label: parts[2] };
    } else {
      status = 'SOURCE_NAVIGATION_ONLY';
      reason = groups.length ? 'To‘plamning bir nechta kandidati bor; original shifr bo‘yicha alohida guruh.' : 'BOOK to‘plam/jadval dalili yo‘q; original shifr bo‘yicha alohida guruh.';
      destination = { kind: 'SOURCE_NAVIGATION', label: `${parts[1] ?? 'Manba to‘plami ko‘rsatilmagan'} / ${parts[2] ?? 'Jadval ko‘rsatilmagan'}` };
    }
    result.push({ workId: work[0], code: work[1], name: work[2], sourceKey: work[3], sourceStatus: unresolved.get(work[3]),
      status, reason, destination, candidates: candidates.map(row => ({ bookId: row.ID, path: path(row.ID) })),
      collectionCandidateIds: groups.map(row => row.ID), officialClassificationApproved: false });
  }
  result.sort((a, b) => a.workId < b.workId ? -1 : a.workId > b.workId ? 1 : 0);
  return result;
}
