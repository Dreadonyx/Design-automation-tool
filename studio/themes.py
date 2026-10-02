import colorsys
import hashlib
import re

FONTS = ['Space Grotesk', 'DM Sans', 'Manrope', 'Playfair Display', 'Cormorant Garamond', 'Archivo Black', 'IBM Plex Sans', 'IBM Plex Mono', 'Nunito', 'Inter']
ROLES = ['bg', 'surface', 'primary', 'secondary', 'accent', 'text', 'muted']
PRESETS = [
    (r'diwali|festival|holi', ['#211038','#362049','#FF8A35','#F2C75C','#E85183','#FFF8ED','#C5B5D2'], 'Space Grotesk', 'DM Sans', 'radiant festive geometry, delicate light trails, ornamental rhythm'),
    (r'nature|yoga|eco|wellness', ['#F0F3EA','#FFFFFF','#38634C','#A6B888','#CA8C5D','#20382A','#596C5C'], 'Cormorant Garamond', 'Manrope', 'organic contours, botanical rhythm, tactile paper, generous breathing room'),
    (r'corporate|finance|business', ['#F1F4F8','#FFFFFF','#254B7A','#69869C','#C88248','#172E43','#546A7B'], 'IBM Plex Sans', 'DM Sans', 'precise geometry, restrained contrast, spacious editorial structure'),
    (r'music|rave|night|tech', ['#171F39','#263152','#82A6FF','#D29BEF','#F6A35D','#F2F5FF','#A6B2CE'], 'Space Grotesk', 'IBM Plex Sans', 'rhythmic geometry, electric edges, dimensional light, deliberate focal points'),
]


def text(value, limit=1200):
    if not isinstance(value, str):
        raise ValueError('Expected text')
    return value.strip()[:limit]


def luminance(color):
    rgb = [int(color[i:i+2], 16) / 255 for i in (1, 3, 5)]
    rgb = [v / 12.92 if v <= .04045 else ((v + .055) / 1.055)**2.4 for v in rgb]
    return sum(a*b for a,b in zip(rgb, [.2126, .7152, .0722]))


def contrast(a,b):
    x,y = sorted([luminance(a), luminance(b)])
    return round((y+.05)/(x+.05), 2)


def make_theme(data, previous=None):
    refs = data.get('references', [])
    if not isinstance(refs,list) or len(refs)>8 or any(not isinstance(r,str) or not re.fullmatch(r'[a-f0-9]{32}',r) for r in refs):
        raise ValueError('Use up to eight uploaded references')
    brief = text(data.get('brief', ''), 2000)
    if not brief and refs:
        brief='Create a coherent design collection inspired by the uploaded references and their assigned roles.'
    if not brief:
        raise ValueError('Describe your theme first')
    base = PRESETS[-1]
    for p in PRESETS:
        if re.search(p[0], brief, re.I):
            base = p
            break
    palette = dict(zip(ROLES, base[1]))
    supplied = data.get('palette', {})
    if not isinstance(supplied, dict):
        raise ValueError('Palette must contain named hex colors')
    for k in ROLES:
        if k in supplied:
            if not isinstance(supplied[k],str) or not re.fullmatch(r'#[0-9a-fA-F]{6}', supplied[k]):
                raise ValueError('Palette colors must use six-digit hex codes')
            palette[k] = supplied[k].upper()
    fonts = data.get('fonts', {'heading':base[2], 'body':base[3]})
    if not isinstance(fonts,dict) or any(fonts.get(k) not in FONTS for k in ['heading','body']):
        raise ValueError('Choose fonts from the supported list')
    return dict(name=text(data.get('name',brief[:50]),80) or 'Untitled theme', brief=brief,
                palette=palette, fonts=fonts, direction=text(data.get('direction',base[4])),
                avoid=text(data.get('avoid','unrequested text, logos, visual clutter, inconsistent style')),
                references=refs, website=text(data.get('website','A landing page introducing this event or brand.'),1500),
                version=(previous or {}).get('version',0)+1,
                analysis=text(data.get('analysis','Editable rules-based draft; reference pixels supply palette suggestions. No automatic semantic vision analysis.'),300),
                contrast={'textOnBackground':contrast(palette['text'],palette['bg']), 'mutedOnBackground':contrast(palette['muted'],palette['bg'])})


