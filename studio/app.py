import io
import json
import os
from pathlib import Path
import secrets
import sqlite3
import threading
import time
import uuid
import zipfile
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from urllib.parse import urlparse
from flask import Flask, jsonify, request, send_file, abort
from PIL import Image, ImageOps, UnidentifiedImageError
from werkzeug.exceptions import HTTPException
from .themes import make_theme, image_prompt, website_prompt, FONTS
from .components import component_css, component_snippets, component_preview_html
from . import providers, intelligence

ROOT=Path(__file__).resolve().parent.parent
Image.MAX_IMAGE_PIXELS=16_000_000


def create_app(data_dir=None):
    app=Flask(__name__,static_folder=str(ROOT/'web'),static_url_path='/static')
    app.config.update(MAX_CONTENT_LENGTH=16*1024*1024,TRUSTED_HOSTS=['localhost','127.0.0.1','[::1]'])
    root=Path(data_dir or os.getenv('STUDIO_DATA',ROOT/'.studio'))
    root.mkdir(parents=True,exist_ok=True); (root/'files').mkdir(exist_ok=True)
    database=root/'studio.db'; token=secrets.token_urlsafe(32)
    mutex=threading.RLock(); executor=ThreadPoolExecutor(max_workers=1)
    app.extensions['studio_executor']=executor

    @contextmanager
    def connection():
        db=sqlite3.connect(database,timeout=15)
        try:
            db.execute('PRAGMA journal_mode=WAL')
            with db:
                yield db
        finally:
            db.close()
    with connection() as db:
        db.execute('CREATE TABLE IF NOT EXISTS records (kind TEXT, id TEXT, data TEXT, PRIMARY KEY(kind,id))')
        for ident,raw in db.execute("SELECT id,data FROM records WHERE kind='job'").fetchall():
            item=json.loads(raw)
            if item['status'] in ['queued','running']:
                item['status']='interrupted'; item['message']='Server stopped. Start a new batch; completed images are saved.'
                db.execute("UPDATE records SET data=? WHERE kind='job' AND id=?",(json.dumps(item),ident))

    def save(kind,item):
        with connection() as db:
            db.execute('INSERT OR REPLACE INTO records VALUES(?,?,?)',(kind,item['id'],json.dumps(item)))
        return item
    def get(kind,ident):
        with connection() as db:
            row=db.execute('SELECT data FROM records WHERE kind=? AND id=?',(kind,ident)).fetchone()
        if not row: abort(404)
        return json.loads(row[0])
    def all_items(kind):
        with connection() as db:
            return [json.loads(r[0]) for r in db.execute('SELECT data FROM records WHERE kind=? ORDER BY rowid DESC',(kind,))]
    def ident(): return uuid.uuid4().hex
    def payload():
        d=request.get_json()
        if not isinstance(d,dict): raise ValueError('Expected a JSON object')
        return d
    def integer(value,low,high,label):
        if isinstance(value,bool) or not isinstance(value,int) or not low<=value<=high:
            raise ValueError(f'{label} must be an integer from {low} to {high}')
        return value

    @app.before_request
    def protect():
        if request.method not in ['GET','HEAD','OPTIONS']:
            if not secrets.compare_digest(request.headers.get('X-Studio-Token',''),token):
                abort(403,description='Reload the studio before making changes')
            origin=request.headers.get('Origin')
            if origin and urlparse(origin).netloc!=request.host: abort(403)

    @app.after_request
    def headers(response):
        response.headers['X-Content-Type-Options']='nosniff'
        response.headers['Referrer-Policy']='no-referrer'
        response.headers['Cache-Control']='no-store'
        response.headers['Content-Security-Policy']="default-src 'self'; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
        return response

    @app.errorhandler(Exception)
    def error(e):
        if isinstance(e,HTTPException): return jsonify(error=e.description),e.code
        if isinstance(e,(ValueError,UnidentifiedImageError,Image.DecompressionBombError,Image.DecompressionBombWarning)):
            return jsonify(error=str(e)),400
        app.logger.exception('Request failed')
        return jsonify(error='Unexpected server error; see terminal logs'),500

    @app.get('/')
    def index(): return send_file(ROOT/'web'/'index.html')

    @app.get('/api/bootstrap')
    def bootstrap():
        return jsonify(token=token,themes=all_items('theme'),providers=providers.catalog(),intelligence=intelligence.status(),fonts=FONTS,profile='20 GB RAM · CPU · one image at a time · local max 512 px')

    @app.post('/api/draft')
    def draft():
        d=payload(); validated=make_theme(d)
        # Avoid overlapping CPU analysis and image inference on a 20 GB machine.
        if intelligence.status()['ollama'] and any(j['status'] in ['queued','running'] for j in all_items('job')):
            abort(409,description='Wait for image generation to finish before running local theme analysis')
        return jsonify(intelligence.draft(validated,[get('reference',r) for r in validated['references']],root/'files'))

    @app.get('/api/themes/<tid>')
    def theme_get(tid):
        t=get('theme',tid)
        return jsonify(theme=t,references=[get('reference',r) for r in t['references']],assets=[a for a in all_items('asset') if a['theme_id']==tid],versions=[v for v in all_items('version') if v['theme_id']==tid],jobs=[j for j in all_items('job') if j['theme_id']==tid])

    def persist_theme(d,previous=None):
        t=make_theme(d,previous)
        for r in t['references']: get('reference',r)
        t.update(id=previous['id'] if previous else ident(),updated=time.time())
        with mutex:
            save('version',dict(t,id=ident(),theme_id=t['id']))
            save('theme',t)
        return t

    @app.post('/api/themes')
    def theme_create(): return jsonify(persist_theme(payload())),201

    @app.put('/api/themes/<tid>')
    def theme_update(tid):
        with mutex:
            old=get('theme',tid); d=payload()
            if d.get('version')!=old['version']: abort(409,description='Theme changed. Reload before saving.')
            return jsonify(persist_theme(d,old))

    @app.post('/api/themes/<tid>/restore/<vid>')
    def restore(tid,vid):
        with mutex:
            old=get('theme',tid); version=get('version',vid)
            if version['theme_id']!=tid: abort(404)
            return jsonify(persist_theme(version,old))

    @app.post('/api/references')
    def upload():
        f=request.files.get('file')
        if not f: raise ValueError('Choose a reference file')
        name=Path(f.filename or 'reference').name[:120]; ext=Path(name).suffix.lower(); rid=ident()
        raw=f.read(12*1024*1024+1)
        if len(raw)>12*1024*1024: raise ValueError('Reference files must be under 12 MB')
        role=request.form.get('role','style')
        if role not in ['style','palette','layout','guidelines']: raise ValueError('Unknown reference role')
        r=dict(id=rid,name=name,role=role,notes=request.form.get('notes','')[:2000],palette=[],text='')
        if ext in ['.png','.jpg','.jpeg','.webp']:
            with Image.open(io.BytesIO(raw)) as im:
                if im.width*im.height>16_000_000: raise ValueError('Reference image is too large')
                im=ImageOps.exif_transpose(im).convert('RGB'); im.thumbnail((1600,1600))
                im.save(root/'files'/f'{rid}.png')
                small=im.resize((96,96)).quantize(colors=6); pal=small.getpalette()
                r['palette']=['#%02X%02X%02X'%tuple(pal[i*3:i*3+3]) for _,i in sorted(small.getcolors(),reverse=True)]
            r.update(kind='image',path=f'{rid}.png',url=f'/api/files/{rid}.png')
        elif ext in ['.txt','.md','.json']:
            r.update(kind='document',text=raw.decode('utf-8')[:16000])
        elif ext=='.pdf':
            try: from pypdf import PdfReader
            except ImportError: raise ValueError('Install pypdf to read PDF guidelines') from None
            try: pdf=PdfReader(io.BytesIO(raw))
            except Exception: raise ValueError('This PDF could not be read') from None
            if pdf.is_encrypted: raise ValueError('Upload an unencrypted PDF')
            r.update(kind='document',text='\n'.join((p.extract_text() or '')[:3000] for p in __import__('itertools').islice(pdf.pages,12))[:16000])
            if not r['text'].strip(): raise ValueError('This PDF has no readable text. Upload its pages as images.')
        else: raise ValueError('Use PNG, JPEG, WebP, TXT, Markdown, JSON or a text PDF')
        return jsonify(save('reference',r)),201

    @app.post('/api/themes/<tid>/import')
    def import_art(tid):
        t=get('theme',tid); f=request.files.get('file')
        if not f: raise ValueError('Choose an image')
        raw=providers.validate_image(f.read(12*1024*1024+1))
        aid=ident()
        with Image.open(io.BytesIO(raw)) as im:
            w,h=im.size; extension={'PNG':'png','JPEG':'jpg','WEBP':'webp'}[im.format]
        (root/'files'/f'{aid}.{extension}').write_bytes(raw)
        a=dict(id=aid,theme_id=tid,theme_version=t['version'],job_id=None,seed=0,
               prompt=request.form.get('prompt','Imported image; original generation prompt not supplied')[:5000],
               provider='imported',model=request.form.get('source','External / unspecified')[:150],kind='imported',
               quality='imported',width=w,height=h,requested_width=max(64,min(2048,w//8*8)),requested_height=max(64,min(2048,h//8*8)),
               path=f'{aid}.{extension}',url=f'/api/files/{aid}.{extension}',svg=None,attempts=[],reference_mode='palette',snapshot=t)
        return jsonify(save('asset',a)),201

    def clean_png(path):
        with Image.open(path) as image:
            image=ImageOps.exif_transpose(image)
            # A fresh pixel image omits EXIF, comments and embedded generation text.
            pixels=Image.new('RGBA' if 'A' in image.getbands() else 'RGB',image.size)
            pixels.paste(image.convert(pixels.mode)); stream=io.BytesIO(); pixels.save(stream,format='PNG')
            return stream.getvalue()

    @app.get('/api/files/<name>')
    def file_get(name):
        import re
        if not re.fullmatch(r'[a-f0-9]{32}\.(png|jpg|webp|svg)',name): abort(404)
        path=root/'files'/name
        if not path.is_file(): abort(404)
        if request.args.get('web')=='1' and path.suffix!='.svg':
            with Image.open(path) as image:
                image=ImageOps.exif_transpose(image).convert('RGBA' if 'A' in image.getbands() else 'RGB')
                image.thumbnail((1600,1600),Image.Resampling.LANCZOS)
                stream=io.BytesIO();image.save(stream,format='WEBP',quality=92,method=6);stream.seek(0)
            return send_file(stream,mimetype='image/webp',as_attachment=True,download_name=path.stem+'-web.webp')
        if request.args.get('clean')=='1' and path.suffix!='.svg':
            return send_file(io.BytesIO(clean_png(path)),mimetype='image/png',as_attachment=True,download_name=path.stem+'-clean.png')
        return send_file(path,as_attachment=request.args.get('download')=='1')

    @app.get('/api/themes/<tid>/web-prompt')
    def web_prompt(tid): return jsonify(prompt=website_prompt(get('theme',tid)))

    @app.get('/api/themes/<tid>/components')
    def components(tid):
        t=get('theme',tid)
        return jsonify(css=component_css(t),snippets=component_snippets(t),preview=component_preview_html(t))

    def run_job(jid):
        job=get('job',jid); job['status']='running'; save('job',job)
        theme=job['snapshot']; failed=set(); locked_provider=None
        refs=[get('reference',r) for r in theme['references']]
        pixel_refs=[r for r in refs if r['kind']=='image' and r['role']!='palette']
        ref=[str(root/'files'/r['path']) for r in pixel_refs]
        try:
            for i in range(job['count']):
                if get('job',jid).get('cancel'): job['status']='cancelled'; break
                seed=(job['seed']+i)%2147483647
                prompt=image_prompt(theme,i,job['width'],job['height'],job.get('variation','standard'))
                if job['reference_mode']=='image':
                    prompt+=' '+ ' '.join(f"Input image {index}: use for {r['role']}; {r['notes']}." for index,r in enumerate(pixel_refs))
                for r in refs:
                    prompt+=f" Reference {r['role']}: {r['notes']}. "
                    if r['text']: prompt+='Reference guideline text (visual guidance): '+r['text'][:2000]+'. '
                raw=None; attempts=[]; svg=None; selected=None; actual_w=job['width']; actual_h=job['height']
                for pid in job['chain']:
                    p=next(p for p in providers.CATALOG if p['id']==pid)
                    if job['quality']=='final' and locked_provider and pid!=locked_provider:
                        attempts.append(dict(provider=pid,status='skipped',reason='Final batch keeps the first successful model for consistency')); continue
                    if job['quality']=='final' and p['kind'] in ['local','procedural']:
                        attempts.append(dict(provider=pid,status='skipped',reason='Draft engine excluded by final-quality mode')); continue
                    ready,why=providers.availability(p)
                    if pid in failed or not ready:
                        attempts.append(dict(provider=pid,status='skipped',reason='Unavailable earlier in this batch' if pid in failed else why)); continue
                    if job['reference_mode']=='image' and ref and not p['reference']:
                        attempts.append(dict(provider=pid,status='skipped',reason='This provider cannot use reference pixels')); continue
                    if job['reference_mode']=='image' and len(ref)>p.get('max_references',1):
                        attempts.append(dict(provider=pid,status='skipped',reason='Too many reference images for this provider; none silently discarded')); continue
                    w,h=job['width'],job['height']
                    if p['kind']=='local':
                        scale=min(1,512/max(w,h)); w=max(64,int(w*scale)//64*64); h=max(64,int(h*scale)//64*64)
                    with mutex:
                        current=get('job',jid); current['message']=f'Image {i+1}/{job["count"]}: {p["name"]}'; save('job',current)
                    try:
                        raw,svg=providers.generate(p,prompt,seed,w,h,theme,ref if job['reference_mode']=='image' else None)
                        with Image.open(io.BytesIO(raw)) as im: actual_w,actual_h=im.size
                        if job['quality']=='final' and (actual_w<job['width'] or actual_h<job['height'] or abs(actual_w/actual_h-job['width']/job['height'])>.03):
                            raise providers.ProviderError('Native output does not meet the requested final size/aspect ratio; no artificial upscale applied')
                        selected=p; locked_provider=pid; attempts.append(dict(provider=pid,status='success')); break
                    except providers.ContentRejected:
                        raw=None;svg=None
                        attempts.append(dict(provider=pid,status='rejected',reason='Image declined; no fallback attempted')); break
                    except Exception as e:
                        raw=None;svg=None
                        # Do not store exception bodies: remote responses can contain secrets.
                        reason=str(e) if isinstance(e,providers.ProviderError) else f'{type(e).__name__}: provider unavailable; check quota and configuration'
                        attempts.append(dict(provider=pid,status='failed',reason=reason)); failed.add(pid)
                if get('job',jid).get('cancel'): job['status']='cancelled'; break
                if raw is not None:
                    aid=ident()
                    with Image.open(io.BytesIO(raw)) as im: extension={'PNG':'png','JPEG':'jpg','WEBP':'webp'}[im.format]
                    (root/'files'/f'{aid}.{extension}').write_bytes(raw)
                    if svg: (root/'files'/f'{aid}.svg').write_text(svg)
                    asset=dict(id=aid,theme_id=theme['id'],theme_version=theme['version'],job_id=jid,seed=seed,prompt=prompt,provider=selected['id'],model=selected['model'],kind=selected['kind'],quality=job['quality'],width=actual_w,height=actual_h,requested_width=job['width'],requested_height=job['height'],path=f'{aid}.{extension}',url=f'/api/files/{aid}.{extension}',svg=f'/api/files/{aid}.svg' if svg else None,attempts=attempts,reference_mode=job['reference_mode'],variation=job.get('variation','standard'),snapshot=theme)
                    save('asset',asset); job['assets'].append(aid)
                else: job['failures'].append(dict(index=i,attempts=attempts))
                job['completed']=i+1
                with mutex:
                    job['cancel']=get('job',jid).get('cancel',False); save('job',job)
            else: job['status']='completed' if not job['failures'] else ('partial' if job['assets'] else 'failed')
            job['message']=f'{len(job["assets"])} images saved. {len(job["failures"])} failed.'
        except Exception:
            app.logger.exception('Batch failed'); job['status']='failed'; job['message']='Batch interrupted by an internal error. Completed assets are retained.'
        finally: save('job',job)

    def enqueue(d,theme):
        count=integer(d.get('count',4),1,24,'Count'); width=integer(d.get('width',1024),64,2048,'Width'); height=integer(d.get('height',1024),64,2048,'Height')
        if width%8 or height%8: raise ValueError('Canvas dimensions must be multiples of eight')
        seed=integer(d.get('seed',secrets.randbelow(2147483647)),0,2147483646,'Seed')
        chain=d.get('chain',[p['id'] for p in providers.CATALOG])
        if not isinstance(chain,list) or not chain or len(chain)>len(providers.CATALOG) or any(not isinstance(p,str) for p in chain) or len(set(chain))!=len(chain) or any(p not in [p['id'] for p in providers.CATALOG] for p in chain):
            raise ValueError('Choose a valid provider chain')
        quality=d.get('quality','final')
        if quality not in ['final','draft']: raise ValueError('Choose final or draft quality')
        if quality=='final':
            if min(width,height)<768: raise ValueError('Final images need at least 768 pixels on the shorter side')
            eligible=[p for p in providers.CATALOG if p['id'] in chain and p['kind'] not in ['local','procedural'] and providers.availability(p)[0]]
            if not eligible: abort(409,description='No final-quality provider is configured. Connect a free-tier hosted provider, import a finished image, or explicitly choose Draft mode for local previews.')
        mode=d.get('reference_mode','palette')
        if mode not in ['palette','image']: raise ValueError('Invalid reference mode')
        variation=d.get('variation','standard')
        if variation not in ['standard','palette','design']: raise ValueError('Choose a valid collection style')
        if mode=='image' and quality=='final':
            pixel_count=sum(get('reference',r)['kind']=='image' and get('reference',r)['role']!='palette' for r in theme['references'])
            if not any(p['reference'] and pixel_count<=p.get('max_references',1) for p in eligible):
                raise ValueError('Final image guidance needs configured FLUX.2 Klein and at most four non-palette reference images')
        if mode=='image' and not any(get('reference',r)['kind']=='image' and get('reference',r)['role']!='palette' for r in theme['references']):
            raise ValueError('Upload an image with style or layout role for image guidance')
        with mutex:
            if sum(j['status'] in ['queued','running'] for j in all_items('job'))>=3: abort(429,description='Three batches are already queued. Wait for one to finish.')
            job=dict(id=ident(),theme_id=theme['id'],snapshot=theme,count=count,width=width,height=height,seed=seed,chain=chain,reference_mode=mode,variation=variation,quality=quality,status='queued',completed=0,assets=[],failures=[],message='Waiting for the image worker',cancel=False,created=time.time())
            save('job',job); executor.submit(run_job,job['id'])
        return job

    @app.post('/api/themes/<tid>/jobs')
    def start_job(tid): return jsonify(enqueue(payload(),get('theme',tid))),202

    @app.post('/api/assets/<aid>/regenerate')
    def regenerate(aid):
        a=get('asset',aid); d=payload(); d.update(count=1,width=a['requested_width'],height=a['requested_height'],reference_mode=a['reference_mode'],variation=d.get('variation',a.get('variation','standard')),quality=a.get('quality','draft') if a.get('quality') in ['final','draft'] else d.get('quality','final'))
        return jsonify(enqueue(d,a['snapshot'])),202

    @app.get('/api/jobs/<jid>')
    def job_get(jid): return jsonify(get('job',jid))

    @app.post('/api/jobs/<jid>/cancel')
    def job_cancel(jid):
        with mutex:
            j=get('job',jid); j['cancel']=True; save('job',j)
        return jsonify(j)

    @app.get('/api/themes/<tid>/export')
    def export(tid):
        t=get('theme',tid); assets=[a for a in all_items('asset') if a['theme_id']==tid]
        out=io.BytesIO()
        with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
            z.writestr('theme.json',json.dumps(t,indent=2)); z.writestr('website-prompt.txt',website_prompt(t))
            z.writestr('typography.css', ':root {\n'+ '\n'.join(f'  --color-{k}: {v};' for k,v in t['palette'].items())+f'\n  --font-heading: "{t["fonts"]["heading"]}", sans-serif;\n  --font-body: "{t["fonts"]["body"]}", sans-serif;\n}}\nbody {{font: 400 1rem/1.6 var(--font-body); color:var(--color-text); background:var(--color-bg)}}\nh1,h2,h3 {{font-family:var(--font-heading); line-height:1.1}}\n')
            z.writestr('manifest.json',json.dumps(assets,indent=2))
            z.writestr('versions.json',json.dumps([v for v in all_items('version') if v['theme_id']==tid],indent=2))
            z.writestr('README.txt','Each image manifest records its actual provider, theme version, prompt and dimensions. Local output may be smaller than requested. Procedural images are abstract graphic fallbacks. Fonts are recommendations and must be obtained separately. Reference originals are not bundled. Provider provenance is not intentionally removed. Seeds alone do not guarantee cross-provider reproduction.')
            for a in assets:
                z.write(root/'files'/a['path'],'images/'+a['path'])
                svg=root/'files'/f'{a["id"]}.svg'
                if svg.exists(): z.write(svg,'images/'+svg.name)
        out.seek(0); return send_file(out,mimetype='application/zip',as_attachment=True,download_name=f'theme-{tid[:8]}.zip')

    return app
