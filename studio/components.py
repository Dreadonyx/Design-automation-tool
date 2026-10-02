"""Deterministic, theme-styled HTML/CSS component snippets. No AI involved."""


def tokens_css(theme):
    p, f = theme['palette'], theme['fonts']
    return (":root{\n"
        f"  --bg:{p['bg']};--surface:{p['surface']};--primary:{p['primary']};--secondary:{p['secondary']};"
        f"--accent:{p['accent']};--text:{p['text']};--muted:{p['muted']};\n"
        f"  --font-heading:'{f['heading']}',sans-serif;--font-body:'{f['body']}',sans-serif;\n"
        "  --radius:12px;\n}\n")


def component_css(theme):
    return tokens_css(theme) + """
body{background:var(--bg);color:var(--text);font-family:var(--font-body);}
h1,h2,h3,.heading{font-family:var(--font-heading);}
.btn{display:inline-flex;align-items:center;gap:8px;padding:12px 24px;border-radius:var(--radius);font-family:var(--font-body);font-weight:600;font-size:15px;border:1px solid transparent;cursor:pointer;transition:transform .15s ease,opacity .15s ease;}
.btn:hover{transform:translateY(-1px);}
.btn:focus-visible{outline:2px solid var(--accent);outline-offset:2px;}
.btn:disabled{opacity:.5;cursor:not-allowed;transform:none;}
.btn-primary{background:var(--primary);color:var(--bg);}
.btn-secondary{background:var(--surface);color:var(--text);border-color:var(--muted);}
.btn-outline{background:transparent;color:var(--primary);border-color:var(--primary);}
.card{background:var(--surface);border-radius:calc(var(--radius) * 1.5);padding:24px;max-width:360px;}
.card h3{margin:0 0 8px;font-size:20px;}
.card p{margin:0 0 16px;color:var(--muted);line-height:1.6;}
.badge{display:inline-block;padding:4px 12px;border-radius:999px;background:var(--accent);color:var(--bg);font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;}
.navbar{display:flex;align-items:center;justify-content:space-between;padding:16px 24px;background:var(--surface);border-radius:var(--radius);}
.navbar .brand{font-family:var(--font-heading);font-weight:700;font-size:18px;color:var(--text);}
.navbar nav{display:flex;gap:24px;}
.navbar a{color:var(--muted);text-decoration:none;font-size:14px;}
.navbar a:hover{color:var(--text);}
.field{display:flex;flex-direction:column;gap:6px;max-width:320px;}
.field label{font-size:13px;color:var(--muted);}
.field input{padding:10px 14px;border-radius:calc(var(--radius) * .6);border:1px solid var(--muted);background:var(--bg);color:var(--text);font-family:var(--font-body);font-size:14px;}
.field input:focus{outline:2px solid var(--accent);border-color:var(--accent);}
"""


def component_snippets(theme):
    return {
        'Buttons': '<button class="btn btn-primary">Primary action</button>\n<button class="btn btn-secondary">Secondary</button>\n<button class="btn btn-outline">Outline</button>',
        'Card': ('<div class="card"><span class="badge">New</span><h3>Card title</h3>'
            '<p>Supporting copy that explains the card\'s purpose in one or two lines.</p>'
            '<button class="btn btn-primary">Learn more</button></div>'),
        'Navbar': ('<header class="navbar"><span class="brand">Brand</span>'
            '<nav><a href="#">Product</a><a href="#">Pricing</a><a href="#">About</a></nav>'
            '<button class="btn btn-primary">Get started</button></header>'),
        'Form field': '<div class="field"><label for="demo-email">Email</label><input id="demo-email" type="email" placeholder="you@example.com"></div>',
        'Badge': '<span class="badge">Live</span>',
    }


def component_preview_html(theme):
    css, snippets = component_css(theme), component_snippets(theme)
    body = '\n'.join(
        '<section style="margin-bottom:32px"><h2 class="heading" '
        'style="font-size:13px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:12px">'
        f'{name}</h2>{html}</section>' for name, html in snippets.items())
    return f"<!doctype html><html><head><meta charset='utf-8'><style>{css}body{{padding:32px;}}</style></head><body>{body}</body></html>"
