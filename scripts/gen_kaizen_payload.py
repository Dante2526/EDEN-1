#!/usr/bin/env python3
"""Recorta a ilustração kaizen do print do usuário e gera payload de teste.
Simula exatamente o que o modal envia: downscale p/ ≤1024px + JPEG q85."""
import base64
import io
import json

from PIL import Image

img = Image.open("/home/z/my-project/upload/pasted_image_1793325160432.png").convert("RGBA")

# O print tem a UI ao redor; a ilustração fica na área central do modal.
# Corta as bordas de UI (topo ~120px com header+erro, base ~90px com botões,
# laterais ~30px) — fica só a arte laranja.
w, h = img.size
crop = img.crop((30, 130, w - 30, h - 95))

# Fundo branco (o modal faz isso ao converter PNG→JPEG)
bg = Image.new("RGB", crop.size, (255, 255, 255))
bg.paste(crop, mask=crop.split()[3])

# Downscale p/ lado maior 1024 (o que o modal faz)
if max(bg.size) > 1024:
    scale = 1024 / max(bg.size)
    bg = bg.resize((round(bg.size[0] * scale), round(bg.size[1] * scale)), Image.LANCZOS)

buf = io.BytesIO()
bg.save(buf, format="JPEG", quality=85)
b64 = base64.b64encode(buf.getvalue()).decode()

with open("/home/z/my-project/scripts/vlm-payload-kaizen.json", "w") as f:
    f.write(json.dumps({"image": f"data:image/jpeg;base64,{b64}"}))
print(f"Recorte: {bg.size} | JPEG: {len(buf.getvalue())} bytes | base64: {len(b64)} chars")
