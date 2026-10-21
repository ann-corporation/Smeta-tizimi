"""Build immutable evidence payload. Does not update any active catalog pointer."""
import sqlite3,json,hashlib,argparse,importlib.util
from pathlib import Path
ROOT=Path('D:/CatalogMigration/coefficient-foundation-20261021-v1')
def build():
 db=sqlite3.connect((ROOT/'coefficient-reference.sqlite').as_uri()+'?mode=ro',uri=True);db.row_factory=sqlite3.Row
 payload={'schema':'construct-coefficient-reference-v1','source':'Construct 2.7.3','source_sha256':db.execute("select value from metadata where key='source_sha256'").fetchone()[0],
 'calculation_approved':False,'works':[r[0] for r in db.execute('select work_key from work order by work_key')],
 'rules':[dict(r) for r in db.execute('select * from coefficient_rule order by rule_id')],
 'scopes':[dict(r) for r in db.execute('select * from coefficient_scope_link order by scope_id')]}
 data=(json.dumps(payload,ensure_ascii=False,separators=(',',':'))+'\n').encode()
 digest=hashlib.sha256(data).hexdigest();out=ROOT/'runtime-reference';out.mkdir(exist_ok=True)
 p=out/'reference.json';p.write_bytes(data)
 key='reference-data/construct-coefficients/'+digest+'/reference.json'
 manifest={'key':key,'sha256':digest,'bytes':len(data),'source_sha256':payload['source_sha256'],'calculation_approved':False,
  'parent_release':'reference-data/construct-2.7.3/releases/543add7f9b82a053f3666549',
  'relationship':'Derived bounded-query index, not a replacement of raw source or active ABC catalog',
  'active_pointer_changed':False}
 parent=out/'PARENT_REMOTE_MANIFEST.json'
 if parent.exists():
  parent_data=json.loads(parent.read_text(encoding='utf8'))
  assert parent_data['revision']=='543add7f9b82a053f3666549' and parent_data['normativeApproval'] is False
  expected=Path('D:/CatalogMigration/construct-2-data/audit-20261021/r2-upload/manifest.json')
  assert hashlib.sha256(parent.read_bytes()).digest()==hashlib.sha256(expected.read_bytes()).digest()
  manifest['parent_manifest_sha256']=hashlib.sha256(parent.read_bytes()).hexdigest()
 for label,file in [('observed_active_koef','ACTIVE_KOEF.json'),('observed_active_norm','ACTIVE_NORM.json')]:
  if (out/file).exists(): manifest[label]=json.loads((out/file).read_text(encoding='utf8'))
 (out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
 print(json.dumps({'key':key,'sha256':digest,'bytes':len(data)}))
 return p,key,digest
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--publish',action='store_true');args=parser.parse_args();p,key,digest=build()
 if args.publish:
  spec=importlib.util.spec_from_file_location('upload',Path('D:/CatalogMigration/outputs/upload-reference-r2.py'));mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
  result=mod.upload(p,key,digest)
  (p.parent/'R2_RECEIPT.json').write_text(json.dumps(result,indent=2)+'\n')
  m=p.parent/'manifest.json'
  manifest_result=mod.upload(m,key.rsplit('/',1)[0]+'/manifest.json',hashlib.sha256(m.read_bytes()).hexdigest())
  (p.parent/'R2_MANIFEST_RECEIPT.json').write_text(json.dumps(manifest_result,indent=2)+'\n')
