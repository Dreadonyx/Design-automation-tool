"""Explicit publisher-model download; pin the resolved revision and use weights-only loading."""
import argparse
import json
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent.parent))
from studio.providers import CATALOG, ROOT

parser=argparse.ArgumentParser(description='Download a reviewed local model (Tiny SD: about 1 GB download).')
parser.add_argument('model',choices=['local-tiny','local-sd15'])
args=parser.parse_args()
p=next(p for p in CATALOG if p['id']==args.model)
print('Model:',p['model'],'License:',p['license'],p['url'],flush=True)
from huggingface_hub import HfApi, snapshot_download
revision=HfApi().model_info(p['model']).sha
dest=ROOT/'.studio'/'models'/p['id']
patterns=['*.json','*.txt','*.safetensors','*.model']
if args.model=='local-tiny': patterns.append('*.bin')
snapshot_download(p['model'],revision=revision,local_dir=dest,allow_patterns=patterns,ignore_patterns=['*fp16*','*onnx*','*flax*'],max_workers=2)
if args.model=='local-tiny':
    # The publisher distributes legacy tensor files. Never allow arbitrary pickle objects.
    import torch
    from safetensors.torch import save_file
    for source in dest.glob('*/*.bin'):
        target=source.with_suffix('.safetensors')
        if source.name=='pytorch_model.bin': target=source.with_name('model.safetensors')
        if not target.exists():
            tensors=torch.load(source,map_location='cpu',weights_only=True)
            save_file({k:v.contiguous() for k,v in tensors.items()},str(target),metadata={'format':'pt'})
for component in ['unet','vae','text_encoder']:
    if not list((dest/component).glob('*.safetensors')):
        raise RuntimeError('Missing weights for '+component)
(dest/'studio-ready.json').write_text(json.dumps({'model':p['model'],'revision':revision,'license':p['license']}))
print('Downloaded and validated. Local generation is ready.',flush=True)
