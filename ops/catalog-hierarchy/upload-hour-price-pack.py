"""Immutable hourly references. No material catalogue CURRENT pointer or DB mutation."""
import importlib.util
import json
import pathlib
import sys
import tempfile

spec=importlib.util.spec_from_file_location('r2upload','D:/CatalogMigration/outputs/upload-reference-r2.py')
helper=importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)
folder=pathlib.Path(sys.argv[1])
manifest=json.loads((folder/'manifest.json').read_text(encoding='utf-8'))
prefix='hour-price-catalog/'+manifest['revision']
results=[]
sources=json.loads(pathlib.Path('D:/CatalogMigration/outputs/machine-prices-2023-2025-sources-v1/sources.json').read_text(encoding='utf-8'))
sources.append({'source':'C:/Users/anvar/Downloads/Telegram Desktop/Иш хаки 2026 йил.xls',
 'sha256':'813c3261c92bb2548bb65755a74f836baced78458b4fc9d4e590afa13bf27f54'})
for entry in sources:
    local=pathlib.Path(entry['source'])
    expected=entry['sha256']
    if helper.sha(local)!=expected: raise ValueError('ORIGINAL_SOURCE_CHANGED')
    key='hour-price-catalog/sources/'+expected+local.suffix.lower()
    with tempfile.TemporaryDirectory(prefix='hour-source-verify-') as temp:
        readback=pathlib.Path(temp)/'object.bin'
        if helper.get(key,readback):
            if helper.sha(readback)!=expected: raise ValueError('SOURCE_IMMUTABLE_CONFLICT')
        else:
            content='application/pdf' if local.suffix.lower()=='.pdf' else 'application/vnd.ms-excel'
            code,message=helper.call(['put',helper.BUCKET+'/'+key,'--file',str(local),'--content-type',content])
            if code: raise RuntimeError('SOURCE_UPLOAD_FAILED '+message[-1000:])
            if not helper.get(key,readback) or helper.sha(readback)!=expected: raise ValueError('SOURCE_READBACK_FAILED')
        result={'key':key,'sha256':expected,'remoteReadbackSha256':helper.sha(readback),'verified':True}
        results.append(result)
        print(json.dumps(result),flush=True)
for name in ('catalog.json','manifest.json'):
    source=folder/name
    results.append(helper.upload(source,prefix+'/'+name,helper.sha(source)))
receipt={'revision':manifest['revision'],'objects':results,'activeMaterialPointerChanged':False,'websiteIntegrated':False}
with (folder/'R2_SOURCES_RECEIPT.json').open('x',encoding='utf-8') as file:
    json.dump(receipt,file,ensure_ascii=False,indent=2)
