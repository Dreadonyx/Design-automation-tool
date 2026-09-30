"""Explicit provider adapters. No paid provider is enabled automatically."""
import base64
import importlib.util
import io
import json
import os
from pathlib import Path
import random
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
import uuid
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
CATALOG = [
    dict(id='cf-klein', name='FLUX.2 Klein 4B · Cloudflare', model='@cf/black-forest-labs/flux-2-klein-4b', kind='cloudflare', license='Apache-2.0', cost='Free Workers quota; up to four reference images', reference=True, max_references=4, url='https://developers.cloudflare.com/workers-ai/models/flux-2-klein-4b/'),
    dict(id='cf-flux', name='FLUX.1 Schnell · Cloudflare', model='@cf/black-forest-labs/flux-1-schnell', kind='cloudflare', license='Apache-2.0', cost='Free Workers quota; provider sets output size', reference=False, url='https://developers.cloudflare.com/workers-ai/models/flux-1-schnell/'),
    dict(id='cf-lightning', name='SDXL Lightning · Cloudflare', model='@cf/bytedance/stable-diffusion-xl-lightning', kind='cloudflare', license='CreativeML Open RAIL++-M', cost='Free Workers quota; provider sets output size', reference=False, url='https://developers.cloudflare.com/workers-ai/models/stable-diffusion-xl-lightning/'),
    dict(id='cf-sdxl', name='SDXL · Cloudflare', model='@cf/stabilityai/stable-diffusion-xl-base-1.0', kind='cloudflare', license='CreativeML Open RAIL++-M', cost='Free daily quota on Workers Free only', reference=False, url='https://developers.cloudflare.com/workers-ai/models/stable-diffusion-xl-base-1.0/'),
    dict(id='hf-flux', name='FLUX.1 Schnell · Hugging Face', model='black-forest-labs/FLUX.1-schnell', kind='hf', license='Apache-2.0', cost='Limited HF credits; not unlimited free inference', reference=False, url='https://huggingface.co/black-forest-labs/FLUX.1-schnell'),
    dict(id='hf-sdxl', name='SDXL · Hugging Face', model='stabilityai/stable-diffusion-xl-base-1.0', kind='hf', license='CreativeML Open RAIL++-M', cost='Limited HF credits; provider availability varies', reference=False, url='https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0'),
    dict(id='hf-qwen', name='Qwen Image · Hugging Face', model='Qwen/Qwen-Image', kind='hf', license='Apache-2.0', cost='Limited HF credits; hosted only on this RAM profile', reference=False, url='https://huggingface.co/Qwen/Qwen-Image'),
    dict(id='hf-zimage', name='Z-Image Turbo · Hugging Face', model='Tongyi-MAI/Z-Image-Turbo', kind='hf', license='Apache-2.0', cost='Limited HF credits; hosted only on this RAM profile', reference=False, url='https://huggingface.co/Tongyi-MAI/Z-Image-Turbo'),
    dict(id='local-tiny', name='Tiny SD · local CPU', model='segmind/tiny-sd', kind='local', license='CreativeML OpenRAIL-M', cost='No API fees; compact draft model, CPU can be slow', reference=True, url='https://huggingface.co/segmind/tiny-sd'),
    dict(id='local-sd15', name='Stable Diffusion 1.5 · local CPU', model='stable-diffusion-v1-5/stable-diffusion-v1-5', kind='local', license='CreativeML OpenRAIL-M', cost='No API fees; slower, larger than Tiny SD', reference=True, url='https://huggingface.co/stable-diffusion-v1-5/stable-diffusion-v1-5'),
    dict(id='procedural', name='Procedural graphic studio', model='geometry-v1', kind='procedural', license='Project-generated artwork', cost='Always available offline; abstract graphics, not semantic AI imagery', reference=False, url=''),
]


def availability(p):
    k=p['kind']
    if k=='cloudflare':
        return bool(os.getenv('CF_ACCOUNT_ID') and os.getenv('CF_API_TOKEN') and os.getenv('CF_FREE_ACCOUNT_ONLY')=='1'), 'Set CF_ACCOUNT_ID, CF_API_TOKEN and CF_FREE_ACCOUNT_ONLY=1 for a Workers Free account.'
    if k=='hf':
        return bool(os.getenv('HF_TOKEN') and os.getenv('HF_FREE_ACCOUNT_ONLY')=='1' and importlib.util.find_spec('huggingface_hub')), 'Requires HF_TOKEN, optional HF client, and HF_FREE_ACCOUNT_ONLY=1. Use an account without purchased credits or custom provider keys.'
    if k=='local':
        ready = (ROOT / '.studio' / 'models' / p['id'] / 'studio-ready.json').is_file() and bool(importlib.util.find_spec('diffusers')) and bool(importlib.util.find_spec('torch'))
        return ready, f"Install local dependencies, then run python scripts/download_model.py {p['id']}."
    return True, 'Ready offline'


def catalog():
    return [dict(p, quality='draft' if p['kind'] in ['local','procedural'] else 'final', ready=availability(p)[0], setup=availability(p)[1]) for p in CATALOG]


class ProviderError(Exception):
    pass


class ContentRejected(ProviderError):
    pass


def validate_image(raw):
    if len(raw)>25*1024*1024:
        raise ProviderError('Image exceeded the response size limit')
    with Image.open(io.BytesIO(raw)) as im:
        if im.width*im.height>16_000_000 or im.format not in ['PNG','JPEG','WEBP']:
            raise ProviderError('Unsupported image response')
        im.verify()
    return raw


