"""Load local credentials without replacing explicitly supplied environment values."""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
KEYS = {'CF_ACCOUNT_ID','CF_API_TOKEN','CF_FREE_ACCOUNT_ONLY','HF_TOKEN','HF_FREE_ACCOUNT_ONLY',
        'GEMINI_API_KEY','GEMINI_FREE_ACCOUNT_ONLY','OLLAMA_ENABLED','OLLAMA_URL','STUDIO_DATA'}


def load_env():
    path=ROOT/'.env'
    if not path.is_file(): return
    for line in path.read_text().splitlines():
        if not line.strip() or line.lstrip().startswith('#') or '=' not in line: continue
        key,value=line.split('=',1)
        if key.strip() in KEYS:
            os.environ.setdefault(key.strip(),value.strip().strip('"').strip("'"))
