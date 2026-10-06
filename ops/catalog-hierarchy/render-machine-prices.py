"""Read-only source PDFs -> page images and source metadata, not approved prices."""
import hashlib,json,pathlib,sys,subprocess
import pdfplumber
out=pathlib.Path(sys.argv[1])
if out.exists():raise ValueError('OUTPUT_EXISTS')
out.mkdir(parents=True)
sources=[]
for index,arg in enumerate(sys.argv[2:]):
    source=pathlib.Path(arg);folder=out/str(index);folder.mkdir()
    subprocess.run(['pdftoppm','-scale-to','2200','-png',str(source),str(folder/'page')],check=True)
    with pdfplumber.open(source) as doc:
        sources.append({'source':str(source),'sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'pages':len(doc.pages),
          'pageText':[p.extract_text() or '' for p in doc.pages],'images':str(folder)})
(out/'sources.json').write_text(json.dumps(sources,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps([{'pages':s['pages'],'images':s['images']}for s in sources]))
