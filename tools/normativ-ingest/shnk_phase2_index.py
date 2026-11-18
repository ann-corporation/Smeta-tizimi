"""ShNK offline search index for R2 (no DB). Builds files for upload; does NOT upload.

  python tools/normativ-ingest/shnk_phase2_index.py QUEUE.json[,QUEUE2.json...] OUTDIR

Input queues are K1 ingest-queue.json files (each row has job_dir, path, norma_kod, tahrir, title, sha256, state, flags).
Output (OUTDIR = .../phase2/r2):
  corpus.json.gz                      doc list: id, code, title, edition, pages, source/job sha, R2 keys, unit chunk shas
  index/v1/p/<prefix>.json.gz         term -> [[docId, unitIdx, tf], ...] sharded by first 2 chars of term
  index/v1/stats.json                 term counts, shard count, byte totals

Format and tokenisation are documented in XULOSA.md. Keep this module stdlib-only so the Worker port stays simple.
"""
import gzip
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

APOSTROPHES = re.compile("[‘’ʼʻ`'´]")
TOKEN = re.compile(r'[0-9a-zа-яёўқғҳЁЎҚҒҲ]+')
MIN_LEN = 2
STOP = {'va', 'bilan', 'uchun', 'bu', 'shu', 'ham', 'yoki', 'the', 'and', 'для', 'что', 'это', 'как', 'или', 'при'}


def normalise(text):
    text = APOSTROPHES.sub('', text.lower())
    return [t for t in TOKEN.findall(text) if len(t) >= MIN_LEN and t not in STOP]


def prefix_of(term):
    return term[:2] if term[:2].isalnum() else 'xx'


def read_gz_json(path):
    return json.loads(gzip.decompress(path.read_bytes()).decode('utf-8'))


def main(queue_arg, outdir):
    out = Path(outdir)
    (out / 'index' / 'v1' / 'p').mkdir(parents=True, exist_ok=True)
    rows = []
    for q in queue_arg.split(','):
        rows += json.loads(Path(q).read_text(encoding='utf-8'))
    rows.sort(key=lambda r: (r['norma_kod'], r['tahrir']))

    docs, postings = [], defaultdict(dict)
    for doc_id, r in enumerate(rows):
        job = Path(r['job_dir'])
        state = json.loads((job / 'job.json').read_text(encoding='utf-8'))
        unit_shas, pages, chars = [], 0, 0
        for unit_idx, unit in enumerate(state.get('units', [])):
            saved = json.loads((job / (unit + '.json')).read_text(encoding='utf-8'))
            matn = saved.get('matn') or ''
            chars += len(matn)
            pages += 1 if saved.get('sahifa_pdf') else 0
            unit_shas.append(saved.get('sha'))
            counts = defaultdict(int)
            for t in normalise(matn + ' ' + (saved.get('qidiruv_yorliq') or '')):
                counts[t] += 1
            for t, tf in counts.items():
                postings[t][(doc_id, unit_idx)] = tf
        docs.append(dict(id=doc_id, code=r['norma_kod'], title=r['title'], tahrir=r['tahrir'],
                         path=r['path'], source_sha=r['sha256'], job_sha=job.name,
                         state=r['state'], flags=r['flags'], pages=pages, chars=chars,
                         original_key=f"normativ/original/{r['sha256']}",
                         manifest_key=f"normativ/manifests/{job.name}.json",
                         unit_chunks=unit_shas))
    print(json.dumps({'docs': len(docs), 'terms': len(postings)}))
    return docs, postings, out


def write_index(docs, postings, out):
    shards = defaultdict(dict)
    for term, cells in postings.items():
        rows = sorted([key[0], key[1], tf] for key, tf in cells.items())
        shards[prefix_of(term)][term] = rows
    total = 0
    for pfx, data in shards.items():
        raw = json.dumps(data, ensure_ascii=False, separators=(',', ':'), sort_keys=True).encode('utf-8')
        body = gzip.compress(raw, compresslevel=9, mtime=0)
        (out / 'index' / 'v1' / 'p' / f'{pfx}.json.gz').write_bytes(body)
        total += len(body)
    corpus = json.dumps({'format': 'shnk-corpus-v1', 'docs': docs}, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    (out / 'corpus.json.gz').write_bytes(gzip.compress(corpus, compresslevel=9, mtime=0))
    stats = dict(terms=len(postings), shards=len(shards), index_gz_bytes=total,
                 corpus_gz_bytes=(out / 'corpus.json.gz').stat().st_size, docs=len(docs))
    (out / 'index' / 'v1' / 'stats.json').write_text(json.dumps(stats, indent=1), encoding='utf-8')
    return stats


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    d, p, o = main(sys.argv[1], sys.argv[2])
    print(json.dumps(write_index(d, p, o)))
