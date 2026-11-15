"""Stage R2-ready objects offline (no upload). Writes chunks and manifests, skips originals.

  python tools/normativ-ingest/shnk_phase2_stage.py QUEUE.json OUTDIR

Originals are content-addressed by source SHA and already exist read-only in D:\\ShNK, so they are
referenced by key, not copied. Output keys mirror R2 keys under OUTDIR (normativ/chunks/..., normativ/manifests/...).
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(ROOT / 'scripts' / 'normativ'))
import r2_upload  # noqa: E402


def main(queue, outdir):
    out = Path(outdir)
    rows = json.loads(Path(queue).read_text(encoding='utf-8-sig'))
    written, nbytes, errors = 0, 0, []
    for r in rows:
        try:
            plan = r2_upload.prepare(r['job_dir'], r['source'], r['title'])
        except Exception as exc:  # record and continue; one bad row must not stop the batch
            errors.append(dict(path=r['path'], error=str(exc)[:200]))
            continue
        for key, body, digest in plan['objects']:
            if key.startswith('normativ/original/'):
                continue
            dst = out / key
            dst.parent.mkdir(parents=True, exist_ok=True)
            dst.write_bytes(body)
            written += 1
            nbytes += len(body)
    print(json.dumps(dict(queue=str(queue), objects=written, bytes=nbytes, errors=errors)))


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
