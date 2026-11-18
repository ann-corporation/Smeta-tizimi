"""ShNK Phase 2 (offline): title-page title + edition year for remaining text PDFs, plus manifest and tekshiruv.

No DB, no R2. Outputs must stay outside Git (prepare.py enforces this).

  python tools/normativ-ingest/shnk_phase2_titles.py INVENTAR.csv TOP.csv ROOT OUTDIR

Writes OUTDIR/manifest.json (prepare.py input) and OUTDIR/tekshiruv.csv.
Rule: the title-page year wins over the inventory year; a difference is noted, not ambiguous.
Ambiguous = title-page year missing or conflicting, title not found, or not an amaldagi candidate.
"""
import csv
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(ROOT / 'scripts' / 'normativ'))
from pipeline import digest  # noqa: E402
import pypdfium2 as pdfium  # noqa: E402

STRONG = re.compile(r'(?i)(?:toshkent|тошкент|ташкент)\s*[,.\-]?\s*(19[89]\d|20[0-3]\d)')
ORDER = re.compile(r'(?<!\d)(20[0-3]\d)\s*(?:-?\s*yil|йил)', re.IGNORECASE)
TITLE_PAGES = 3


def read_csv(path):
    with open(path, encoding='utf-8-sig', newline='') as f:
        return list(csv.DictReader(f))


def pdf_pages(path, n=TITLE_PAGES):
    pdf = pdfium.PdfDocument(str(path))
    try:
        return [pdf[i].get_textpage().get_text_range() for i in range(min(n, len(pdf)))]
    finally:
        pdf.close()


def clean(s):
    return re.sub(r'\s+', ' ', s.replace('\u2019', "'")).strip(' "\u201c\u201d\u00ab\u00bb')


def find_title(first_page, code, fallback):
    lines = [l.strip() for l in first_page.splitlines() if l.strip()]
    for idx, line in enumerate(lines):
        if code in line:
            # Title is either on the code line itself or on the following lines.
            tail = line.split(code, 1)[1].strip()
            if len(tail) > 8:
                parts = [tail] + lines[idx + 1: idx + 2]
            else:
                parts = lines[idx + 1: idx + 3]
            text = clean(' '.join(p for p in parts if p))
            if len(text) >= 10:
                return text[:220], True
            break
    return fallback, False


def edition_year(text, inv_year):
    strong = sorted({int(m.group(1)) for m in STRONG.finditer(text)})
    order = sorted({int(m.group(1)) for m in ORDER.finditer(text)})
    if len(strong) == 1:
        return str(strong[0]), 'titul Toshkent', []
    if len(strong) > 1:
        return str(strong[-1]), 'titul Toshkent', ['titulda bir necha yil: ' + ','.join(map(str, strong))]
    if order:
        return str(order[-1]), 'buyruq yili', ['nashr yili titulda topilmadi (buyruq yili)']
    return (inv_year or 'REVIEW'), 'inventar', ['titul yili topilmadi']


def main(inventory, top, root, outdir):
    outdir = Path(outdir)
    outdir.mkdir(parents=True, exist_ok=True)
    rows = read_csv(inventory)
    inv = {r['file_name']: r for r in rows if r['source'] == 'D:\\ShNK'}
    top_names = {r['file_name'] for r in read_csv(top)}
    manifest, table = [], []

    for r in rows:
        name = r['file_name']
        base = dict(code=r['code_norm'], pages=r['pages'], language=r['lang'], file=name,
                    inv_year=r['edition_year'], candidate=r['amaldagi_candidate'])
        if r['ext'] != '.pdf':
            kind = {'.zip': 'zip', '.docx': 'docx'}.get(r['ext'], 'doc')
            if r['ext'] == '.doc':
                kind = 'doc'
            table.append(dict(base, title='', edition='', source_type=kind, ambiguous='',
                              note='ZIP ichidagi .doc: doc-konvertor bo\'limida' if kind == 'doc' else
                              ('ZIP arxiv' if kind == 'zip' else 'DOCX: PDF emas, paketlanmadi')))
            continue
        if r['text_status'] != 'text':
            table.append(dict(base, title='', edition=r['edition_year'], source_type='ocr', ambiguous='yes',
                              note=f"{r['text_status']} sahifalar: OCR kerak, tesseract o'rnatilmagan"))
            continue
        if name in top_names:
            table.append(dict(base, title='', edition=r['edition_year'], source_type='text', ambiguous='',
                              note='top-30 (phase1), bu yerda paketlanmagan'))
            continue
        if r['already_loaded'] == 'yes':
            table.append(dict(base, title='', edition=r['edition_year'], source_type='text', ambiguous='',
                              note='DBda bor (already_loaded), o\'tkazildi'))
            continue

        src = Path(root) / name
        data = src.read_bytes()
        if digest(data) != r['sha256']:
            raise ValueError('INVENTORY_SHA_MISMATCH ' + name)
        pages = pdf_pages(src)
        joined = '\n'.join(pages)
        fallback = (r['doc_type'] + ' ' + r['code_norm']).strip()
        title, found = find_title(pages[0], r['code_norm'], fallback)
        year, how, notes = edition_year(joined, r['edition_year'])
        ambiguous = []
        if how != 'titul Toshkent':
            ambiguous.append('yil: ' + how)
        if notes and how == 'titul Toshkent':
            ambiguous.append(notes[0])
        if not found:
            ambiguous.append('sarlavha titulda topilmadi')
        if r['amaldagi_candidate'] != 'yes':
            ambiguous.append('amaldagi nomzod emas')
        note_parts = []
        if r['edition_year'] and year != r['edition_year']:
            note_parts.append(f"titul yili {year}, inventar {r['edition_year']}: titul olindi")
        if how == 'inventar':
            note_parts.append('inventar yili ishlatildi')
        manifest.append(dict(path=name, source_sha=r['sha256'], norma_kod=r['code_norm'],
                             tahrir=year, title=title))
        table.append(dict(base, title=title, edition=year, source_type='text',
                          ambiguous='yes' if ambiguous else '',
                          note='; '.join(ambiguous + note_parts)))

    (outdir / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding='utf-8')
    cols = ['code', 'title', 'edition', 'pages', 'language', 'source_type', 'ambiguous', 'note', 'file', 'inv_year', 'candidate']
    with open(outdir / 'tekshiruv.csv', 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.DictWriter(f, fieldnames=cols, extrasaction='ignore')
        w.writeheader()
        for t in table:
            w.writerow(t)
    print(json.dumps(dict(manifest=len(manifest), table=len(table))))


if __name__ == '__main__':
    if len(sys.argv) != 5:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4])
