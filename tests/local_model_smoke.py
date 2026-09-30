"""Real local inference integration check; requires downloaded Tiny SD and optional deps."""
import io
import json
from pathlib import Path
import resource
import tempfile
import time
from PIL import Image
from studio.app import create_app

with tempfile.TemporaryDirectory() as directory:
    app=create_app(directory); client=app.test_client()
    headers={'X-Studio-Token':client.get('/api/bootstrap').json['token']}
    t=client.post('/api/themes',json={'name':'Botanical Midnight','brief':'Violet botanical flowers on a midnight blue background, clean editorial illustration, no text','direction':'Botanical linework, violet flowers, navy paper, quiet left third'},headers=headers).json
    start=time.monotonic()
    job=client.post('/api/themes/'+t['id']+'/jobs',json={'count':1,'width':512,'height':512,'seed':42,'chain':['local-tiny'],'quality':'draft'},headers=headers).json
    while True:
        state=client.get('/api/jobs/'+job['id']).json
        if state['status'] not in ['queued','running']:break
        time.sleep(1)
    try:
        assert state['status']=='completed',state
        asset=client.get('/api/themes/'+t['id']).json['assets'][0]
        assert asset['provider']=='local-tiny'
        response=client.get(asset['url']);raw=response.data;response.close()
        with Image.open(io.BytesIO(raw)) as im: assert im.size==(512,512)
        Path('test_img').mkdir(exist_ok=True)
        Path('test_img/tiny-sd-botanical-512.png').write_bytes(raw)
        elapsed=round(time.monotonic()-start,1)
        peak=round(resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss/1024)
        print(json.dumps({'provider':asset['provider'],'dimensions':[512,512],'seconds':elapsed,'child_peak_rss_mb':peak}))
    finally:app.extensions['studio_executor'].shutdown(wait=True)
