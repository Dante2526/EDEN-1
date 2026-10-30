#!/usr/bin/env python3
"""Gera uma imagem de teste pequena (512x512) e um payload JSON para /api/vlm-analyze."""
import base64
import io
import json

from PIL import Image, ImageDraw

# Fundo azul, círculo verde no centro, texto amarelo — 3 elementos distintos
img = Image.new("RGB", (512, 512), (70, 130, 220))
d = ImageDraw.Draw(img)
d.ellipse([180, 160, 340, 320], fill=(60, 180, 75))
d.rectangle([60, 400, 452, 470], fill=(255, 200, 60))
d.text((160, 420), "TESTE EDEN", fill=(20, 20, 20))

buf = io.BytesIO()
img.save(buf, format="PNG", optimize=True)
b64 = base64.b64encode(buf.getvalue()).decode()

payload = {"image": f"data:image/png;base64,{b64}"}
with open("/home/z/my-project/scripts/vlm-payload.json", "w") as f:
    f.write(json.dumps(payload))

print(f"Imagem PNG: {len(buf.getvalue())} bytes | base64: {len(b64)} chars")