COMPOSITIONS = ['focal motif on the right, quiet left third', 'central focal motif with generous outer margins', 'diagonal movement from lower left to upper right', 'framing motifs along the edges, quiet center', 'large cropped motif in the lower third', 'asymmetric small motifs with generous negative space']

SCENE_VARIANTS = ['a street-level thoroughfare view, the primary environment described in the brief',
    'the exterior facade and architecture of a tall structure or building typical of this world, seen from a distance',
    'a close-up view of a single storefront, entrance or stall front with signage and detail typical of this world',
    'a high aerial or rooftop vantage point looking down from well above street level across rooftops and the skyline; the ground-level street should NOT fill the frame',
    'an interior or enclosed space typical of this world, such as a shop, station, hall or gathering space',
    'a transportation, infrastructure or transitional space typical of this world, such as a crossing, passage, vehicle or transit area']

PALETTE_FAMILIES = [('pink and violet',320,278), ('blue and light blue',215,196), ('green and light green',132,96),
    ('amber and gold',36,49), ('red and rose',356,14), ('purple and lavender',270,290),
    ('teal and cyan',174,191), ('orange and peach',24,36)]

NAMED_HUES = [(0,'red'), (20,'red-orange'), (35,'orange'), (50,'amber'), (60,'yellow'), (80,'yellow-green'),
    (100,'lime-green'), (140,'green'), (160,'teal-green'), (180,'teal'), (195,'cyan'), (210,'sky-blue'),
    (225,'azure-blue'), (240,'blue'), (260,'indigo'), (275,'violet'), (290,'purple'), (310,'magenta'),
    (325,'pink-magenta'), (340,'pink'), (355,'rose'), (360,'red')]


def hex_to_hls(hexcolor):
    r,g,b = (int(hexcolor[i:i+2],16)/255 for i in (1,3,5))
    return colorsys.rgb_to_hls(r,g,b)


def hls_to_hex(h,l,s):
    r,g,b = colorsys.hls_to_rgb(h%1.0, min(max(l,0.0),1.0), min(max(s,0.0),1.0))
    return '#%02X%02X%02X' % (round(r*255), round(g*255), round(b*255))


def color_name(hexcolor):
    h,l,s = hex_to_hls(hexcolor)
    if s<0.12:
        if l<0.18: return 'near-black'
        if l>0.85: return 'near-white'
        return 'neutral gray'
    degrees = h*360
    name = min(NAMED_HUES, key=lambda p: min(abs(p[0]-degrees), 360-abs(p[0]-degrees)))[1]
    shade = 'deep ' if l<0.35 else ('pale ' if l>0.72 else '')
    return shade+name


def family_palette(index):
    name, dark_hue, light_hue = PALETTE_FAMILIES[index % len(PALETTE_FAMILIES)]
    return name, dict(bg='#0A0A0C', surface='#17171A', text='#F5F5F6', muted='#8A8A90',
        primary=hls_to_hex(dark_hue/360, 0.46, 0.85), secondary=hls_to_hex(light_hue/360, 0.70, 0.75),
        accent=hls_to_hex(dark_hue/360, 0.88, 0.35))


def family_avoid_words(index):
    others = [w.strip() for i,(name,_,_) in enumerate(PALETTE_FAMILIES) if i!=index%len(PALETTE_FAMILIES) for w in name.split(' and ')]
    return ', '.join(dict.fromkeys(others))


