"""Read-only OCR preparation: column crops, original PDFs and page renders unchanged."""
import json, pathlib, sys
from PIL import Image, ImageOps

source=pathlib.Path(sys.argv[1]);out=pathlib.Path(sys.argv[2])
if out.exists(): raise ValueError('OUTPUT_EXISTS')
out.mkdir(parents=True)
manifest=[]
for index in ['0','1']:
    for path in sorted((source/index).glob('page-*.png')):
        im=Image.open(path).convert('L');w,h=im.size
        # Price/name separately: faint diagonal watermarks must not become digits.
        for label,left,right in [('serial',.092,.146),('name',.148,.667),('price',.758,.890)]:
            crop=im.crop((int(w*left),0,int(w*right),h))
            crop=crop.point(lambda p: 0 if p<130 else 255)
            target=out/f'{index}-{path.stem}-{label}.png';crop.save(target)
            manifest.append({'image':target.name,'sourceIndex':int(index),'page':int(path.stem.split('-')[1]),
                             'column':label,'left':int(w*left),'width':w,'height':h})
(out/'crops.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'crops':len(manifest),'output':str(out)}))
