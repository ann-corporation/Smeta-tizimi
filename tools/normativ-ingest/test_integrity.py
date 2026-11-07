import json
from pathlib import Path
import tempfile
import unittest

import prepare
from table_candidates import candidates


class IngestIntegrityTests(unittest.TestCase):
    def test_prepare_rejects_changed_source_and_oversized_input(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / 'synthetic.pdf'
            source.write_bytes(b'synthetic')
            manifest = root / 'manifest.json'
            manifest.write_text(json.dumps([dict(path=source.name,
                source_sha='0' * 64, norma_kod='SYN', tahrir='TEST', title='Synthetic')]))
            with self.assertRaisesRegex(ValueError, 'SOURCE_SHA_MISMATCH'):
                prepare.prepare(root, manifest, root / 'out')
            with source.open('wb') as stream:
                stream.truncate(256 * 1024 * 1024 + 1)
            with self.assertRaisesRegex(ValueError, 'SOURCE_OUT_OF_SCOPE'):
                prepare.prepare(root, manifest, root / 'out')

    def test_candidates_reject_modified_page(self):
        with tempfile.TemporaryDirectory() as tmp:
            job = Path(tmp)
            (job / 'job.json').write_text('{"units":["page-1"]}')
            page = dict(source_sha='a' * 64, matn='Таблица СРН 01-01-001 Synthetic',
                        sahifa_pdf=1)
            page['sha'] = prepare.digest(prepare.encoded(page))
            file = job / 'page-1.json'
            prepare.atomic(file, page)
            rows = [dict(job_dir=tmp, sha256=page['source_sha'], norma_kod='SYN')]
            self.assertEqual([r['table'] for r in candidates(rows)], ['01-01-001'])
            page['matn'] += ' changed'
            prepare.atomic(file, page)
            with self.assertRaisesRegex(ValueError, 'CANDIDATE_SOURCE_INTEGRITY'):
                list(candidates(rows))
