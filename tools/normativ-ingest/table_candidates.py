"""List candidate table headings from an existing private ingest queue."""
import argparse
import json
from pathlib import Path
import re

from prepare import atomic, digest, encoded, private_output

CODE = r'\d{2}-\d{2}-\d{3}'
HEADER = re.compile(
    rf'^[ \t]*(?:таблица[ \t]+(?:срн[ \t]+)?({CODE})|({CODE})[ \t]+жадвал)'
    r'[ \t]*(?:[.\-–][ \t]*)?(?:\r?\n[ \t]*)?([^\r\n]{0,150})',
    re.IGNORECASE | re.MULTILINE,
)


def candidates(queue):
    for row in queue:
        job = Path(row['job_dir'])
        state = json.loads((job / 'job.json').read_text(encoding='utf-8'))
        for unit in state['units']:
            if not re.fullmatch(r'page-\d+', unit):
                continue
            data = json.loads((job / (unit + '.json')).read_text(encoding='utf-8'))
            unit_sha = data.pop('sha')
            if digest(encoded(data)) != unit_sha or data['source_sha'] != row['sha256']:
                raise ValueError('CANDIDATE_SOURCE_INTEGRITY')
            for match in HEADER.finditer(data['matn']):
                yield {
                    'norma_kod': row['norma_kod'], 'source_sha': row['sha256'],
                    'unit': unit, 'unit_sha': unit_sha, 'page': data['sahifa_pdf'],
                    'table': match[1] or match[2], 'heading': match[3].strip(),
                    'offset': match.start(), 'state': 'REVIEW_REQUIRED',
                }


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('queue', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    private_output(args.output.parent)
    result = list(candidates(json.loads(args.queue.read_text(encoding='utf-8'))))
    atomic(args.output, result)
    print(json.dumps({'review_candidates': len(result)}))
