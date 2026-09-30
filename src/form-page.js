// n8n Code node: "Form Page"
// Returned when the webhook is opened with no ?brief= param.
// Renders the input form; submitting it GETs the same URL with query params.

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Design Agent</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  :root { --bg:#0b0d14; --card:#141826; --line:#252b3f; --text:#eef0f6; --muted:#98a0b8; --accent:#7c6cff; --accent2:#22d3ee; }
  * { box-sizing:border-box; margin:0; }
  body { background:radial-gradient(1200px 700px at 80% -10%, #1b1f3a 0%, var(--bg) 55%); color:var(--text);
         font:16px/1.6 Inter, system-ui, sans-serif; min-height:100vh; display:flex; align-items:center; justify-content:center; padding:32px 16px; }
  .card { width:100%; max-width:640px; background:var(--card); border:1px solid var(--line); border-radius:20px; padding:40px; box-shadow:0 30px 80px rgba(0,0,0,.45); }
  h1 { font:700 32px/1.15 'Space Grotesk', sans-serif; letter-spacing:-.01em; }
  h1 span { background:linear-gradient(90deg, var(--accent), var(--accent2)); -webkit-background-clip:text; background-clip:text; color:transparent; }
  p.sub { color:var(--muted); margin:10px 0 28px; }
  label { display:block; font:600 13px/1 Inter; text-transform:uppercase; letter-spacing:.08em; color:var(--muted); margin:0 0 8px; }
  textarea, input, select { width:100%; background:#0e1220; color:var(--text); border:1px solid var(--line); border-radius:12px; padding:12px 14px; font:15px/1.5 Inter, sans-serif; outline:none; }
  textarea:focus, input:focus, select:focus { border-color:var(--accent); }
  textarea { resize:vertical; min-height:96px; }
  .row { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-top:20px; }
  .field { margin-top:20px; }
  button { margin-top:28px; width:100%; border:0; border-radius:12px; padding:15px; cursor:pointer;
           font:600 16px 'Space Grotesk', sans-serif; color:#fff; background:linear-gradient(90deg, var(--accent), var(--accent2)); }
  button:hover { filter:brightness(1.1); }
  .hint { color:var(--muted); font-size:12.5px; margin-top:14px; }
</style>
</head>
<body>
  <form class="card" method="GET">
    <h1>Design <span>Agent</span></h1>
    <p class="sub">Describe your event or brand. The agent designs a theme &mdash; color palette, font system, and a batch of on-theme background designs you can download.</p>

    <label for="brief">Design brief</label>
    <textarea id="brief" name="brief" required placeholder="e.g. Diwali tech fest at our campus &mdash; festive but modern, for posters and the event site"></textarea>

    <div class="row">
      <div>
        <label for="count">Number of designs</label>
        <input id="count" name="count" type="number" min="1" max="24" value="6">
      </div>
      <div>
        <label for="size">Canvas size</label>
        <select id="size" name="size">
          <option value="insta">Instagram post &middot; 1080&times;1080</option>
          <option value="story">Story / reel &middot; 1080&times;1920</option>
          <option value="a4">A4 poster (print) &middot; 2480&times;3508</option>
          <option value="hero">Website hero &middot; 1920&times;1080</option>
          <option value="banner">Wide banner &middot; 1500&times;500</option>
        </select>
      </div>
    </div>

    <button type="submit">Generate design kit</button>
    <p class="hint">Tip: you can also call this URL directly &mdash; <code>?brief=...&amp;count=8&amp;size=a4</code>. Add <code>&amp;size=1200x628</code> for a custom canvas, <code>&amp;seed=42</code> for reproducible output.</p>
  </form>
</body>
</html>`;

return [{ json: { html } }];
