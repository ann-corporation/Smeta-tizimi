"""Reuse the verified local Wrangler/OAuth uploader. Never changes active pointers."""
import concurrent.futures
import importlib.util
import json
import pathlib
import sys

folder=pathlib.Path(sys.argv[1]).resolve()
helper=pathlib.Path(sys.argv[2]).resolve()
spec=importlib.util.spec_from_file_location('existing_r2_uploader',helper)
u=importlib.util.module_from_spec(spec);spec.loader.exec_module(u)
m=json.loads((folder/'manifest.json').read_text(encoding='utf-8'))
if m['schema']!='norm-suggestion-support-v1' or m['canExecuteCoefficients'] is not False:
    raise ValueError('MANIFEST_SCOPE_INVALID')
prefix='norm-katalog/suggestion-support/'+m['revision']
tasks=[]
for name,meta in m['files'].items():
    local=(folder/name).resolve()
    if local.parent!=folder:raise ValueError('PATH_ESCAPE')
    tasks.append((local,prefix+'/'+name,meta['compressedSha256']))
results=[]
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
    for result in pool.map(lambda args:u.upload(*args),tasks):results.append(result)
results.append(u.upload(folder/'manifest.json',prefix+'/manifest.json',u.sha(folder/'manifest.json')))
receipt={'schema':'norm-suggestion-publication-receipt-v1','status':'REMOTE_UPLOAD_AND_READBACK_VERIFIED',
    'prefix':prefix,'bucket':u.BUCKET,'revision':m['revision'],'objects':results,
    'totalBytes':sum(r['bytes'] for r in results),'activePointerChanged':False,'websiteIntegrated':False}
with (folder/'R2_RECEIPT.json').open('x',encoding='utf-8') as f:json.dump(receipt,f,ensure_ascii=False,indent=2)
print(json.dumps({'status':receipt['status'],'prefix':prefix,'objects':len(results),'bytes':receipt['totalBytes']}))
