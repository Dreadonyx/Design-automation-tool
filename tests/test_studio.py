import io
import json
import tempfile
import time
import unittest
import zipfile
from unittest.mock import patch
from PIL import Image
from PIL.PngImagePlugin import PngInfo
import os
from studio.app import create_app
from studio import providers


class StudioTests(unittest.TestCase):
    def setUp(self):
        self.env=patch.dict(os.environ,{},clear=True);self.env.start()
        self.temp=tempfile.TemporaryDirectory(); self.app=create_app(self.temp.name)
        self.client=self.app.test_client(); self.headers={'X-Studio-Token':self.client.get('/api/bootstrap').json['token']}
    def tearDown(self):
        self.app.extensions['studio_executor'].shutdown(wait=True); self.temp.cleanup();self.env.stop()
    def post(self,path,data):
        if path.endswith('/jobs'): data={'quality':'draft',**data}
        return self.client.post(path,json=data,headers=self.headers)
    def theme(self,**kw):
        r=self.post('/api/themes',dict(brief='Diwali technology festival',**kw));self.assertEqual(r.status_code,201,r.json);return r.json
    def wait(self,j):
        for _ in range(100):
            r=self.client.get('/api/jobs/'+j['id']).json
            if r['status'] not in ['queued','running']: return r
            time.sleep(.02)
        self.fail('Job did not complete')
    def test_auth_and_validation(self):
        self.assertEqual(self.client.post('/api/themes',json={'brief':'hi'}).status_code,403)
        self.assertEqual(self.client.get('/api/bootstrap',headers={'Host':'evil.example'}).status_code,400)
        for d in [{'brief':42},{'brief':'x','palette':{'bg':'javascript:bad'}},{'brief':'x','references':['../x']},{'brief':''}]:
            self.assertEqual(self.post('/api/themes',d).status_code,400)
    def test_version_restore_and_conflict(self):
        t=self.theme(); old=self.client.get('/api/themes/'+t['id']).json['versions'][0]
        t['name']='Changed'; r=self.client.put('/api/themes/'+t['id'],json=t,headers=self.headers)
        self.assertEqual(r.json['version'],2)
        self.assertEqual(self.client.put('/api/themes/'+t['id'],json=t,headers=self.headers).status_code,409)
        restored=self.post(f'/api/themes/{t["id"]}/restore/{old["id"]}',{}).json
        self.assertEqual(restored['version'],3); self.assertNotEqual(restored['name'],'Changed')
    def test_batch_export_and_seed_zero(self):
        t=self.theme(); d=dict(count=2,width=128,height=192,seed=0,chain=['procedural'])
        j=self.wait(self.post('/api/themes/'+t['id']+'/jobs',d).json)
        self.assertEqual(j['status'],'completed');self.assertEqual(len(j['assets']),2)
        a=self.client.get('/api/themes/'+t['id']).json['assets'];self.assertEqual(sorted(x['seed'] for x in a),[0,1])
        for image in a:
            response=self.client.get(image['url'])
            with Image.open(io.BytesIO(response.data)) as im: self.assertEqual(im.size,(128,192))
            response.close()
        archive=self.client.get('/api/themes/'+t['id']+'/export')
        with zipfile.ZipFile(io.BytesIO(archive.data)) as z:
            self.assertIn('website-prompt.txt',z.namelist()); self.assertIn('manifest.json',z.namelist())
            self.assertEqual(json.loads(z.read('theme.json'))['palette'],t['palette'])
    def test_invalid_job_input(self):
        t=self.theme()
        for d in [dict(count=0),dict(count=25),dict(width=99999),dict(width=513),dict(seed=-1),dict(chain=['untrusted']),dict(chain=[{}]),dict(reference_mode='image')]:
            r=self.post('/api/themes/'+t['id']+'/jobs',d);self.assertEqual(r.status_code,400,r.json)
    def test_upload_and_reference_mode_no_silent_downgrade(self):
        image=io.BytesIO(); Image.new('RGB',(100,100),'red').save(image,format='PNG');image.seek(0)
        r=self.client.post('/api/references',data={'file':(image,'reference.png'),'role':'style'},headers=self.headers).json
        self.assertEqual(r['palette'][0],'#FF0000')
        t=self.theme(references=[r['id']]);j=self.wait(self.post('/api/themes/'+t['id']+'/jobs',dict(count=1,chain=['procedural'],reference_mode='image')).json)
        self.assertEqual(j['status'],'failed');self.assertEqual(j['assets'],[])
        self.assertEqual(j['failures'][0]['attempts'][0]['status'],'skipped')
    def test_provider_failure_falls_back_and_circuit_breaks(self):
        t=self.theme(); real=providers.generate; calls=[]
        def gen(p,*args,**kw):
            calls.append(p['id'])
            if p['id']=='hf-flux': raise providers.ProviderError('Quota exhausted')
            return real(p,*args,**kw)
        with patch('studio.providers.availability',return_value=(True,'')),patch('studio.providers.generate',side_effect=gen):
            j=self.wait(self.post('/api/themes/'+t['id']+'/jobs',dict(count=2,chain=['hf-flux','procedural'])).json)
        self.assertEqual(j['status'],'completed');self.assertEqual(calls,['hf-flux','procedural','procedural'])
    def test_content_rejection_does_not_fallback(self):
        t=self.theme()
        with patch('studio.providers.availability',return_value=(True,'')),patch('studio.providers.generate',side_effect=providers.ContentRejected('declined')) as gen:
            j=self.wait(self.post('/api/themes/'+t['id']+'/jobs',dict(count=1,chain=['hf-flux','procedural'])).json)
        self.assertEqual(j['status'],'failed');self.assertEqual(gen.call_count,1)
    def test_local_caps_dimensions(self):
        t=self.theme(); dims=[]
        def gen(p,prompt,seed,w,h,theme,reference):
            dims.append((w,h));return providers.procedural(theme,seed,w,h)
        with patch('studio.providers.availability',return_value=(True,'')),patch('studio.providers.generate',side_effect=gen):
            self.wait(self.post('/api/themes/'+t['id']+'/jobs',dict(count=1,width=1024,height=1536,chain=['local-tiny'])).json)
        self.assertEqual(dims,[(320,512)])
    def test_reproducible_procedural_and_theme_prompt(self):
        t=self.theme();a=providers.procedural(t,42,128,128);b=providers.procedural(t,42,128,128)
        self.assertEqual(a,b)
        prompt=self.client.get('/api/themes/'+t['id']+'/web-prompt').json['prompt']
        self.assertIn(t['palette']['primary'],prompt);self.assertIn(t['fonts']['heading'],prompt)
    def test_import_and_clean_export_keeps_original(self):
        t=self.theme(); buffer=io.BytesIO(); metadata=PngInfo();metadata.add_text('prompt','Private generation notes')
        Image.new('RGB',(96,96),'blue').save(buffer,format='PNG',pnginfo=metadata);buffer.seek(0)
        result=self.client.post('/api/themes/'+t['id']+'/import',data={'file':(buffer,'image.png')},headers=self.headers)
        self.assertEqual(result.status_code,201,result.json)
        asset=result.json
        original=self.client.get(asset['url']);clean=self.client.get(asset['url']+'?clean=1')
        with Image.open(io.BytesIO(original.data)) as image:self.assertIn('prompt',image.info)
        with Image.open(io.BytesIO(clean.data)) as image:self.assertNotIn('prompt',image.info)
        original.close();clean.close()
    def test_ai_draft_validates_malformed_response_and_falls_back(self):
        with patch('studio.intelligence.status',return_value={'gemini':True,'ollama':False}),patch.dict(os.environ,{'GEMINI_API_KEY':'test'}),patch('studio.intelligence.request_json',return_value={'candidates':[{'content':{'parts':[{'text':'{"palette":{"bg":"bad"}}'}]}}]}):
            response=self.post('/api/draft',{'brief':'Music night'})
        self.assertEqual(response.status_code,200)
        self.assertEqual(len(response.json['analysis_attempts']),1)
        self.assertTrue(response.json['palette']['bg'].startswith('#'))
    def test_local_qwen_draft_validates_response(self):
        suggestion={'name':'Botanical Night','direction':'Botanical forms glow against a quiet indigo field.',
            'avoid':'visual clutter','palette':{'bg':'#171F39','surface':'#263152','primary':'#82A6FF',
            'secondary':'#D29BEF','accent':'#F6A35D','text':'#F2F5FF','muted':'#A6B2CE'},
            'fonts':{'heading':'Space Grotesk','body':'IBM Plex Sans'}}
        with patch.dict(os.environ,{'OLLAMA_ENABLED':'1','OLLAMA_URL':'http://ollama-test:11434/'}),patch('studio.intelligence.request_json',return_value={'response':json.dumps(suggestion)}) as request:
            response=self.post('/api/draft',{'brief':'A botanical music night'})
        self.assertEqual(response.status_code,200)
        self.assertTrue(response.json['analysis'].startswith('Local Qwen 2.5 3B'))
        self.assertEqual(response.json['palette'],suggestion['palette'])
        self.assertEqual(request.call_args.args[0],'http://ollama-test:11434/api/generate')
        self.assertIn('#RRGGBB',request.call_args.args[1]['prompt'])
    def test_providers_disabled_without_explicit_free_account_declaration(self):
        with patch.dict(os.environ,{'HF_TOKEN':'test','CF_API_TOKEN':'test','CF_ACCOUNT_ID':'123'}):
            for p in providers.CATALOG:
                if p['kind'] in ['hf','cloudflare']:self.assertFalse(providers.availability(p)[0])
    def test_cancel_queued_batch(self):
        import threading
        started=threading.Event();release=threading.Event();real=providers.generate
        def gen(*args,**kw):
            started.set();release.wait(3);return real(*args,**kw)
        t=self.theme()
        with patch('studio.providers.generate',side_effect=gen):
            first=self.post('/api/themes/'+t['id']+'/jobs',dict(count=1,chain=['procedural'])).json
            self.assertTrue(started.wait(2))
            second=self.post('/api/themes/'+t['id']+'/jobs',dict(count=2,chain=['procedural'])).json
            self.post('/api/jobs/'+second['id']+'/cancel',{})
            release.set();self.wait(first);state=self.wait(second)
        self.assertEqual(state['status'],'cancelled');self.assertEqual(state['assets'],[])
    def test_final_quality_never_uses_draft_fallback(self):
        t=self.theme()
        with patch('studio.providers.availability',return_value=(True,'')),patch('studio.providers.generate',side_effect=providers.ProviderError('Quota exhausted')) as gen:
            j=self.wait(self.post('/api/themes/'+t['id']+'/jobs',dict(count=1,width=1024,height=1024,quality='final',chain=['hf-flux','local-tiny','procedural'])).json)
        self.assertEqual(j['status'],'failed');self.assertEqual(gen.call_count,1)
        self.assertEqual([a['status'] for a in j['failures'][0]['attempts']],['failed','skipped','skipped'])
    def test_final_quality_rejects_small_native_output(self):
        t=self.theme()
        raw,_=providers.procedural(t,1,512,512)
        with patch('studio.providers.availability',return_value=(True,'')),patch('studio.providers.generate',return_value=(raw,None)):
            j=self.wait(self.post('/api/themes/'+t['id']+'/jobs',dict(count=1,width=1024,height=1024,quality='final',chain=['hf-flux'])).json)
        self.assertEqual(j['status'],'failed');self.assertEqual(len(j['failures']),1)
    def test_persistence_restart(self):
        t=self.theme(); other=create_app(self.temp.name)
        try: self.assertEqual(other.test_client().get('/api/themes/'+t['id']).json['theme']['id'],t['id'])
        finally: other.extensions['studio_executor'].shutdown(wait=True)

    def test_reference_only_theme_and_final_pixel_guidance(self):
        refs=[]
        for color in ['red','blue']:
            image=io.BytesIO();Image.new('RGB',(100,100),color).save(image,format='PNG');image.seek(0)
            refs.append(self.client.post('/api/references',data={'file':(image,'reference.png'),'role':'style'},headers=self.headers).json['id'])
        response=self.post('/api/themes',{'references':refs})
        self.assertEqual(response.status_code,201);t=response.json
        raw,_=providers.procedural(t,42,1024,1024)
        with patch('studio.providers.availability',return_value=(True,'')),patch('studio.providers.generate',return_value=(raw,None)) as generate:
            j=self.wait(self.post('/api/themes/'+t['id']+'/jobs',dict(count=1,quality='final',chain=['hf-flux','cf-klein'],reference_mode='image')).json)
        self.assertEqual(j['status'],'completed');self.assertEqual(generate.call_count,1)
        args=generate.call_args.args
        self.assertEqual(args[0]['id'],'cf-klein');self.assertEqual(len(args[-1]),2)
        self.assertIn('Input image 1: use for style',args[1])

    def test_multiple_references_never_silently_dropped_by_local(self):
        refs=[]
        for _ in range(2):
            image=io.BytesIO();Image.new('RGB',(100,100),'blue').save(image,format='PNG');image.seek(0)
            refs.append(self.client.post('/api/references',data={'file':(image,'reference.png'),'role':'style'},headers=self.headers).json['id'])
        t=self.theme(references=refs)
        with patch('studio.providers.availability',return_value=(True,'')),patch('studio.providers.generate') as generate:
            j=self.wait(self.post('/api/themes/'+t['id']+'/jobs',dict(count=1,chain=['local-tiny'],reference_mode='image')).json)
        self.assertEqual(j['status'],'failed');generate.assert_not_called()

    def test_cloudflare_multipart_contract(self):
        import base64
        from email.parser import BytesParser
        from email.policy import default
        t=self.theme();raw,_=providers.procedural(t,42,1024,1024)
        path=os.path.join(self.temp.name,'reference.png');Image.new('RGB',(1600,900),'purple').save(path)
        response=io.BytesIO(json.dumps({'result':{'image':base64.b64encode(raw).decode()}}).encode())
        response.headers={'Content-Type':'application/json'}
        klein=next(p for p in providers.CATALOG if p['id']=='cf-klein')
        with patch.dict(os.environ,{'CF_ACCOUNT_ID':'abc123','CF_API_TOKEN':'private-test-token'}),patch('studio.providers.urllib.request.urlopen',return_value=response) as request:
            result,_=providers.generate(klein,'Preserve image 0 style',42,1024,1024,t,[path])
        self.assertEqual(result,raw)
        req=request.call_args.args[0]
        message=BytesParser(policy=default).parsebytes(('Content-Type: '+req.get_header('Content-type')+'\r\n\r\n').encode()+req.data)
        parts={p.get_param('name',header='content-disposition'):p.get_payload(decode=True) for p in message.iter_parts()}
        self.assertEqual(parts['width'],b'1024');self.assertEqual(parts['seed'],b'42')
        self.assertEqual(parts['prompt'],b'Preserve image 0 style')
        with Image.open(io.BytesIO(parts['input_image_0'])) as image:
            self.assertLess(max(image.size),512);self.assertAlmostEqual(image.width/image.height,1600/900,places=2)

if __name__=='__main__': unittest.main()
