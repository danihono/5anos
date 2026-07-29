# Correio dos Apaixonados — 5 anos ♥

Dois pedaços, na ordem em que se vive:

1. **`index.html`** — o jogo. A menina corre por três cenários de Londres, desvia de obstáculos, recolhe onze envelopes e chega na porta da agência.
2. **`correio-dos-apaixonados-v2.html`** — as cartas. A porta abre, a agência aparece e as onze correspondências (com vídeo) e a encomenda registrada estão lá.

Quando o jogo termina, ele funde para preto e entrega para o segundo arquivo, que abre dissolvendo do preto sobre a mesma fachada. Lê como um corte só.

## Como abrir

**Dois cliques no `index.html`.** É isso. Todo o Three.js e todo o código do jogo estão embutidos num único `<script type="module">`, exatamente para funcionar em `file://`, sem servidor e sem internet (só as fontes do Google são baixadas; sem elas o texto cai numa serifa do sistema e continua bonito).

Para desenvolver com recarregamento normal, vale subir um servidor:

```bash
python3 -m http.server 8000
# depois abra http://localhost:8000/
```

## Como mexer no jogo

O `index.html` é **gerado** — não edite ele à mão. As fontes estão em `js/`:

| Arquivo | O que faz |
|---|---|
| `js/fases.js` | **Comece por aqui.** As três cenas em forma de dados: cor do céu, luz, neblina, quais obstáculos aparecem, onde ficam os envelopes, ajustes de câmera. |
| `js/jogo.js` | Laço de passo fixo, colisão, corações, checkpoints, pausa, cutscene final. |
| `js/mundo.js` | Rua, casas, adereços, carros, marcos de Londres, chuva, a fachada da agência. |
| `js/materiais.js` | Texturas desenhadas em `<canvas>` na hora (asfalto, calçada, paralelepípedo, grama, fachadas) e o céu que gera o env map. |
| `js/personagem.js` | A menina: corpo em grupos e ciclo de corrida por senoides. |
| `js/obstaculos.js` | Catálogo de obstáculos e o envelope coletável. |
| `js/pos.js` | Pós-processamento próprio: bloom, profundidade de campo, tonemap, vinheta, gota na lente. |
| `js/audio.js` | Todos os sons, sintetizados em WebAudio. Nenhum arquivo de áudio. |
| `js/util.js` | Sorteio determinístico, presets de qualidade, `localStorage`. |

Depois de editar, gere o `index.html`:

```bash
python3 build.py
```

O `build.py` concatena o `vendor/three/*.min.js` e os módulos de `js/` dentro do `src/index.template.html`. Ele reclama alto se algum `import`/`export` ficar sem tratamento, em vez de gerar um arquivo quebrado.

### Atalhos de desenvolvimento

- `index.html?fase=1` — abre direto a segunda cena (0, 1 ou 2).
- `index.html?dist=700` — começa já adiantada na cena.
- `index.html#debug` — mostra o contador de quadros por segundo.

Sem esses parâmetros o jogo começa do início, como deve.

## Decisões que valem saber

**Ninguém pode travar antes das cartas.** Isso guia o jogo inteiro: três corações, checkpoint a cada terço de cena, retorno automático, um modo mais leve oferecido depois de duas quedas no mesmo ponto, e um link "ir direto para as cartas" sempre visível num canto. O `validarTrajeto` em `js/fases.js` confere a cada meio metro que sobra pelo menos uma faixa livre, e reclama no console se algum padrão novo quebrar isso.

**Coletar envelope não destrava nada.** Os onze envelopes espalhados pelas cenas correspondem às onze cartas. Quem recolhe ganha um brilho dourado no escaninho correspondente; quem não recolhe abre a carta do mesmo jeito.

**O trajeto é sempre o mesmo.** Os obstáculos são sorteados com semente fixa, então a corrida dá para aprender em vez de depender de azar.

**As cartas são intocáveis.** O `correio-dos-apaixonados-v2.html` só recebeu acréscimos: a capa preta que dissolve quando a URL traz `?from=jogo`, o brilho nos escaninhos vindos de `?c=`, e um link para jogar de novo. Abrir aquele arquivo sem parâmetro nenhum se comporta exatamente como antes.

## Vídeos

Os onze `.mp4` em `videos/` são referenciados por caminho relativo em `CONFIG.cartas[].video`, dentro do `correio-dos-apaixonados-v2.html`. Um deles tem espaços no nome (`1 ano de namoro.mp4`) — funciona, mas se algum dia for para um host mais rígido, vale renomear.

## Créditos

Three.js r185 (MIT), embutido — licença em `vendor/three/LICENSE`.
Todo o resto é código e desenho feitos aqui: nenhum modelo 3D, nenhuma imagem, nenhum arquivo de som.
