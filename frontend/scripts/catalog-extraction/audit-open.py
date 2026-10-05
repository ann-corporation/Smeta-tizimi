"""Read-only audit of owner-provided open exports; no database unlocking."""
import sqlite3, json, hashlib, sys
from pathlib import Path
from collections import Counter
root = Path(sys.argv[1])
checks = json.loads((root/'checksums.json').read_text(encoding='utf-8-sig'))
for name, expected in checks.items():
    path = root/name
    if path.parent != root or not path.is_file(): raise ValueError('Invalid source path')
    with path.open('rb') as f: actual = hashlib.file_digest(f, 'sha256').hexdigest()
    assert path.stat().st_size == expected['bytes'] and actual == expected['sha256'], name
con = sqlite3.connect((root/'catalog.sqlite').as_uri()+'?mode=ro', uri=True)
con.execute('pragma query_only=on')
work = Counter(x[0] for x in con.execute('select KodE from basis'))
material = Counter(x[0] for x in con.execute('select KodM from material'))
work_links, material_links = Counter(), Counter()
for code, resource in con.execute('select KodE,KodM from basisres'):
    work_links['unique' if work[code]==1 else 'ambiguous' if work[code]>1 else 'missing'] += 1
    material_links['unique' if resource is not None and material[resource]==1 else 'ambiguous' if resource is not None and material[resource]>1 else 'missing'] += 1
report = {'counts': {t:con.execute('select count(*) from '+t).fetchone()[0] for t in ['basis','basisres','material','bprice']},
    'checksums':'PASS', 'work_links_exact_KodE':dict(work_links), 'resource_links_exact_KodM':dict(material_links),
    'duplicate_work_codes':[k for k,v in work.items() if v>1],
    'duplicate_resource_codes':sum(v>1 for v in material.values()),
    'extra_price_record':'QUARANTINED; not automatically imported',
    'normative_edition':'UNVERIFIED', 'unit_mapping':'UNVERIFIED',
    'numeric_source':'SQLite REAL / exported JSON number; no claim of original decimal precision'}
report['largest_duplicate_resource_groups'] = con.execute('select KodM,count(*) from material group by KodM having count(*)>1 order by count(*) desc limit 8').fetchall()
report['composite_resource_key_candidates'] = con.execute('select KodM,KodR,count(*) from material group by KodM,KodR having count(*)>1 order by count(*) desc limit 8').fetchall()
by_m, by_r = {}, {}
for mid, m, r in con.execute('select Kod,KodM,KodR from material'):
    if m is not None: by_m.setdefault(m, []).append((mid,r))
    if r is not None: by_r.setdefault(r, []).append(mid)
resolved, resolved_unique_works = Counter(), Counter()
for w,m,r in con.execute('select KodE,KodM,KodR from basisres'):
    candidates = by_r.get(r,[]) if m is None and r is not None else [mid for mid,rr in by_m.get(m,[]) if r is None or rr==r] if m is not None else []
    state = 'unique' if len(candidates)==1 else 'ambiguous' if candidates else 'missing'
    resolved[state] += 1
    if work[w] == 1: resolved_unique_works[state] += 1
report['resource_links_explicit_keys'] = dict(resolved)
report['resource_links_unique_works'] = dict(resolved_unique_works)
print(json.dumps(report, ensure_ascii=False, indent=2))