def generate(p,prompt,seed,width,height,theme,reference=None):
    kind=p['kind']
    if kind=='procedural':
        return procedural(theme,seed,width,height)
    if kind=='cloudflare':
        account=os.environ['CF_ACCOUNT_ID']
        if not account.isalnum():
            raise ProviderError('Invalid Cloudflare account ID')
        options=dict(prompt=prompt[:2048])
        if p['id']=='cf-sdxl': options.update(seed=seed,width=width,height=height,num_steps=20)
        elif p['id']=='cf-flux': options.update(seed=seed,steps=4)
        body=json.dumps(options).encode(); content_type='application/json'
        if p['id']=='cf-klein':
            if not (256<=width<=1920 and 256<=height<=1920):
                raise ProviderError('FLUX.2 Klein supports canvas sides between 256 and 1920 pixels')
            references=reference if isinstance(reference,list) else ([reference] if reference else [])
            if len(references)>4: raise ProviderError('FLUX.2 Klein accepts at most four reference images')
            boundary='studio-'+uuid.uuid4().hex; chunks=[]
            for key,value in dict(prompt=prompt,width=width,height=height,seed=seed).items():
                chunks.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n{value}\r\n'.encode())
            for index,path in enumerate(references):
                with Image.open(path) as source:
                    im=source.convert('RGB'); im.thumbnail((480,480),Image.Resampling.LANCZOS)
                    buffer=io.BytesIO(); im.save(buffer,format='PNG')
                chunks.append(f'--{boundary}\r\nContent-Disposition: form-data; name="input_image_{index}"; filename="reference-{index}.png"\r\nContent-Type: image/png\r\n\r\n'.encode()+buffer.getvalue()+b'\r\n')
            chunks.append(f'--{boundary}--\r\n'.encode())
            body=b''.join(chunks); content_type='multipart/form-data; boundary='+boundary
        req=urllib.request.Request(f'https://api.cloudflare.com/client/v4/accounts/{account}/ai/run/{p["model"]}',data=body,headers={'Authorization':'Bearer '+os.environ['CF_API_TOKEN'],'Content-Type':content_type})
        try:
            with urllib.request.urlopen(req,timeout=90) as response:
                raw=response.read(25*1024*1024+1)
                if 'json' in response.headers.get('Content-Type',''):
                    result=json.loads(raw).get('result',{})
                    if not result.get('image'):
                        raise ProviderError('Cloudflare returned no image')
                    raw=base64.b64decode(result['image'],validate=True)
        except urllib.error.HTTPError as e:
            raise ProviderError(f'Cloudflare HTTP {e.code}: quota, authentication or model availability issue') from None
        return validate_image(raw), None
    if kind=='hf':
        # Provider routing is limited to this reviewed model catalog. Availability is not guaranteed.
        from huggingface_hub import InferenceClient
        client=InferenceClient(provider='auto',api_key=os.environ['HF_TOKEN'],timeout=90)
        image=client.text_to_image(prompt,model=p['model'],seed=seed,width=width,height=height)
        stream=io.BytesIO(); image.save(stream,format='PNG')
        return validate_image(stream.getvalue()), None
    if kind=='local':
        if isinstance(reference,list):
            if len(reference)>1: raise ProviderError('Local image guidance accepts one reference image')
            reference=reference[0] if reference else None
        with tempfile.TemporaryDirectory(prefix='design-local-') as tmp:
            request=dict(model=str(ROOT/'.studio'/'models'/p['id']),prompt=prompt,seed=seed,width=width,height=height,reference=reference,output=str(Path(tmp)/'result.png'))
            request_path=Path(tmp)/'request.json'; request_path.write_text(json.dumps(request))
            try:
                result=subprocess.run([sys.executable,str(ROOT/'scripts'/'local_generate.py'),str(request_path)],capture_output=True,timeout=1200,env={**os.environ,'HF_HUB_OFFLINE':'1','OMP_NUM_THREADS':'4'})
            except subprocess.TimeoutExpired:
                raise ProviderError('Local model exceeded the 20-minute image limit') from None
            if result.returncode==3:
                raise ContentRejected('Local model declined this image')
            if result.returncode:
                raise ProviderError('Local inference failed; check dependencies and available RAM')
            return validate_image(Path(request['output']).read_bytes()), None
    raise ProviderError('Unknown provider')


def procedural(theme,seed,w,h):
    rng=random.Random(seed)
    colors=theme['palette']; im=Image.new('RGB',(w,h),colors['bg']); draw=ImageDraw.Draw(im)
    svg=[f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}"><rect width="{w}" height="{h}" fill="{colors["bg"]}"/>']
    mode=seed%3
    for i in range(14):
        color=colors[['primary','secondary','accent'][i%3]]
        x=int(rng.uniform(.35,1.1)*w); y=int(rng.uniform(-.1,1.1)*h); r=int(rng.uniform(.035,.24)*min(w,h))
        if mode==0:
            stroke=max(2,r//6); draw.ellipse((x-r,y-r,x+r,y+r),outline=color,width=stroke)
            svg.append(f'<circle cx="{x}" cy="{y}" r="{r}" fill="none" stroke="{color}" stroke-width="{stroke}"/>')
        elif mode==1:
            points=[(x-r,y+r),(x,y-r),(x+r,y+r)]
            draw.polygon(points,fill=color); svg.append(f'<polygon points="{x-r},{y+r} {x},{y-r} {x+r},{y+r}" fill="{color}"/>')
        else:
            draw.ellipse((x-r,y-r,x+r,y+r),fill=color)
            svg.append(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{color}"/>')
    svg.append('</svg>'); out=io.BytesIO(); im.save(out,format='PNG')
    return out.getvalue(), ''.join(svg)
