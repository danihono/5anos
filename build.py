#!/usr/bin/env python3
"""
Gera o index.html do jogo a partir de src/index.template.html + vendor/three + js/*.js.

Por que existe: módulos ES não carregam em file://. Se a Isadora receber a pasta
num zip e der dois cliques, um jogo em módulos separados quebraria. Um único
<script type="module"> inline não busca nada na rede, então funciona em file://,
em servidor local e em qualquer host estático.

A técnica: cada módulo vira uma IIFE que devolve um objeto de exports, e os
imports viram desestruturação desse objeto. Isso evita colisão entre os nomes
manglados do three.core.min.js e do three.module.min.js, que são minificados
separadamente e reusam as mesmas letras.

Uso:  python3 build.py
"""

import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

RAIZ = Path(__file__).resolve().parent

# Ordem topológica: um módulo só pode importar de quem vem antes dele.
MODULOS = [
    "util.js",
    "audio.js",
    "materiais.js",
    "pos.js",
    "personagem.js",
    "obstaculos.js",
    "mundo.js",
    "fases.js",
    "jogo.js",
]

MARCADOR = "/*{{BUNDLE}}*/"


def lista_specs(bloco):
    """
    '{a as B, c}' -> [('a','B'), ('c','c')]  (lado esquerdo, lado direito).

    Atenção: `X as y` quer dizer coisas opostas nos dois lados.
      import {Nome as local}   -> desestruturar   {Nome: local}
      export {local as Nome}   -> objeto literal  {Nome: local}
    Por isso quem chama decide a ordem; aqui só devolvemos os dois lados crus.
    """
    bloco = bloco.strip().lstrip("{").rstrip("}")
    out = []
    for parte in bloco.split(","):
        parte = parte.strip()
        if not parte:
            continue
        if " as " in parte:
            esq, dir_ = (p.strip() for p in parte.split(" as ", 1))
        else:
            esq = dir_ = parte
        out.append((esq, dir_))
    return out


def pares_import(bloco):
    """import {Nome as local} -> 'Nome: local' (desestruturação)."""
    return ", ".join(
        f"{esq}: {dir_}" if esq != dir_ else esq for esq, dir_ in lista_specs(bloco)
    )


def pares_export(bloco):
    """export {local as Nome} -> 'Nome: local' (objeto literal)."""
    return ", ".join(
        f"{dir_}: {esq}" if esq != dir_ else esq for esq, dir_ in lista_specs(bloco)
    )


def envolve_three(fonte, nome_ns, importa_de=None):
    """
    Converte um build do three (ESM) numa IIFE que devolve seus exports.

    `import{X as y}from'./three.core.js'`  ->  const {X: y} = __core;
    `export{...}from'./three.core.js'`     ->  removido (já vem no merge do core)
    `export{y as X}` (final)               ->  return {X: y};
    """
    # 1) re-exports (export {...} from '...') — descartáveis, o core já entra no merge.
    fonte = re.sub(r"export\s*\{[^}]*\}\s*from\s*['\"][^'\"]+['\"]\s*;?", "", fonte, count=1)

    # 2) import inicial -> desestruturação
    prologo = ""
    m = re.search(r"import\s*(\{[^}]*\})\s*from\s*['\"][^'\"]+['\"]\s*;?", fonte)
    if m:
        if importa_de is None:
            sys.exit(f"[build] {nome_ns}: tem import mas nenhuma origem foi informada")
        prologo = f"const {{ {pares_import(m.group(1))} }} = {importa_de};\n"
        fonte = fonte[: m.start()] + fonte[m.end() :]

    # 3) export final -> return
    m = re.search(r"export\s*\{([^}]*)\}\s*;?\s*$", fonte)
    if not m:
        sys.exit(f"[build] {nome_ns}: não achei o export final")
    fonte = fonte[: m.start()] + f"\nreturn {{ {pares_export(m.group(1))} }};\n"

    return f"const {nome_ns} = (function(){{\n{prologo}{fonte}}})();\n"


def envolve_modulo(fonte, nome):
    """
    Converte um módulo nosso numa IIFE registrada em __M.

    Aceita `export function f`, `export const c`, `export class C` e
    `import {a, b} from './outro.js'`.
    """
    prologo = []

    def troca_import(m):
        alvo = Path(m.group(2)).stem
        origem = "THREE" if alvo in ("three.module", "three") else f"__M['{alvo}']"
        prologo.append(f"const {{ {pares_import(m.group(1))} }} = {origem};")
        return ""

    fonte = re.sub(
        r"^\s*import\s*(\{[^}]*\})\s*from\s*['\"]([^'\"]+)['\"]\s*;?\s*$",
        troca_import,
        fonte,
        flags=re.M,
    )

    def troca_namespace(m):
        alvo = Path(m.group(2)).stem
        origem = "THREE" if alvo in ("three.module", "three") else f"__M['{alvo}']"
        prologo.append(f"const {m.group(1)} = {origem};")
        return ""

    fonte = re.sub(
        r"^\s*import\s*\*\s*as\s+([A-Za-z_$][\w$]*)\s*from\s*['\"]([^'\"]+)['\"]\s*;?\s*$",
        troca_namespace,
        fonte,
        flags=re.M,
    )

    exportados = []

    def troca_export(m):
        exportados.append(m.group(2))
        return m.group(1)

    fonte = re.sub(
        r"^export\s+((?:async\s+)?(?:function|const|let|class)\s+([A-Za-z_$][\w$]*))",
        troca_export,
        fonte,
        flags=re.M,
    )

    if re.search(r"^\s*(export|import)\s", fonte, flags=re.M):
        linha = re.search(r"^.*\b(export|import)\b.*$", fonte, flags=re.M).group(0)
        sys.exit(f"[build] {nome}: sobrou import/export não tratado -> {linha.strip()[:90]}")

    corpo = "\n".join(prologo) + "\n" + fonte
    devolve = ", ".join(exportados)
    return f"__M['{Path(nome).stem}'] = (function(){{\n{corpo}\nreturn {{ {devolve} }};\n}})();\n"