def image_prompt(theme, index, width, height, variation='standard'):
    palette, composition, series_note, override = theme['palette'], COMPOSITIONS[index%len(COMPOSITIONS)], '', ''
    if variation=='palette':
        family, palette = family_palette(index)
        composition = COMPOSITIONS[0]
        avoid_words = family_avoid_words(index)
        override = (" Color override: disregard any specific colors named in the brief or art direction above; "
            f"they do not apply to this image. Use ONLY black-and-white / neutral grayscale plus {family} tones. "
            f"Do not render {avoid_words}, or any other saturated hue, anywhere in this image. ")
        series_note = (" This is one of a series sharing the exact same subject, framing and composition; "
            "only the accent color family should change between images.")
    elif variation=='design':
        composition = SCENE_VARIANTS[index%len(SCENE_VARIANTS)]
        series_note = (' This is one of a series exploring different locations within the same visual world described above: '
            'choose a genuinely different subject or location each time, not just a different camera angle on the same spot. '
            'Keep the exact same color palette and lighting treatment identical across the series.')
    colors = ', '.join(f"{k} is {color_name(v)} ({v})" for k,v in palette.items() if k in ['primary','secondary','accent'])
    return (f"Create a finished text-free design background. Brief: {theme['brief']}. "
            f"Art direction: {theme['direction']}.{override} Dominant colors: {colors}. Render signage, lighting and accent elements "
            "predominantly in these color families; avoid introducing other strongly saturated hues not listed here. "
            f"Composition and subject: {composition}.{series_note} Canvas {width} by {height}. "
            'Maintain the same motif language and texture across this collection unless instructed otherwise above. '
            f"Avoid: {theme['avoid']}. No lettering or typography in the artwork.")


def website_prompt(t):
    return f"""Build a complete, responsive website using this approved visual system.

Purpose and audience
{t['website']}
Brand context: {t['brief']}

Art direction
{t['direction']}
Translate the reference artwork into a coherent interface rather than placing an image behind every section. Use matching shapes, edge treatments and textures sparingly. Preserve the theme's personality and a clear reading hierarchy.

Exact color tokens
""" + '\n'.join(f"{k}: {v}" for k,v in t['palette'].items()) + f"""
Use background and surface for large areas, primary for key actions, secondary for supporting elements, accent sparingly, text for body copy and muted for secondary content. Check each actual text/background pair; adjust shades only when necessary for readable contrast.

Typography
Headings: {t['fonts']['heading']}, weight 700. Body/UI: {t['fonts']['body']}, weights 400/600.
Suggested scale: body 16–18px with 1.6 line height; labels 14px; section titles 28–40px; hero 40–72px fluid, line height 1.08. Include appropriate fallbacks and load only used font weights.

Page structure
Derive sections and their order from the purpose above: a concise navigation, a distinctive hero with a single primary action, useful supporting information, relevant evidence or examples, a final action and footer. Use real supplied facts; mark missing content clearly. Do not invent testimonials, client logos, statistics, dates or business claims.

Layout and components
Use a 1200px maximum content width, an 8px spacing rhythm, 24–32px desktop gutters and 16px mobile gutters. Mix spacious editorial sections with purposeful grids. Give buttons, cards, forms and navigation consistent geometry based on the art direction. Specify hover, focus, disabled, loading, empty and error states. Reserve imagery for meaningful focal points. Reuse supplied assets when available; do not pretend an absent asset exists.

Responsive and accessible behavior
Support 360px mobile through wide desktop without horizontal scrolling. Collapse navigation into an accessible menu, stack grids naturally, keep touch targets at least 44px, provide semantic structure, labels, keyboard navigation, visible focus, alt text and reduced-motion support. Aim for WCAG AA contrast: 4.5:1 body text and 3:1 large text. Never rely on color alone.

Quality constraints
Avoid {t['avoid']}. Avoid unrelated stock styling, decorative dashboard widgets, arbitrary gradients, repeated generic cards and unnecessary animation. Use restrained motion only to explain interaction. Finish with a consistency pass covering spacing, color roles, typography and all viewport sizes.

Deliver the complete implementation in the target tool's native format, with working interactions and clearly marked content placeholders. Preserve this theme throughout; do not substitute a generic visual style.
"""
