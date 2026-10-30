#!/usr/bin/env python3
"""Mede ground-truth das posições dos elementos da arte kaizen (851x353)
via análise de cor — para validar qual conversão de coordenadas o VLM usa."""
from PIL import Image

img = Image.open("/home/z/my-project/scripts/kaizen_analysis.jpg") if False else None
import io, base64, json

d = json.load(open("/home/z/my-project/scripts/vlm-payload-kaizen.json"))
b64 = d["image"].split(",", 1)[1]
img = Image.open(io.BytesIO(base64.b64decode(b64))).convert("RGB")
W, H = img.size
print(f"Imagem: {W}x{H}")
px = img.load()

def blob_stats(pred, label):
    xs, ys = [], []
    for y in range(0, H, 2):
        for x in range(0, W, 2):
            r, g, b = px[x, y]
            if pred(r, g, b):
                xs.append(x); ys.append(y)
    if not xs:
        print(f"  {label}: não encontrado")
        return
    cx, cy = sum(xs) / len(xs), sum(ys) / len(ys)
    print(f"  {label:22s} centro=({cx/W*100:5.1f}%, {cy/H*100:5.1f}%)  "
          f"bbox=({min(xs)/W*100:.0f}-{max(xs)/W*100:.0f}%, {min(ys)/H*100:.0f}-{max(ys)/H*100:.0f}%)")

print("Ground truth (medição direta):")
blob_stats(lambda r, g, b: r > 225 and g > 225 and b > 220, "Cartão branco")
blob_stats(lambda r, g, b: b > 130 and b > r + 45 and b > g + 35, "Cabeça azul")
blob_stats(lambda r, g, b: g > 140 and r < 110 and b < 110, "Ponto verde")
blob_stats(lambda r, g, b: r > 160 and g < 90 and b < 90, "Ponto vermelho")
blob_stats(lambda r, g, b: r > 200 and g > 120 and g < 200 and b < 100, "Fundo laranja")

print()
print("Coordenadas cruas do VLM (escala misteriosa) e as 2 hipóteses de conversão:")
raw = [
    ("Pessoa sentada", 370, 380), ("Cartão Kaizen", 480, 720), ("Título Kaizen", 440, 740),
    ("Autoria", 440, 810), ("Pontos coloridos", 570, 680), ("Caixa seleção", 570, 880),
    ("Clipboard check", 290, 470), ("Cabeça azul", 370, 290),
]
print(f"  {'elemento':20s} {'A: /10 (0-1000)':>18s} {'B: y/851 (canvas quadrado)':>26s}")
for name, x, y in raw:
    a = (x / 10, y / 10)
    b = (x / W * 100, y / 851 * 100)
    print(f"  {name:20s} ({a[0]:5.1f}%,{a[1]:5.1f}%)   ({b[0]:5.1f}%,{b[1]:5.1f}%)")
