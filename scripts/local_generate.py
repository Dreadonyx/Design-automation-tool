"""One CPU image per process; weights must already be downloaded. Releases RAM on exit."""
import json
import sys
from pathlib import Path


def main():
    import torch
    from diffusers import StableDiffusionPipeline, StableDiffusionImg2ImgPipeline
    from PIL import Image, ImageOps
    request=json.loads(Path(sys.argv[1]).read_text())
    torch.set_num_threads(4)
    if max(request['width'],request['height'])>512:
        raise ValueError('Local CPU generation is capped at 512 pixels per side')
    cls=StableDiffusionImg2ImgPipeline if request.get('reference') else StableDiffusionPipeline
    pipe=cls.from_pretrained(request['model'],torch_dtype=torch.float32,local_files_only=True,use_safetensors=True)
    pipe.enable_attention_slicing(); pipe.vae.enable_slicing(); pipe.to('cpu')
    options=dict(prompt=request['prompt'],num_inference_steps=20,guidance_scale=7.0,generator=torch.Generator(device='cpu').manual_seed(request['seed']))
    if request.get('reference'):
        with Image.open(request['reference']) as ref:
            options.update(image=ImageOps.fit(ref.convert('RGB'),(request['width'],request['height'])),strength=.65)
    else:
        options.update(width=request['width'],height=request['height'])
    result=pipe(**options)
    if getattr(result,'nsfw_content_detected',None) and any(result.nsfw_content_detected):
        sys.exit(3)
    result.images[0].save(request['output'])

if __name__=='__main__':
    main()
