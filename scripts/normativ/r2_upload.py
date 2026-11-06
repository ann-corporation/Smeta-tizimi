"""Prepare private immutable K2 objects; default operation is offline dry-run."""
import argparse
import hashlib
import json
import os
import re
import uuid
from pathlib import Path
from urllib.request import Request, build_opener, HTTPRedirectHandler

import pipeline

DOC_KEYS = {'source_sha','job_sha','derivative_sha','reader_versiya','norma_kod','tahrir','nom','bayt','review_flags'}
CHUNK_KEYS = {'sha256','unit_sha','unit','tartib','sahifa_pdf','sahifa_bosma','bob_punkt','jadval_kod','qidiruv_yorliq','bayt'}
HEX = re.compile(r'^[0-9a-f]{64}$')

def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()

def sha(data): return hashlib.sha256(data).hexdigest()

def prepare(job_dir, original, nom):
    job = Path(job_dir).resolve()
    original = Path(original).resolve()
    pipeline.private_output(job.parent)
    state = json.loads((job/'job.json').read_text(encoding='utf-8'))
    source = original.read_bytes(); source_sha = sha(source)
    if state.get('children'): raise ValueError('ZIP_CHILD_JOBS_REQUIRE_INDIVIDUAL_UPLOAD')
    pipeline.validate_checkpoint(job, state, source_sha)
    if state.get('state') != 'REVIEW_REQUIRED': raise ValueError('REVIEW_REQUIRED_ONLY')
    if not HEX.fullmatch(job.name) or job.name != sha(canonical([source_sha, state['reader'], state['config']])):
        raise ValueError('JOB_SHA_INVALID')
    if state['source_sha'] != source_sha: raise ValueError('SOURCE_SHA_INVALID')
    derivative_sha = state.get('derivative_sha')
    objects = [(f'normativ/original/{source_sha}', source, source_sha)]
    if derivative_sha:
        derivative = (job/'derived.docx').read_bytes()
        if sha(derivative) != derivative_sha: raise ValueError('DERIVATIVE_INTEGRITY')
        objects.append((f'normativ/derived/{derivative_sha}', derivative, derivative_sha))
    chunks = []
    for order, unit in enumerate(state['units']):
        unit_bytes = (job/(unit+'.json')).read_bytes()
        saved = json.loads(unit_bytes.decode('utf-8'))
        unit_sha = saved.pop('sha')
        if sha(canonical(saved)) != unit_sha: raise ValueError('UNIT_SHA_INVALID')
        chunk = {'sha256':sha(unit_bytes),'unit_sha':unit_sha,'unit':unit,'tartib':order,
                 'sahifa_pdf':saved.get('sahifa_pdf'),'sahifa_bosma':saved.get('sahifa_bosma'),
                 'bob_punkt':saved.get('bob_punkt'),'jadval_kod':saved.get('jadval_kod'),
                 'qidiruv_yorliq':saved.get('qidiruv_yorliq') or '', 'bayt':len(unit_bytes)}
        chunk = {k:v for k,v in chunk.items() if k in CHUNK_KEYS}
        chunks.append(chunk)
        objects.append((f'normativ/chunks/{chunk["sha256"]}.json', unit_bytes, chunk['sha256']))
    # Full source text/bounds live ONLY in private R2 chunks; SQL receives metadata above.
    doc = {'source_sha':source_sha,'job_sha':job.name,'derivative_sha':derivative_sha,
           'reader_versiya':state['reader'],'norma_kod':state['config']['meta'].get('norma_kod'),
           'tahrir':state['config']['meta'].get('tahrir'),'nom':nom,'bayt':len(source),
           'review_flags':sorted(set(state.get('flags',[])))}
    doc = {k:v for k,v in doc.items() if k in DOC_KEYS}
    manifest = {'doc':doc,'chunks':chunks,'job_manifest':state}
    manifest_bytes = canonical(manifest)
    objects.append((f'normativ/manifests/{job.name}.json', manifest_bytes, sha(manifest_bytes)))
    return {'job_sha':job.name,'doc':doc,'chunks':chunks,'objects':objects}