def confere_sintaxe(bundle):
    """
    Passa o bundle inteiro pelo `node --check`, se houver node por perto.

    Existe por causa de um erro que o build engoliu calado: um comentário DENTRO
    de um shader — que mora num template literal — tinha uma crase, e a crase
    fechou a string. O arquivo saiu com 1 MB, o navegador abriu, e a única
    pista era "Unexpected identifier 'd'" no console, com o jogo travado em
    "preparando Londres…". Trinta segundos de teste para descobrir o que o node
    diz na hora, com número de linha.

    Sem node instalado o build segue: é uma rede de segurança, não um requisito.
    """
    node = shutil.which("node")
    if not node:
        return
    with tempfile.NamedTemporaryFile("w", suffix=".mjs", encoding="utf-8", delete=False) as f:
        f.write(bundle)
        caminho = f.name
    try:
        r = subprocess.run([node, "--check", caminho], capture_output=True, text=True)
        if r.returncode != 0:
            erro = (r.stderr or "").strip().splitlines()
            print("[build] o bundle não é JavaScript válido:", file=sys.stderr)
            for linha in erro[:12]:
                print("   " + linha.replace(caminho, "<bundle>"), file=sys.stderr)
            sys.exit(1)
    finally:
        Path(caminho).unlink(missing_ok=True)


def main():
    partes = []

    core = (RAIZ / "vendor/three/three.core.min.js").read_text(encoding="utf-8")
    modulo = (RAIZ / "vendor/three/three.module.min.js").read_text(encoding="utf-8")
    versao = (RAIZ / "vendor/three/VERSION").read_text(encoding="utf-8").strip()

    partes.append(f"/* three.js r{versao} — MIT — https://threejs.org  (embutido por build.py) */")
    partes.append(envolve_three(core, "__three_core"))
    partes.append(envolve_three(modulo, "__three_mod", importa_de="__three_core"))
    partes.append("const THREE = Object.assign({}, __three_core, __three_mod);\n")
    partes.append("const __M = {};\n")

    for nome in MODULOS:
        caminho = RAIZ / "js" / nome
        if not caminho.exists():
            sys.exit(f"[build] falta {caminho}")
        partes.append(f"/* ── js/{nome} ── */")
        partes.append(envolve_modulo(caminho.read_text(encoding="utf-8"), nome))

    partes.append("__M['jogo'].iniciar();\n")

    bundle = "\n".join(partes)
    confere_sintaxe(bundle)

    template = (RAIZ / "src/index.template.html").read_text(encoding="utf-8")
    if MARCADOR not in template:
        sys.exit(f"[build] o template não tem o marcador {MARCADOR}")
    saida = template.replace(MARCADOR, bundle)

    destino = RAIZ / "index.html"
    destino.write_text(saida, encoding="utf-8")
    print(f"[build] index.html gerado — {len(saida)/1024:.0f} KB (three r{versao} embutido)")

    # Versão só-o-jogo, para mostrar por aí (Artifact, link solto) sem levar
    # junto as cartas e os 91 MB de vídeo. Muda um atributo e nada mais: o
    # `index.html` do presente sai daqui intocado.
    # A marca vai num <script>, e não num atributo do <body>, de propósito:
    # ao publicar como Artifact o arquivo pode ser embrulhado num esqueleto de
    # HTML, e aí o <body> de dentro é descartado pelo interpretador junto com
    # os atributos dele. Script inline sobrevive a isso.
    if "--demo" in sys.argv:
        demo = saida.replace("<body>", "<body>\n<script>window.__soOJogo=1;</script>", 1)
        if demo == saida:
            sys.exit("[build] não achei o <body> para marcar a versão de demonstração")

        # Fontes embutidas: publicado como Artifact, o CSP corta domínio
        # externo e o Google Fonts nunca chega. O texto continua legível nas
        # fontes de reserva, mas a demo existe para mostrar o presente como
        # ele é — então aqui elas viajam junto.
        fontes = RAIZ / "vendor/fontes-embutidas.css"
        if fontes.exists():
            demo = re.sub(
                r'<link rel="preconnect"[^>]*fonts\.googleapis[^>]*>\s*'
                r'<link href="https://fonts\.googleapis\.com[^"]*"[^>]*>',
                "<style>\n" + fontes.read_text(encoding="utf-8") + "</style>",
                demo, count=1)
            if "fonts.googleapis.com" in demo:
                sys.exit("[build] não consegui trocar o link das fontes pelas embutidas")
        else:
            print("[build] aviso: sem vendor/fontes-embutidas.css, a demo vai cair nas fontes de reserva")
        (RAIZ / "index-demo.html").write_text(demo, encoding="utf-8")
        print(f"[build] index-demo.html gerado — o final mostra um cartão em vez de ir para as cartas")


if __name__ == "__main__":
    main()
