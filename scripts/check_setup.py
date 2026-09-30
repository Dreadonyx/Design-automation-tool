"""Configuration check; --live uses the configured free-tier services and saves samples."""
import argparse
import json
from pathlib import Path
import sys
import tempfile
import time

ROOT=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT))
from studio.config import load_env
from studio import providers, intelligence


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--live',action='store_true',help='Use quota for two Cloudflare images and one Gemini analysis; save test_img outputs')
    args=parser.parse_args();load_env()
    for p in providers.catalog():
        print(p['id']+': '+('configured' if p['ready'] else 'not configured'))
    for name,enabled in intelligence.status().items(): print(name+': '+('configured' if enabled else 'not configured'))
    if not args.live:
        print('No network calls made. See docs/SETUP.md. Configuration does not verify credentials or billing.')
        return 0
    klein=next(p for p in providers.CATALOG if p['id']=='cf-klein')
    if not providers.availability(klein)[0]:
        print('Live verification needs Cloudflare credentials and the free-account declaration in .env.');return 1
    from studio.app import create_app
    results={};stamp=time.strftime('%Y%m%d-%H%M%S');output=ROOT/'test_img';output.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='studio-live-') as tmp:
        app=create_app(tmp);client=app.test_client();headers={'X-Studio-Token':client.get('/api/bootstrap').json['token']}
        try:
            theme=client.post('/api/themes',json={'name':'Night Garden live check','brief':'Premium botanical festival artwork: violet flowers, deep midnight blue background, delicate luminous edges, generous negative space, no text.'},headers=headers).get_json()
            for mode in ['palette','image']:
                if mode=='image':
                    path=output/results['palette']['file']
                    with path.open('rb') as source:
                        uploaded=client.post('/api/references',data={'file':(source,'reference.png'),'role':'style','notes':'Preserve the flower forms, midnight background and light quality.'},headers=headers)
                    if uploaded.status_code!=201: raise RuntimeError('Reference upload failed')
                    reference=uploaded.get_json();theme['references']=[reference['id']]
                    updated=client.put('/api/themes/'+theme['id'],json=theme,headers=headers)
                    if updated.status_code!=200: raise RuntimeError('Theme update failed')
                    theme=updated.get_json()
                    if intelligence.status()['gemini']:
                        analysis=client.post('/api/draft',json={'brief':theme['brief'],'references':theme['references']},headers=headers)
                        data=analysis.get_json();results['analysis']={'passed':analysis.status_code==200 and data.get('analysis','').startswith('Gemini'),'engine':data.get('analysis'),'attempts':data.get('analysis_attempts',[])}
                response=client.post('/api/themes/'+theme['id']+'/jobs',json={'count':1,'width':1024,'height':1024,'seed':42,'quality':'final','chain':['cf-klein'],'reference_mode':mode},headers=headers)
                if response.status_code!=202: raise RuntimeError('Live job could not be queued')
                job=response.get_json();deadline=time.monotonic()+210
                while job['status'] in ['queued','running'] and time.monotonic()<deadline:
                    time.sleep(.5);job=client.get('/api/jobs/'+job['id']).get_json()
                if job['status']!='completed':
                    results[mode]={'passed':False,'status':job['status'],'failures':job.get('failures',[])};break
                assets=client.get('/api/themes/'+theme['id']).get_json()['assets']
                asset=next(a for a in assets if a['id']==job['assets'][0]);filename=f'cloudflare-klein-{mode}-{stamp}.png'
                download=client.get(asset['url']+'?clean=1');(output/filename).write_bytes(download.data);download.close()
                results[mode]={'passed':True,'file':filename,'width':asset['width'],'height':asset['height'],'prompt':asset['prompt'],'model':asset['model'],'seed':asset['seed']}
        except Exception as error:
            results['error']={'passed':False,'type':type(error).__name__}
        finally:
            app.extensions['studio_executor'].shutdown(wait=True)
    report=output/f'live-check-{stamp}.json';report.write_text(json.dumps(results,indent=2))
    print('Saved verification report: '+str(report))
    for name,result in results.items(): print(name+': '+('passed' if result.get('passed') else 'failed'))
    print('Inspect the saved images for theme adherence; successful requests do not certify aesthetic quality.')
    return 0 if len(results)>=2 and all(r.get('passed') for r in results.values()) else 1


if __name__=='__main__': raise SystemExit(main())
