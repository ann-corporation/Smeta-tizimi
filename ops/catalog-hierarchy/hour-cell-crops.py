"""OCR cell evidence with table lines excluded; original sources are untouched."""
import json,pathlib,sys
import numpy as np
from PIL import Image,ImageOps
root=pathlib.Path(sys.argv[1]);out=pathlib.Path(sys.argv[2])
if out.exists():raise ValueError('OUTPUT_EXISTS')
out.mkdir(parents=True);records=[]
for index in ['0','1']:
 for path in sorted((root/index).glob('page-*.png')):
  im=Image.open(path).convert('L');a=np.array(im);h,w=a.shape
  # Table horizontal lines may slope a few pixels. A 9px vertical window
  # detects their coverage, without filling missing rows by guessed serials.
  dark=a[:,int(w*.16):int(w*.89)]<135
  cover=np.zeros(h)
  for y in range(5,h-5):cover[y]=dark[y-4:y+5].any(axis=0).mean()
  groups=[];prev=-9
  for y in np.flatnonzero(cover>.83):
   if y>prev+1:groups.append([])
   groups[-1].append(int(y));prev=y
  bounds=[round(sum(g)/len(g)) for g in groups]
  for n,(top,bottom) in enumerate(zip(bounds,bounds[1:])):
   if bottom-top<25 or bottom-top>190:continue
   # ignore top headers and bottom page numbering
   if top<h*.16 or bottom>h*.94:continue
   rid=f'{index}-{path.stem}-row-{n:03}'
   rec={'sourceIndex':int(index),'page':int(path.stem.split('-')[1]),'top':top,'bottom':bottom,'id':rid}
   for label,l,r in [('price',.773,.875),('name',.150,.664),('serial',.100,.143)]:
    cell=im.crop((int(w*l),top+7,int(w*r),bottom-7))
    if label=='price':
     for variant in ['gray','threshold']:
      img=cell if variant=='gray' else cell.point(lambda v:0 if v<150 else 255)
      img=img.resize((img.width*2,img.height*2))
      img=ImageOps.expand(img,border=20,fill=255)
      filename=f'{rid}-{variant}.png';img.save(out/filename);rec[variant]=filename
   records.append(rec)
(out/'cells.json').write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'cells':len(records),'pages':36,'counts':{i:sum(r['sourceIndex']==i for r in records) for i in [0,1]}}))
