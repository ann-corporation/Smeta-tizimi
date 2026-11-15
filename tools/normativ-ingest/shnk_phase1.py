"""ShNK Phase 1 helper: inventory CSV + selection -> reviewed manifest for prepare.py, and a dry-run report.

Offline only. No DB, no R2. Output must stay outside Git (prepare.py enforces this).

  python tools/normativ-ingest/shnk_phase1.py manifest INVENTAR.csv TOP.csv ROOT OUT_manifest.json
  python tools/normativ-ingest/shnk_phase1.py dryrun   QUEUE.json OUT_plan.json     # runs r2_upload.py dry-run per row

TOP.csv: column file_name (rows = chosen documents, in order). Titles are AUTO placeholders
(type + code); the owner/reviewer may edit `title` in the manifest before prepare.py.
"""
import csv
import json
import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(ROOT / 'scripts' / 'normativ'))
from pipeline import atomic, digest  # noqa: E402


def read_csv(path):
    with open(path, encoding='utf-8-sig', newline='') as f:
        return list(csv.DictReader(f))


def first_page_year(path):
    try:
        import pypdfium2 as pdfium
        pdf = pdfium.PdfDocument(str(path))
        text = pdf[0].get_textpage().get_text_range()
        m = re.search(r'\b(19[89]\d|20[0-2]\d)\b', text)
        return m.group(1) if m else None
    except Exception:
        return None


def manifest(inventory, top, root, out):
    inv = {r['file_name']: r for r in read_csv(inventory) if r['source'] == 'D:\\ShNK'}
    records = []
    for row in read_csv(top):
        r = inv[row['file_name']]
        src = root / r['file_name']
        source_sha = digest(src.read_bytes())
        if source_sha != r['sha256']:
            raise ValueError('INVENTORY_SHA_MISMATCH ' + r['file_name'])
        year = r['edition_year'] or first_page_year(src) or 'REVIEW'
        records.append(dict(path=r['file_name'], source_sha=source_sha,
                            norma_kod=r['code_norm'], tahrir=str(year),
                            title=(r['doc_type'] + ' ' + r['code_norm']).strip()))
    out = Path(out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(records, ensure_ascii=False, indent=1), encoding='utf-8')
    print(json.dumps({'records': len(records)}))


def dryrun(queue, out):
    rows = json.loads(Path(queue).read_text(encoding='utf-8'))
    plan, total_objects, total_bytes, chunks = [], 0, 0, 0
    for item in rows:
        res = subprocess.run([sys.executable, str(ROOT / 'scripts' / 'normativ' / 'r2_upload.py'),
                              item['job_dir'], item['source'], item['title']],
                             capture_output=True, text=True, encoding='utf-8')
        if res.returncode:
            plan.append(dict(path=item['path'], error=res.stderr.strip()[-200:]))
            continue
        data = json.loads(res.stdout)
        n_chunks = sum(1 for o in data['objects'] if o['key'].startswith('normativ/chunks/'))
        size = sum(o['bayt'] for o in data['objects'])
        total_objects += len(data['objects']); total_bytes += size; chunks += n_chunks
        plan.append(dict(path=item['path'], norma_kod=item['norma_kod'], flags=item['flags'], objects=len(data['objects']),
                         chunks=n_chunks, bytes=size))
    summary = dict(documents=len(plan), objects=total_objects, chunks=chunks, r2_bytes=total_bytes,
                   with_flags=sum(1 for p in plan if p.get('flags')), errors=sum(1 for p in plan if 'error' in p))
    atomic(Path(out), dict(summary=summary, plan=plan))
    print(json.dumps(summary))


if __name__ == '__main__':
    if len(sys.argv) == 6 and sys.argv[1] == 'manifest':
        manifest(sys.argv[2], sys.argv[3], Path(sys.argv[4]).resolve(strict=True), sys.argv[5])
    elif len(sys.argv) == 4 and sys.argv[1] == 'dryrun':
        dryrun(sys.argv[2], sys.argv[3])
    else:
        sys.exit(__doc__)