def upload_one(client, bucket, key, body, digest):
    if sha(body) != digest: raise ValueError('OBJECT_HASH_MISMATCH')
    try:
        client.put_object(Bucket=bucket, Key=key, Body=body, Metadata={'sha256':digest}, IfNoneMatch='*')
    except Exception as error:
        response = getattr(error, 'response', {})
        status = response.get('ResponseMetadata', {}).get('HTTPStatusCode')
        if status != 412: raise
        existing = client.head_object(Bucket=bucket, Key=key)
        if existing.get('Metadata', {}).get('sha256') != digest or existing.get('ContentLength') != len(body):
            raise ValueError('IMMUTABLE_OBJECT_MISMATCH') from None

def verify_original(client, bucket, key, expected_size, expected_sha):
    digest = hashlib.sha256()
    size = 0
    stream = client.get_object(Bucket=bucket, Key=key)['Body']
    try:
        while block := stream.read(1024 * 1024):
            size += len(block)
            if size > expected_size:
                raise ValueError('R2_ORIGINAL_INTEGRITY')
            digest.update(block)
    finally:
        stream.close()
    if size != expected_size or digest.hexdigest() != expected_sha:
        raise ValueError('R2_ORIGINAL_INTEGRITY')


def register(plan, actor, operation_id, url, token):
    payload = {'p_actor_id':int(actor),'p_operation_id':operation_id,'p_doc':plan['doc'],'p_bolaklar':plan['chunks']}
    request = Request(url.rstrip('/')+'/rest/v1/rpc/t2_normativ_hujjat_qosh_v1', data=canonical(payload),
                      headers={'Authorization':'Bearer '+token,'apikey':token,'Content-Type':'application/json'}, method='POST')
    class NoRedirect(HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl): return None
    with build_opener(NoRedirect()).open(request, timeout=30) as response: result = json.loads(response.read())
    if not isinstance(result, dict) or result.get('ok') is not True: raise ValueError('RPC_REGISTRATION_FAILED')
    return result

def apply_plan(plan, env):
    required = ('R2_ACCOUNT_ID','AWS_ACCESS_KEY_ID','AWS_SECRET_ACCESS_KEY','R2_BUCKET','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','actor')
    if any(not env.get(k) for k in required): raise ValueError('APPLY_ENV_REQUIRED')
    base = env['SUPABASE_URL'].rstrip('/')
    if not re.fullmatch(r'https://[a-z0-9-]+\.supabase\.co', base): raise ValueError('SUPABASE_HTTPS_URL_REQUIRED')
    if not re.fullmatch(r'[0-9a-f]{32}', env['R2_ACCOUNT_ID']): raise ValueError('R2_ACCOUNT_INVALID')
    import boto3
    client = boto3.client('s3', endpoint_url='https://'+env['R2_ACCOUNT_ID']+'.r2.cloudflarestorage.com',
        aws_access_key_id=env['AWS_ACCESS_KEY_ID'], aws_secret_access_key=env['AWS_SECRET_ACCESS_KEY'],region_name='auto')
    for key, body, digest in plan['objects']:
        upload_one(client, env['R2_BUCKET'], key, body, digest)
        if key.startswith('normativ/original/'):
            verify_original(client, env['R2_BUCKET'], key, len(body), digest)
    operation = str(uuid.uuid5(uuid.NAMESPACE_URL, plan['job_sha']+':'+env['actor']))
    return register(plan, env['actor'], operation, base, env['SUPABASE_SERVICE_ROLE_KEY'])

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('job_dir'); parser.add_argument('original'); parser.add_argument('nom')
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--actor', type=int)
    args = parser.parse_args(); plan = prepare(args.job_dir, args.original, args.nom)
    if args.apply:
        if not args.actor or args.actor<1: parser.error('--actor required for apply')
        env = {k:os.environ.get(k) for k in ('R2_ACCOUNT_ID','AWS_ACCESS_KEY_ID','AWS_SECRET_ACCESS_KEY','R2_BUCKET','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY')}
        env['actor'] = str(args.actor)
        print(json.dumps(apply_plan(plan, env), ensure_ascii=False))
    else:
        print(json.dumps({'job_sha':plan['job_sha'],'objects':[{'key':k,'sha256':h,'bayt':len(b)} for k,b,h in plan['objects']]}, ensure_ascii=False))

if __name__ == '__main__': main()
