"""Run against a disposable studio: STUDIO_DATA=/tmp/... python app.py."""
import io
import json
import zipfile
from playwright.sync_api import sync_playwright, expect
from PIL import Image

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    page=browser.new_page(viewport={'width':1440,'height':1100})
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto('http://127.0.0.1:7860')
    expect(page.locator('#engine option')).to_have_count(12)
    page.click('#new-theme')
    page.fill('#name','Night Garden')
    page.fill('#brief','A botanical music festival with violet flowers and blue twilight. Atmospheric, organic and spacious.')
    page.click('#draft')
    expect(page.locator('#direction')).not_to_have_value('')
    img=io.BytesIO();Image.new('RGB',(100,100),'#845CD0').save(img,format='PNG')
    page.set_input_files('#reference-file',{'name':'violet-reference.png','mimeType':'image/png','buffer':img.getvalue()})
    expect(page.locator('.ref')).to_have_count(1)
    page.get_by_role('button',name='Use these colors').click()
    page.fill('#website','A music festival landing page with lineup, location and registration. Audience: students.')
    page.click('#save')
    expect(page.locator('#version')).to_have_text('Version 1')
    page.click('#generate')
    expect(page.locator('#toast')).to_contain_text('No final-quality provider')
    page.select_option('#quality','draft')
    page.select_option('#size','512x512')
    page.select_option('#engine','procedural')
    page.fill('#count','3')
    page.click('#generate')
    expect(page.locator('.asset')).to_have_count(3,timeout=15000)
    assert page.locator('.asset img').evaluate_all('(images)=>images.every(i=>i.complete && i.naturalWidth>0)')
    page.click('#web-prompt')
    expect(page.locator('#modal')).to_be_visible()
    expect(page.locator('#modal-body pre')).to_contain_text('#845CD0')
    page.click('#modal-close')
    with page.expect_download() as download:
        page.click('#export')
    with zipfile.ZipFile(download.value.path()) as z:
        assert 'website-prompt.txt' in z.namelist()
        assert len([n for n in z.namelist() if n.endswith('.png')])==3
        assert len(json.loads(z.read('manifest.json')))==3
    page.set_input_files('#art-file',{'name':'external.png','mimeType':'image/png','buffer':img.getvalue()})
    expect(page.locator('.asset')).to_have_count(4)
    with page.expect_download() as web_download:
        page.locator('.asset').first.get_by_role('link',name='WebP',exact=True).click()
    with Image.open(web_download.value.path()) as web_image: assert max(web_image.size)<=1600
    page.screenshot(path='/tmp/design-studio-desktop.png',full_page=True)
    page.reload();expect(page.locator('.asset')).to_have_count(4)
    page.set_viewport_size({'width':390,'height':844})
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), 'Mobile overflow'
    page.screenshot(path='/tmp/design-studio-mobile.png',full_page=True)
    assert not errors,errors
    browser.close()
    print('Browser passed: reference upload, palette, save, batch, prompt, ZIP, reload, mobile layout; no JS errors.')
