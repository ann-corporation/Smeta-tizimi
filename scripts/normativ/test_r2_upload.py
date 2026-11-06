import hashlib
import contextlib
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent))
import pipeline
import r2_upload as uploader

class FakeError(Exception):
    response = {'ResponseMetadata': {'HTTPStatusCode': 412}}

class FakeS3:
    def __init__(self, match=True): self.match = match; self.calls = []; self.heads = 0; self.fail_first = False
    def put_object(self, **kw):
        self.calls.append(kw)
        if self.fail_first or len(self.calls) > 1: raise FakeError()
    def head_object(self, **kw):
        self.heads += 1
        return {'Metadata': {'sha256': self.calls[-1]['Metadata']['sha256'] if self.match else 'bad'},
                'ContentLength': len(self.calls[-1]['Body'])}

class UploadTests(unittest.TestCase):
    def test_readback_checks_bytes_not_metadata(self):
        class Readback:
            def get_object(self, **kwargs):
                return {'Body': io.BytesIO(b'abc')}

        uploader.verify_original(Readback(), 'b', 'k', 3, uploader.sha(b'abc'))
        with self.assertRaisesRegex(ValueError, 'R2_ORIGINAL_INTEGRITY'):
            uploader.verify_original(Readback(), 'b', 'k', 3, uploader.sha(b'xyz'))

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.root = Path(self.tmp.name)
        self.job = self.root/'private'
        self.job.mkdir(); self.src = self.root/'source.pdf'; self.src.write_bytes(b'line one\nline two\n')
        self.source_sha = uploader.sha(self.src.read_bytes())
        self.unit = {'source_sha':self.source_sha,'reader':pipeline.READER,'unit':'page-1',
                     'matn':'PRIVATE BODY TEXT','spans':[],'sahifa_pdf':1,'sahifa_bosma':None}
        self.unit['sha'] = uploader.sha(uploader.canonical(self.unit))
        (self.job/'page-1.json').write_bytes(uploader.canonical(self.unit))
        self.state = {'state':'REVIEW_REQUIRED','source_sha':self.source_sha,'reader':pipeline.READER,
                      'config':{'meta':{'norma_kod':'N-1','tahrir':'1'}},'units':['page-1'],
                      'children':[],'flags':['SEMANTIC_REVIEW_REQUIRED']}
        self.job_name = uploader.sha(uploader.canonical([self.source_sha,pipeline.READER,self.state['config']]))
        self.job = self.job.with_name(self.job_name); self.job.mkdir()
        (self.job/'page-1.json').write_bytes(uploader.canonical(self.unit))
        (self.job/'job.json').write_text(json.dumps(self.state),encoding='utf-8')
    def tearDown(self): self.tmp.cleanup()
    def plan(self): return uploader.prepare(self.job,self.src,'synthetic.pdf')
    def test_hashes_allowlist_and_no_body(self):
        plan=self.plan(); chunk=plan['chunks'][0]
        self.assertEqual(chunk['sha256'],hashlib.sha256((self.job/'page-1.json').read_bytes()).hexdigest())
        self.assertEqual(set(plan['doc']),uploader.DOC_KEYS); self.assertEqual(set(chunk),uploader.CHUNK_KEYS)
        self.assertNotIn(b'PRIVATE BODY TEXT',uploader.canonical(chunk))
        body = next(b for k,b,h in plan['objects'] if k.startswith('normativ/chunks/'))
        self.assertIn(b'PRIVATE BODY TEXT',body)
        self.assertEqual(body,(self.job/'page-1.json').read_bytes())
        for key,body,digest in plan['objects']: self.assertEqual(uploader.sha(body),digest)
        self.assertEqual(plan['doc']['source_sha'],self.source_sha)
    def test_default_cli_is_offline_dry_run(self):
        output=io.StringIO()
        with patch.object(sys,'argv',['r2_upload.py',str(self.job),str(self.src),'synthetic.pdf']), \
             patch.object(uploader,'apply_plan',side_effect=AssertionError('apply')), \
             patch('urllib.request.urlopen',side_effect=AssertionError('network')), contextlib.redirect_stdout(output):
            uploader.main()
        self.assertIn('normativ/original/'+self.source_sha,output.getvalue())
    def test_conditional_put_and_412_match_or_abort(self):
        client=FakeS3(); client.fail_first=True
        uploader.upload_one(client,'b','k',b'abc',uploader.sha(b'abc'))
        self.assertEqual(client.calls[0]['IfNoneMatch'],'*'); self.assertEqual(client.heads,1)
        mismatch=FakeS3(False); mismatch.fail_first=True
        with self.assertRaisesRegex(ValueError,'IMMUTABLE_OBJECT_MISMATCH'):
            uploader.upload_one(mismatch,'b','k',b'abc',uploader.sha(b'abc'))
    def test_no_registration_when_any_upload_fails(self):
        env={'R2_ACCOUNT_ID':'0'*32,'AWS_ACCESS_KEY_ID':'x','AWS_SECRET_ACCESS_KEY':'x','R2_BUCKET':'x',
             'SUPABASE_URL':'https://project.supabase.co','SUPABASE_SERVICE_ROLE_KEY':'secret','actor':'7'}
        class BadClient:
            def put_object(self,**kw): raise RuntimeError('upload failed')
        import types
        with patch.dict(sys.modules,{'boto3':types.SimpleNamespace(client=lambda *a,**k:BadClient())}), patch.object(uploader,'register') as rpc:
            with self.assertRaisesRegex(RuntimeError,'upload failed'): uploader.apply_plan(self.plan(),env)
            rpc.assert_not_called()
    def test_no_registration_when_r2_readback_has_wrong_hash(self):
        from types import SimpleNamespace

        plan = self.plan()
        original = plan['objects'][0][1]
        corrupt = bytes([original[0] ^ 1]) + original[1:]
        env = {'R2_ACCOUNT_ID': '0' * 32, 'AWS_ACCESS_KEY_ID': 'test',
               'AWS_SECRET_ACCESS_KEY': 'test', 'R2_BUCKET': 'test',
               'SUPABASE_URL': 'https://synthetic.supabase.co',
               'SUPABASE_SERVICE_ROLE_KEY': 'test', 'actor': '7'}

        class CorruptReadback(FakeS3):
            def get_object(self, **kwargs):
                return {'Body': io.BytesIO(corrupt)}

        client = CorruptReadback()
        with patch.dict(sys.modules, {'boto3': SimpleNamespace(client=lambda *a, **k: client)}), \
             patch.object(uploader, 'register') as register:
            with self.assertRaisesRegex(ValueError, 'R2_ORIGINAL_INTEGRITY'):
                uploader.apply_plan(plan, env)
            register.assert_not_called()
        self.assertEqual(len(client.calls), 1)

    def test_zip_parent_children_rejected_and_tamper_detected(self):
        self.state['children']=[{'job_id':'f'*64,'sha':self.source_sha}]
        (self.job/'job.json').write_text(json.dumps(self.state),encoding='utf-8')
        with self.assertRaisesRegex(ValueError,'ZIP_CHILD_JOBS_REQUIRE_INDIVIDUAL_UPLOAD'): self.plan()
        self.state['children']=[]; (self.job/'job.json').write_text(json.dumps(self.state),encoding='utf-8')
        (self.job/'page-1.json').write_text('{"matn":"tampered"}',encoding='utf-8')
        with self.assertRaises((ValueError,KeyError)): self.plan()

if __name__ == '__main__': unittest.main()
