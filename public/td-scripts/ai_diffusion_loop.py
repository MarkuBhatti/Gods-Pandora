"""
GOD'S PANDORA Template: AI Diffusion Loop
=======================================
Real-time Stable Diffusion loop via img2img.
Requires: AUTOMATIC1111 SD WebUI running on port 7860.
"""
import td
import json

SD_HOST = 'http://127.0.0.1:7860'

def buildDiffusionLoop(parent=None):
    root = parent or op('/project1')
    base = root.create(baseCOMP, 'aiDiffusionLoop')

    # Script DAT to call SD API
    script = base.create(scriptDAT, 'sdApiCall')
    script.par.active = True
    script.text = '''
import requests, base64, io, json

def onCook(dat):
    params_op = op("/project1/pandoraBridge/params")
    strength = params_op["pandora/ai/strength"][0] if params_op else 0.4
    cfg = params_op["pandora/ai/cfgScale"][0] * 14 + 1 if params_op else 7
    steps = max(1, int(params_op["pandora/ai/steps"][0] * 20)) if params_op else 4

    prompt_op = op("../promptStr")
    prompt = prompt_op.text if prompt_op else "cinematic generative art, neon glow"

    # Capture current TD render
    render_top = op("../renderCapture")
    if render_top:
        img_data = render_top.saveByteArray("png")
        img_b64 = base64.b64encode(img_data).decode()
    else:
        return

    payload = {
        "init_images": [img_b64],
        "prompt": prompt,
        "denoising_strength": strength,
        "cfg_scale": cfg,
        "steps": steps,
    }
    try:
        r = requests.post("http://127.0.0.1:7860/sdapi/v1/img2img", json=payload, timeout=30)
        result = r.json()
        out_b64 = result["images"][0]
        # Write to shared memory or temp file for TD to read back
        img_bytes = base64.b64decode(out_b64)
        with open(app.userPrefPath + "/sd_output.png", "wb") as f:
            f.write(img_bytes)
    except Exception as e:
        print("[SD Loop]", e)
'''

    print("AI Diffusion Loop built!")
    print("  1. Start AUTOMATIC1111 with --api flag: python launch.py --api")
    print("  2. Set SD prompt from God's Pandora WebSocket panel")
    print("  3. Script calls img2img every cook cycle")

buildDiffusionLoop()
