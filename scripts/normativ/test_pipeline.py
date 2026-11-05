import hashlib
import json
import sys
import tempfile
import unittest
import zipfile
from unittest.mock import patch
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import pipeline


class PipelineTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.out = self.root / 'private'

    def tearDown(self):
        self.tmp.cleanup()

    def pdf(self, path, text='Synthetic 0, —'):
        from reportlab.pdfgen import canvas
        c = canvas.Canvas(str(path)); c.drawString(40, 740, text); c.save()
        return path

    def docx(self, path):
        from docx import Document
        d = Document(); d.add_paragraph('first'); t = d.add_table(rows=2, cols=1)
        t.cell(0, 0).text = 'top'; t.cell(1, 0).text = 'bottom'
        trpr = t.rows[0]._tr.get_or_add_trPr()
        from docx.oxml import OxmlElement
        vm = OxmlElement('w:vMerge'); vm.set('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}val', 'restart'); t.cell(0, 0)._tc.get_or_add_tcPr().append(vm)
        vm = OxmlElement('w:vMerge'); t.cell(1, 0)._tc.get_or_add_tcPr().append(vm)
        d.add_paragraph('last'); d.save(path); return path

    def test_native_pdf_provenance_and_edition_identity_default_process(self):
        src = self.pdf(self.root/'a.pdf')
        a = pipeline.run(src, self.out, meta={'norma_kod': 'SYN-1', 'tahrir': 'A'})
        unit = json.loads(next(self.out.rglob(a['units'][0]+'.json')).read_text())
        self.assertEqual(unit['source_sha'], hashlib.sha256(src.read_bytes()).hexdigest())
        self.assertTrue(unit['spans'][0]['bbox']); self.assertIn('0,', unit['matn'])
        self.assertEqual(unit['norma_kod'], 'SYN-1'); self.assertIsNone(unit['bob_punkt'])
        b = pipeline.run(src, self.out, meta={'norma_kod': 'SYN-1', 'tahrir': 'B'}, worker=True)
        self.assertNotEqual(a['reader'] + str(a['config']), b['reader'] + str(b['config']))

    def test_docx_order_cells_and_vertical_merge(self):
        result = pipeline.run(self.docx(self.root/'x.docx'), self.out, worker=True)
        units = [json.loads(next(self.out.rglob(k+'.json')).read_text()) for k in result['units']]
        self.assertEqual([u['origin'] for u in units], ['docx/paragraph', 'docx/table', 'docx/paragraph'])
        self.assertEqual([c['text'] for c in units[1]['cells']], ['top', 'bottom'])
        self.assertEqual(units[1]['cells'][0]['vmerge'], 'restart')
        self.assertEqual(units[1]['cells'][1]['vmerge'], 'continue')

    def test_zip_traversal_and_valid_provenance(self):
        bad = self.root/'bad.zip'
        with zipfile.ZipFile(bad, 'w') as z: z.writestr('../escape.pdf', b'x')
        with self.assertRaisesRegex(ValueError, 'ARCHIVE_PATH'): pipeline.run(bad, self.out, worker=True)
        src = self.pdf(self.root/'member.pdf', 'child')
        good = self.root/'good.zip'
        with zipfile.ZipFile(good, 'w') as z: z.write(src, 'synthetic.pdf')
        r = pipeline.run(good, self.out, worker=True)
        self.assertEqual(r['children'][0]['member'], 'synthetic.pdf')
        self.assertEqual(r['children'][0]['sha'], hashlib.sha256(src.read_bytes()).hexdigest())

    def test_nested_git_output_denied(self):
        repo = self.root/'repo'; (repo/'nested').mkdir(parents=True); (repo/'.git').mkdir()
        with self.assertRaisesRegex(ValueError, 'OUTPUT_INSIDE_GIT'): pipeline.private_output(repo/'nested'/'out')

    def test_tsv_flags_and_literal_values(self):
        header = 'level\tleft\ttop\twidth\theight\tconf\ttext\n'
        rows = '5\t0\t0\t10\t10\t40\t0\n5\t10\t0\t10\t10\t99\t1,25\n5\t20\t0\t10\t10\t99\t—\n'
        words, flags = pipeline.tsv_words(header+rows, 1, 100, 90)
        self.assertEqual([w['text'] for w in words], ['0', '1,25', '—'])
        self.assertEqual(flags, ['OCR_LOW_CONFIDENCE', 'OCR_NUMERIC_REVIEW'])

    def test_blank_pdf_without_ocr_is_review_not_ready(self):
        from reportlab.pdfgen import canvas
        p = self.root/'blank.pdf'; c = canvas.Canvas(str(p)); c.showPage(); c.save()
        r = pipeline.run(p, self.out, worker=True)
        self.assertEqual(r['state'], 'REVIEW_REQUIRED'); self.assertIn('OCR_REQUIRED', r['flags'])
        self.assertNotIn('READY', r['state'])

    def test_corrupt_checkpoint_rejected_on_resume(self):
        src = self.pdf(self.root/'c.pdf'); r = pipeline.run(src, self.out, worker=True)
        unit = next(self.out.rglob(r['units'][0]+'.json')); saved = json.loads(unit.read_text()); saved['matn'] = 'tampered'; unit.write_text(json.dumps(saved))
        with self.assertRaisesRegex(ValueError, 'CHECKPOINT_INTEGRITY'): pipeline.run(src, self.out, worker=True)

    def test_cached_run_does_not_rewrite_unit(self):
        src = self.pdf(self.root/'cache.pdf'); r = pipeline.run(src, self.out, worker=True)
        unit = next(self.out.rglob(r['units'][0]+'.json')); before = unit.stat().st_mtime_ns
        pipeline.run(src, self.out, worker=True)
        self.assertEqual(before, unit.stat().st_mtime_ns)

    def test_error_state_can_resume_and_source_is_unchanged(self):
        src = self.pdf(self.root/'resume.pdf'); original = hashlib.sha256(src.read_bytes()).digest()
        r = pipeline.run(src, self.out, worker=True); manifest = next(self.out.glob('*/job.json'))
        state = json.loads(manifest.read_text()); state.update(state='ERROR', error='Synthetic interruption'); manifest.write_text(json.dumps(state))
        resumed = pipeline.run(src, self.out, worker=True)
        self.assertEqual(resumed['state'], 'REVIEW_REQUIRED'); self.assertEqual(hashlib.sha256(src.read_bytes()).digest(), original)

    def test_corrupt_zip_child_is_not_hidden_by_cached_parent(self):
        src = self.pdf(self.root/'child.pdf'); z = self.root/'parent.zip'
        with zipfile.ZipFile(z, 'w') as archive: archive.write(src, 'child.pdf')
        result = pipeline.run(z, self.out, worker=True)
        child = self.out/result['children'][0]['job_id']; unit = child/'page-1.json'
        content = json.loads(unit.read_text()); content['matn'] = 'changed'; unit.write_text(json.dumps(content))
        with self.assertRaisesRegex(ValueError, 'CHECKPOINT_INTEGRITY'): pipeline.run(z, self.out, worker=True)

    def test_binary_doc_requires_converter_and_does_not_claim_extracted_text(self):
        src = self.root/'legacy.doc'; src.write_bytes(b'SYNTHETIC-NOT-A-DOC')
        result = pipeline.run(src, self.out, worker=True)
        self.assertIn('CONVERTER_REQUIRED', result['flags']); self.assertEqual(result['completed'], 0)
        self.assertEqual(result['state'], 'REVIEW_REQUIRED')

    def test_ocr_adapter_confidence_and_coordinates(self):
        import subprocess
        from PIL import Image
        class Bitmap:
            def to_pil(self): return Image.new('RGB', (100, 100), 'white')
            def close(self): pass
        class Page:
            def render(self, scale): return Bitmap()
            def get_height(self): return 100
            def get_width(self): return 100
        tsv = b'level\tleft\ttop\twidth\theight\tconf\ttext\n5\t0\t0\t10\t10\t40\t0\n'
        config = dict(ocr='SYNTHETIC-EXE', lang='eng', threshold=90)
        with patch.object(pipeline.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, tsv)):
            result = pipeline.ocr_page(Page(), config)
        self.assertEqual(result['matn'], '0'); self.assertIn('OCR_NUMERIC_REVIEW', result['flags'])
        self.assertAlmostEqual(result['spans'][0]['bbox'][1], 100-10/(300/72))
        with patch.object(pipeline.subprocess, 'run', side_effect=subprocess.TimeoutExpired([], 1)):
            self.assertIn('OCR_FAILED', pipeline.ocr_page(Page(), config)['flags'])
        with patch.object(pipeline.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, tsv.splitlines()[0]+b'\n')):
            empty = pipeline.ocr_page(Page(), config)
        self.assertIsNone(empty['matn']); self.assertEqual(empty['method'], 'unread')
        self.assertIn('OCR_EMPTY', empty['flags'])

    def test_footnotes_keep_unique_ids_and_do_not_invent_pages(self):
        src = self.docx(self.root/'notes.docx')
        ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
        xml = f'<w:footnotes xmlns:w="{ns}"><w:footnote w:id="1"><w:p><w:r><w:t>zero 0</w:t></w:r></w:p></w:footnote><w:footnote w:id="2"><w:p><w:r><w:t>dash</w:t></w:r></w:p></w:footnote></w:footnotes>'
        with zipfile.ZipFile(src, 'a') as archive: archive.writestr('word/footnotes.xml', xml)
        result = pipeline.run(src, self.out, worker=True)
        notes = [k for k in result['units'] if k.startswith('footnote-')]
        self.assertEqual(len(notes), 2); self.assertEqual(len(set(notes)), 2)
        for key in notes:
            unit = json.loads(next(self.out.rglob(key+'.json')).read_text()); self.assertIsNone(unit['sahifa_pdf'])

    def test_converter_retains_original_and_derived_identity(self):
        import subprocess
        from docx import Document
        src = self.root/'source.doc'; src.write_bytes(b'SYNTHETIC-BINARY')
        def tool(args, **kwargs):
            if '--convert-to' in args:
                target = Path(args[args.index('--outdir')+1])/(Path(args[-1]).stem+'.docx')
                doc = Document(); doc.add_paragraph('Synthetic 0'); doc.save(target)
            return subprocess.CompletedProcess(args, 0, b'SYNTHETIC-CONVERTER/1')
        with patch.object(pipeline.subprocess, 'run', side_effect=tool):
            result = pipeline.run(src, self.out, converter='SYNTHETIC-EXE', worker=True)
        derived = next(self.out.glob('*/derived.docx'))
        self.assertEqual(result['source_sha'], hashlib.sha256(src.read_bytes()).hexdigest())
        self.assertEqual(result['derivative_sha'], hashlib.sha256(derived.read_bytes()).hexdigest())
        derived.write_bytes(b'corrupt')
        with patch.object(pipeline.subprocess, 'run', side_effect=tool):
            with self.assertRaisesRegex(ValueError, 'DERIVATIVE_INTEGRITY'):
                pipeline.run(src, self.out, converter='SYNTHETIC-EXE', worker=True)

    def test_archive_actual_decompression_limit(self):
        import io
        class Archive:
            def infolist(self): return [zipfile.ZipInfo('safe.pdf')]
            def open(self, info): return io.BytesIO(b'SYNTHETIC-LARGE')
            def close(self): pass
        with patch.object(pipeline.zipfile, 'ZipFile', return_value=Archive()), patch.object(pipeline, 'LIMIT', 3):
            with self.assertRaisesRegex(ValueError, 'ARCHIVE_ACTUAL_LIMIT'): pipeline.bounded_zip('synthetic')


if __name__ == '__main__':
    unittest.main()
