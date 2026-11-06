"""Local K1 extraction only. Output is forbidden inside any Git checkout."""
import argparse
import csv
import hashlib
import importlib.metadata
import io
import json
import os
import re
import subprocess
import sys
import tempfile
import zipfile
from contextlib import contextmanager
from pathlib import Path, PurePosixPath

READER = 'normativ-k1/1'
LIMIT = 128 * 1024 * 1024

def encoded(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False).encode('utf-8')

def digest(data):
    return hashlib.sha256(data).hexdigest()

def atomic(path, value):
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as f:
        temp = Path(f.name)
        f.write(encoded(value))
    try:
        os.replace(temp, path)
    finally:
        temp.unlink(missing_ok=True)

def private_output(path):
    path = Path(path).resolve()
    if any((p / '.git').exists() for p in (path, *path.parents)):
        raise ValueError('OUTPUT_INSIDE_GIT')
    path.mkdir(parents=True, exist_ok=True)
    return path

@contextmanager
def locked(path):
    with path.open('a+b') as f:
        f.write(b'0'); f.flush(); f.seek(0)
        if os.name == 'nt':
            import msvcrt
            msvcrt.locking(f.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
        try:
            yield
        finally:
            if os.name == 'nt':
                f.seek(0); msvcrt.locking(f.fileno(), msvcrt.LK_UNLCK, 1)

def package_versions():
    return {p: importlib.metadata.version(p) for p in ('pypdfium2', 'python-docx', 'Pillow')}

def validate_checkpoint(job, state, sha):
    if state['source_sha'] != sha or state['reader'] != READER:
        raise ValueError('CHECKPOINT_SCOPE')
    if state.get('derivative_sha') and digest((job/'derived.docx').read_bytes()) != state['derivative_sha']:
        raise ValueError('DERIVATIVE_INTEGRITY')
    for key in state['units']:
        if not re.fullmatch(r'(page|block|footnote)-\d+', key):
            raise ValueError('CHECKPOINT_UNIT_PATH')
        saved = json.loads((job/(key+'.json')).read_text(encoding='utf-8')); expected = saved.pop('sha')
        if digest(encoded(saved)) != expected or saved['source_sha'] != sha:
            raise ValueError('CHECKPOINT_INTEGRITY')
    for child in state['children']:
        if not re.fullmatch(r'[0-9a-f]{64}', child['job_id']):
            raise ValueError('CHECKPOINT_CHILD_PATH')
        folder = job.parent/child['job_id']
        validate_checkpoint(folder, json.loads((folder/'job.json').read_text(encoding='utf-8')), child['sha'])

def tool_version(path):
    if not path:
        return None
    result = subprocess.run([path, '--version'], capture_output=True, check=True, timeout=10)
    return (result.stdout or result.stderr).decode(errors='replace').splitlines()[0]

def tsv_words(tsv, scale, height, threshold):
    words, flags = [], []
    for row in csv.DictReader(io.StringIO(tsv), delimiter='\t'):
        if row['level'] != '5' or not row['text'].strip():
            continue
        confidence = float(row['conf'])
        if not 0 <= confidence <= 100:
            raise ValueError('OCR_CONFIDENCE_INVALID')
        x, y, w, h = (int(row[k]) for k in ('left', 'top', 'width', 'height'))
        if min(x, y, w, h) < 0:
            raise ValueError('OCR_BOUNDS_INVALID')
        words.append({'text': row['text'], 'confidence': confidence,
                      'bbox': [x/scale, height-(y+h)/scale, (x+w)/scale, height-y/scale]})
        if confidence < threshold:
            flags.append('OCR_LOW_CONFIDENCE')
        if re.search(r'\d', row['text']) and confidence < max(95, threshold):
            flags.append('OCR_NUMERIC_REVIEW')
    if not words:
        flags.append('OCR_EMPTY')
    return words, sorted(set(flags))

def ocr_page(page, config):
    if not config['ocr']:
        return {'matn': None, 'spans': [], 'flags': ['OCR_REQUIRED'], 'method': 'unread'}
    scale = 300 / 72
    if page.get_width() * page.get_height() * scale * scale > 40_000_000:
        return {'matn': None, 'spans': [], 'flags': ['OCR_IMAGE_LIMIT'], 'method': 'unread'}
    with tempfile.TemporaryDirectory() as folder:
        image = Path(folder) / 'page.png'
        bitmap = page.render(scale=scale)
        try:
            pil = bitmap.to_pil()
            pil.save(image)
            pil.close()
        finally:
            bitmap.close()
        try:
            result = subprocess.run([config['ocr'], str(image), 'stdout', '-l', config['lang'], 'tsv'],
                                    capture_output=True, check=True, timeout=60)
            words, flags = tsv_words(result.stdout.decode('utf-8'), scale, page.get_height(), config['threshold'])
            return {'matn': ' '.join(w['text'] for w in words) if words else None, 'spans': words,
                    'flags': flags, 'method': 'ocr' if words else 'unread'}
        except (OSError, subprocess.SubprocessError, ValueError, KeyError):
            return {'matn': None, 'spans': [], 'flags': ['OCR_FAILED'], 'method': 'unread'}

def pdf_units(source, config, exists):
    import pypdfium2 as pdfium
    with pdfium.PdfDocument(source) as doc:
        for i in range(len(doc)):
            key = 'page-' + str(i+1)
            if exists(key):
                yield key, None
                continue
            page = doc[i]
            textpage = page.get_textpage()
            try:
                text = textpage.get_text_range() if textpage.count_chars() <= 100_000 else None
                if text is None:
                    unit = {'matn': None, 'spans': [], 'method': 'unread', 'flags': ['NATIVE_PAGE_LIMIT']}
                elif text.strip():
                    spans = [{'text': textpage.get_text_range(j, 1), 'bbox': list(textpage.get_charbox(j))}
                             for j in range(textpage.count_chars())]
                    unit = {'matn': text, 'spans': spans, 'method': 'native', 'flags': []}
                    if next(page.get_objects(filter=[pdfium.raw.FPDF_PAGEOBJ_IMAGE]), None) is not None:
                        unit['flags'].append('IMAGE_REGION_REVIEW')
                else:
                    unit = ocr_page(page, config)
                yield key, dict(unit, sahifa_pdf=i+1, sahifa_bosma=None, origin='pdf', total_units=len(doc),
                                coordinate_space='pdf-points/bottom-left')
            finally:
                textpage.close(); page.close()

def bounded_zip(source):
    archive = zipfile.ZipFile(source, metadata_encoding='cp866')
    infos = archive.infolist()
    if len(infos) > 2000 or sum(i.file_size for i in infos) > LIMIT:
        archive.close(); raise ValueError('ARCHIVE_LIMIT')
    for i in infos:
        p = PurePosixPath(i.filename.replace('\\', '/'))
        if p.is_absolute() or '..' in p.parts or re.match(r'^[A-Za-z]:', str(p)):
            archive.close(); raise ValueError('ARCHIVE_PATH')
    try:
        total = 0
        for info in infos:
            actual = 0
            with archive.open(info) as member:
                while block := member.read(1024 * 1024):
                    total += len(block); actual += len(block)
                    if total > LIMIT:
                        raise ValueError('ARCHIVE_ACTUAL_LIMIT')
            if actual != info.file_size:
                raise ValueError('ARCHIVE_SIZE_MISMATCH')
    except Exception:
        archive.close(); raise
    return archive

def docx_units(source):
    from docx import Document
    from docx.text.paragraph import Paragraph
    with bounded_zip(source) as archive:
        footnotes = archive.read('word/footnotes.xml') if 'word/footnotes.xml' in archive.namelist() else None
    document = Document(source)
    review = ['TRACKED_REVISIONS_REVIEW'] if document._element.xpath('.//w:ins | .//w:del') else []
    for i, block in enumerate(document.iter_inner_content()):
        if isinstance(block, Paragraph):
            unit = {'matn': block.text, 'origin': 'docx/paragraph', 'paragraph': i}
        else:
            cells = []
            for r, row in enumerate(block._tbl.tr_lst):
                for c, cell in enumerate(row.tc_lst):
                    texts = [''.join(t.text or '' for t in p.xpath('.//w:t')) for p in cell.xpath('./w:p')]
                    merge = cell.xpath('./w:tcPr/w:vMerge')
                    cells.append({'row': r, 'cell': c, 'colspan': cell.grid_span,
                                  'vmerge': merge[0].get('{%s}val' % merge[0].nsmap['w'], 'continue') if merge else None,
                                  'text': '\n'.join(texts), 'xml': cell.xml})
            unit = {'matn': '\n'.join(c['text'] for c in cells), 'cells': cells, 'origin': 'docx/table', 'table': i}
        flags = review + (['NESTED_TABLE_REVIEW'] if not isinstance(block, Paragraph) and block._tbl.xpath('.//w:tc/w:tbl') else [])
        yield 'block-' + str(i), dict(unit, sahifa_pdf=None, sahifa_bosma=None, method='native', spans=[], flags=flags)
    if footnotes:
        from xml.etree import ElementTree as ET
        for i, note in enumerate(ET.fromstring(footnotes)):
            yield 'footnote-' + str(i), {'matn': ''.join(note.itertext()), 'xml': ET.tostring(note, encoding='unicode'),
                'origin': 'docx/footnote', 'sahifa_pdf': None, 'sahifa_bosma': None, 'flags': ['FOOTNOTE_LINK_REVIEW'], 'method': 'native', 'spans': []}

def run(source, output, meta=None, ocr=None, lang='rus+uzb_cyrl', threshold=90, timeout=180, converter=None, worker=False):
    source = Path(source).resolve()
    output = private_output(output)
    if source.stat().st_size > LIMIT or not 0 <= threshold <= 100:
        raise ValueError('INPUT_LIMIT_OR_THRESHOLD')
    source_bytes = source.read_bytes()
    sha = digest(source_bytes)
    config = dict(meta=meta or {}, ocr=ocr, lang=lang, threshold=threshold, converter=converter,
                  versions=package_versions(), reader_code_sha=digest(Path(__file__).read_bytes()),
                  ocr_version=tool_version(ocr), converter_version=tool_version(converter))
    annotations = config['meta'].get('annotations', {})
    limits = {'qidiruv_yorliq': 500, 'jadval_kod': 120, 'bob_punkt': 120, 'iqtibos_anchor': 160}
    if not isinstance(annotations, dict) or any(
        not isinstance(fields, dict) or not fields or any(
            key not in limits or not isinstance(value, str) or not value.strip() or len(value) > limits[key]
            for key, value in fields.items()
        ) for fields in annotations.values()
    ):
        raise ValueError('INVALID_REVIEWED_ANNOTATION')
    chunk_meta = {k: v for k, v in config['meta'].items() if k != 'annotations'}
    job = output / digest(encoded([sha, READER, config]))
    job.mkdir(exist_ok=True)
    manifest = job / 'job.json'
    if not worker:
        args = dict(source=str(source), output=str(output), meta=meta, ocr=ocr, lang=lang,
                    threshold=threshold, converter=converter, worker=True)
        try:
            subprocess.run([sys.executable, str(Path(__file__).resolve()), '--worker', json.dumps(args)],
                           capture_output=True, check=True, timeout=timeout)
        except subprocess.TimeoutExpired:
            raise TimeoutError('EXTRACTION_TIMEOUT_CHECKPOINT_RETAINED') from None
        except subprocess.CalledProcessError:
            raise RuntimeError('EXTRACTION_FAILED_SEE_LOCAL_JOB') from None
        if digest(source.read_bytes()) != sha:
            raise ValueError('SOURCE_CHANGED')
        return json.loads(manifest.read_text(encoding='utf-8'))
    with locked(job / '.lock'), tempfile.TemporaryDirectory() as snapshot:
        # Every reader consumes the exact bytes hashed above, not a changing original path.
        source = Path(snapshot)/(sha+source.suffix.lower()); source.write_bytes(source_bytes)
        state = {'format': 'normativ-job/1', 'source_sha': sha, 'reader': READER, 'config': config,
                 'state': 'UPLOADED', 'completed': 0, 'extracted_units': 0, 'units': [], 'children': [], 'flags': ['SEMANTIC_REVIEW_REQUIRED']}
        if not all(config['meta'].get(k) for k in ('norma_kod','tahrir')):
            state['flags'].append('METADATA_UNCONFIRMED')
        if manifest.exists():
            state = json.loads(manifest.read_text(encoding='utf-8'))
            validate_checkpoint(job, state, sha)
            if state['state'] == 'REVIEW_REQUIRED':
                return state
        else:
            atomic(manifest, state)
        state.pop('error', None)
        state['state'] = 'EXTRACTING'; atomic(manifest, state)
        try:
            suffix = source.suffix.lower()
            if suffix == '.zip':
                with bounded_zip(source) as archive, tempfile.TemporaryDirectory() as folder:
                    state['total'] = sum(not i.is_dir() for i in archive.infolist())
                    for info in archive.infolist():
                        if info.is_dir():
                            continue
                        data = archive.read(info)
                        ext = PurePosixPath(info.filename).suffix.lower()
                        if ext not in ('.pdf', '.docx', '.doc'):
                            state['flags'].append('UNSUPPORTED_MEMBER_REVIEW')
                            unread = state.setdefault('unread_members', [])
                            if info.filename not in unread:
                                unread.append(info.filename)
                            continue
                        child = Path(folder) / (digest(data) + ext); child.write_bytes(data)
                        child_meta = dict(config['meta'], parent_sha=sha, member=info.filename)
                        result = run(child, output, child_meta, ocr, lang, threshold, converter=converter, worker=True)
                        child_id = digest(encoded([result['source_sha'], READER, result['config']]))
                        if not any(c['job_id'] == child_id for c in state['children']):
                            state['children'].append({'job_id': child_id, 'sha': result['source_sha'], 'member': info.filename,
                                'state': result['state'], 'completed': result['completed'], 'extracted_units': result['extracted_units']})
                        state['flags'] = sorted(set(state['flags'] + result['flags']))
                        state['completed'] = len(state['children']) + len(state.get('unread_members', []))
                        atomic(manifest, state)
            else:
                def exists(key):
                    path = job / (key + '.json')
                    if not path.exists():
                        return False
                    saved = json.loads(path.read_text(encoding='utf-8')); expected = saved.pop('sha')
                    if digest(encoded(saved)) != expected or saved['source_sha'] != sha:
                        raise ValueError('CHECKPOINT_INTEGRITY')
                    return True
                with tempfile.TemporaryDirectory() as folder:
                    original = source
                    if suffix == '.doc' and converter:
                        derived = job/'derived.docx'
                        if not derived.exists():
                            subprocess.run([converter, '-env:UserInstallation=' + (Path(folder)/'profile').as_uri(),
                                '--headless', '--convert-to', 'docx', '--outdir', folder, str(source)],
                                capture_output=True, check=True, timeout=60)
                            converted = Path(folder)/(source.stem+'.docx')
                            if converted.stat().st_size > LIMIT:
                                raise ValueError('CONVERTER_LIMIT')
                            converted.replace(derived)
                            state['derivative_sha'] = digest(derived.read_bytes()); atomic(manifest, state)
                        if digest(derived.read_bytes()) != state.get('derivative_sha'):
                            raise ValueError('DERIVATIVE_INTEGRITY')
                        source = derived; suffix = '.docx'
                    if suffix not in ('.pdf', '.docx'):
                        state['flags'].append('CONVERTER_REQUIRED' if suffix == '.doc' else 'UNSUPPORTED_SOURCE')
                    else:
                        units = pdf_units(source, config, exists) if suffix == '.pdf' else docx_units(source)
                        for key, unit in units:
                            if unit is not None and not exists(key):
                                if 'total_units' in unit:
                                    state['total'] = unit.pop('total_units')
                                chunk = dict(chunk_meta, **unit, source_sha=sha, reader=READER, unit=key,
                                    norma_kod=config['meta'].get('norma_kod'), tahrir=config['meta'].get('tahrir'),
                                    bob_punkt=None, jadval_kod=None, original_kind=original.suffix.lower(), derivative_sha=state.get('derivative_sha'))
                                if key in annotations:
                                    if unit['method'] == 'unread':
                                        raise ValueError('ANNOTATION_ON_UNREAD_UNIT')
                                    anchor = annotations[key].get('iqtibos_anchor')
                                    if anchor and anchor not in chunk['matn']:
                                        raise ValueError('CITATION_ANCHOR_NOT_FOUND')
                                    chunk.update(annotations[key])
                                chunk['sha'] = digest(encoded(chunk)); atomic(job/(key+'.json'), chunk)
                            saved = json.loads((job/(key+'.json')).read_text(encoding='utf-8'))
                            state['flags'] = sorted(set(state['flags'] + saved['flags']))
                            if key not in state['units']:
                                state['units'].append(key)
                            state['completed'] = len(state['units']); atomic(manifest, state)
            if set(annotations) - set(state['units']):
                raise ValueError('ANNOTATION_UNIT_NOT_FOUND')
            state['total'] = state.get('total', state['completed'])
            state['extracted_units'] = sum(json.loads((job/(k+'.json')).read_text(encoding='utf-8'))['method'] != 'unread' for k in state['units']) + sum(c['extracted_units'] for c in state['children'])
            if state['extracted_units']:
                state['state'] = 'EXTRACTED'; atomic(manifest, state)
            if state['extracted_units'] < len(state['units']) or state.get('unread_members'):
                state['flags'] = sorted(set(state['flags'] + ['PARTIAL_EXTRACTION_REVIEW']))
            state['state'] = 'REVIEW_REQUIRED'; atomic(manifest, state)
        except Exception as error:
            state['state'] = 'ERROR'; state['error'] = type(error).__name__; atomic(manifest, state)
            raise
        return state

if __name__ == '__main__':
    if len(sys.argv) == 3 and sys.argv[1] == '--worker':
        run(**json.loads(sys.argv[2]))
    else:
        parser = argparse.ArgumentParser(description=__doc__)
        parser.add_argument('source'); parser.add_argument('output')
        parser.add_argument('--norma-kod'); parser.add_argument('--tahrir')
        parser.add_argument('--ocr'); parser.add_argument('--converter'); parser.add_argument('--lang', default='rus+uzb_cyrl')
        parser.add_argument('--threshold', type=float, default=90); parser.add_argument('--timeout', type=float, default=180)
        args = vars(parser.parse_args()); meta = {k: args.pop(k) for k in ('norma_kod','tahrir')}
        result = run(**args, meta=meta)
        print(json.dumps({k: result[k] for k in ('source_sha','state','completed','flags')}, ensure_ascii=False))
