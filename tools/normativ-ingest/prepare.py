"""Run verified ShNK sources through K1 and prepare an offline K2 queue."""
import argparse
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts' / 'normativ'))
from pipeline import atomic, bounded_zip, digest, encoded, private_output, run


def prepare(root, manifest, output, **options):
    private_output(output)
    output.mkdir(parents=True, exist_ok=True)
    records = json.loads(manifest.read_text(encoding='utf-8-sig'))
    queue = []
    seen = set()
    for item in records:
        meta = {key: item[key].strip() for key in ('norma_kod', 'tahrir', 'title')}
        if not all(meta.values()):
            raise ValueError('MISSING_REVIEWED_METADATA')
        source = (root / item['path']).resolve(strict=True)
        if not source.is_relative_to(root) or source.stat().st_size > 256 * 1024 * 1024:
            raise ValueError('SOURCE_OUT_OF_SCOPE')
        if digest(source.read_bytes()) != item['source_sha']:
            raise ValueError('SOURCE_SHA_MISMATCH')
        suffix = source.suffix.lower()
        if suffix == '.zip':
            member = item['member']
            suffix = Path(member).suffix.lower()
            if suffix not in ('.pdf', '.doc', '.docx'):
                raise ValueError('UNSUPPORTED_MEMBER')
            with bounded_zip(source) as archive:
                matches = [info for info in archive.infolist() if info.filename == member]
                if len(matches) != 1 or matches[0].is_dir():
                    raise ValueError('AMBIGUOUS_MEMBER')
                data = archive.read(matches[0])
            if digest(data) != item['sha256']:
                raise ValueError('MEMBER_SHA_MISMATCH')
            snapshot = output / (item['sha256'] + suffix)
            snapshot.write_bytes(data)
            source = snapshot
        elif suffix not in ('.pdf', '.doc', '.docx'):
            raise ValueError('UNSUPPORTED_SOURCE')
        expected_sha = item['sha256'] if 'member' in item else item['source_sha']
        identity = (expected_sha, meta['norma_kod'], meta['tahrir'])
        if identity in seen:
            raise ValueError('DUPLICATE_REVIEWED_IDENTITY')
        seen.add(identity)
        annotations = item.get('annotations', {})
        limits = {'qidiruv_yorliq': 500, 'jadval_kod': 120, 'bob_punkt': 120, 'iqtibos_anchor': 160}
        for fields in annotations.values():
            if not fields or any(key not in limits or not isinstance(value, str)
                                 or not value.strip() or len(value) > limits[key]
                                 for key, value in fields.items()):
                raise ValueError('INVALID_REVIEWED_ANNOTATION')
        if annotations:
            meta['annotations'] = annotations
        state = run(str(source), str(output), meta=meta, **options)
        if state['source_sha'] != expected_sha:
            raise ValueError('EXTRACTED_SHA_MISMATCH')
        job = output / digest(encoded([expected_sha, state['reader'], state['config']]))
        queue.append(dict(path=item['path'], member=item.get('member'), source=str(source), job_dir=str(job),
                          norma_kod=meta['norma_kod'], tahrir=meta['tahrir'], title=meta['title'], sha256=expected_sha, state=state['state'],
                          extracted_units=state['extracted_units'], flags=state['flags']))
    atomic(output / 'ingest-queue.json', queue)
    return queue


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for arg in ('root', 'manifest', 'output'):
        parser.add_argument(arg, type=Path)
    parser.add_argument('--ocr')
    parser.add_argument('--converter')
    args = parser.parse_args()
    rows = prepare(args.root.resolve(strict=True), args.manifest, args.output.resolve(),
                   ocr=args.ocr, converter=args.converter)
    print(json.dumps({'prepared_for_review': len(rows)}))
