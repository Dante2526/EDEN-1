#!/usr/bin/env python3
"""Gera payload com imagem GRANDE (2200x1650, estilo ilustração complexa)
para medir como a latência do VLM escala com o tamanho."""
import base64
import io
import json
import random

from PIL import Image, ImageDraw, ImageFont

random.seed(42)
W, H = 2200, 1650
img = Image.new("RGB", (W, H), (245, 166, 35))  # fundo laranja (como o kaizen)
d = ImageDraw.Draw(img)

# "cartão" branco central (como a arte do usuário)
d.rounded_rectangle([350, 300, 1850, 1350], 60, fill=(250, 250, 248), outline=(210, 210, 205), width=4)

# "personagem" — círculos coloridos simulando cartoon
d.ellipse([850, 450, 1350, 950], fill=(80, 120, 220), outline=(40, 60, 140), width=8)
d.ellipse([1000, 580, 1200, 730], fill=(255, 255, 255))
d.ellipse[1020, 600, 1080, 660] if False else d.ellipse([1020, 600, 1080, 660], fill=(20, 20, 20))
d.ellipse([1120, 600, 1180, 660], fill=(20, 20, 20))
d.arc([1000, 750, 1200, 900], 20, 160, fill=(20, 20, 20), width=10)

# "texto" KAIZEN simulado (blocos, sem fonte externa)
d.rectangle([520, 1050, 1680, 1150], fill=(80, 120, 220))
d.rectangle([520, 1190, 1200, 1270], fill=(245, 166, 35))

# bolinhas coloridas na lateral (como no print do usuário)
for i, color in enumerate([(60, 180, 75), (220, 50, 50), (70, 130, 220), (150, 80, 220)]):
    d.ellipse([120 + i * 90, 1380, 190 + i * 90, 1450], fill=color)

# ruído/textura leve pra simular arte real (pixels variados)
for _ in range(4000):
    x, y = random.randint(0, W - 1), random.randint(0, H - 1)
    c = random.randint(200, 255)
    d.point((x, y), fill=(c, c, c))

buf = io.BytesIO()
img.save(buf, format="JPEG", quality=95)  # JPEG q95 — pesado de propósito
b64 = base64.b64encode(buf.getvalue()).decode()

payload = {"image": f"data:image/jpeg;base64,{b64}"}
with open("/home/z/my-project/scripts/vlm-payload-big.json", "w") as f:
    f.write(json.dumps(payload))
print(f"Imagem JPEG 2200x1650 q95: {len(buf.getvalue())} bytes | base64: {len(b64)} chars")
