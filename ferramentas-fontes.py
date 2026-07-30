"""Baixa as fontes do Google e escreve um CSS com elas embutidas em data URI."""
import base64, re, subprocess, sys, pathlib

UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36'
CSS = ("https://fonts.googleapis.com/css2?family=Alfa+Slab+One&family=Pinyon+Script"
       "&family=Special+Elite&family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&display=swap")

def pega(url, binario=False):
    r = subprocess.run(['curl', '-sS', '-m', '40', '-A', UA, url],
                       capture_output=True, check=True)
    return r.stdout if binario else r.stdout.decode('utf-8')

css = pega(CSS)
# só o subconjunto latin: cobre todos os acentos do português e evita inchar
blocos = re.findall(r'/\*\s*latin\s*\*/\s*(@font-face\s*\{.*?\})', css, re.S)
print(f'blocos latin: {len(blocos)}')

saida, total = [], 0
for b in blocos:
    m = re.search(r"url\((https://fonts\.gstatic\.com/[^)]+\.woff2)\)", b)
    if not m:
        continue
    dados = pega(m.group(1), binario=True)
    total += len(dados)
    b64 = base64.b64encode(dados).decode('ascii')
    saida.append(b.replace(m.group(1), f'data:font/woff2;base64,{b64}')
                  .replace('\n', '').replace('  ', ' '))

destino = pathlib.Path('/home/user/5anos/vendor/fontes-embutidas.css')
destino.write_text('\n'.join(saida) + '\n', encoding='utf-8')
print(f'{len(saida)} faces · {total/1024:.0f} KB de woff2 · '
      f'{destino.stat().st_size/1024:.0f} KB de CSS')
