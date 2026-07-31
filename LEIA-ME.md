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
| `js/fases.js` | **Comece por aqui.** As três cenas em forma de dados: cor do céu, luz, neblina, quais obstáculos aparecem, onde ficam os envelopes, os marcos de Londres, ajustes de câmera. |
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
- `index.html#debug` — mostra o contador de quadros por segundo e publica `window.__jogo` (cena, câmera, estado, mundo, fase, trajeto, pós).

Sem esses parâmetros o jogo começa do início, como deve.

## O anel de quarteirões anda nos dois sentidos

O mundo é um anel de blocos de 24 m que se recicla à frente dela. Durante muito
tempo o reciclador só sabia **empurrar para a frente**, e isso escondeu um bug
que passou despercebido porque eu só testava as cenas pelo atalho `?fase=`:

Na troca de cena, `carregarFase` é `await`-ado e os `respirar()` devolvem o
controle ao navegador — então o laço de quadro continua rodando e chama
`mundo.atualizar` com a distância **da cena anterior**, 900 m. O anel
recém-nascido em 0…240 m era empurrado inteiro para além dos 900, e o
`reiniciarPosicao(0)` que vinha depois não tinha como trazê-lo de volta.
Resultado: meio quilômetro de parque vazio na entrada da cena 2, e a primeira
coisa a aparecer era a London Eye. Foi o Daniel quem viu, jogando.

O conserto é uma conta só, em `atualizar`: como cada bloco tem uma vaga fixa no
anel (o índice módulo N), dá para reencaixá-lo na janela certa em qualquer
direção, num quadro. Isso arruma junto o `?dist=`, que antes precisava de uns
10 s de recuperação antes de valer para tirar print — hoje vale já no primeiro
quadro.

## O Big Ben é copiado do de verdade

A Torre Elizabeth é o coração da cena 3 e não é invenção: as medidas e as cores
saíram de pesquisa, e `fazBigBen` em `js/mundo.js` segue esta ficha (a escala em
`fases.js` é 0.92, então lá dentro tudo é medida real ÷ 0.92).

| | de verdade |
|---|---|
| altura | 96,3 m; base quadrada de 12 m de lado |
| estrutura | alvenaria de pedra de Anston até 61 m; daí para cima, flecha de ferro fundido |
| mostradores | quatro, 6,9 m de diâmetro, a 54,9 m do chão, 324 peças de vidro opala leitoso |
| algarismos e ponteiros | **azul da Prússia** — a cor original de Barry, achada sob fuligem e tinta preta no restauro de 2017-2022 |
| moldura e detalhes | aro dourado e folha de ouro; cantos do painel em azul cobalto |
| relógio à noite | aceso por trás desde 1859 (hoje LED), amarelo quente |
| pedra à noite | refletores dourados de baixo para cima, LED desde 2012, desenhando as pilastras |
| Luz de Ayrton | lanterna acima do campanário, posta em 1885 a pedido da rainha Victoria; acesa quando o Parlamento está reunido depois de escurecer |

Duas coisas aprendidas ajustando isso, e que valem para qualquer detalhe novo:

**Detalhe fino some, mas escurece.** A primeira treliça tinha oito raios, dois
anéis e doze algarismos. A 150 m o mostrador tem uns 30 pixels: nada daquilo
resolvia, e o que sobrava era a média — um disco azul apagado no lugar de um
relógio aceso. Ficaram quatro raios, um anel e algarismos menores.

E isso vale para **estrutura**, não só para desenho: caí na mesma armadilha na
London Eye. O aro dela tinha 0,84 m de tubo, o que dá 1,5 pixel a 87 m — a roda
lia bem de perto e lavava à distância, e eu passei um bom tempo achando que era
cor. Não era: linha mais fina que um pixel não desenha, só acinzenta. Quando um
marco tem que ser visto de longe, engrosse a bitola até ela sobreviver à
distância, mesmo que de perto fique mais pesada do que seria fiel.

**Empilhe por raio absoluto, não por fator.** As camadas do mostrador (moldura,
painel, vidro, aro, treliça, ponteiros) têm espessura. Posicionar cada uma
multiplicando o raio por 0.99, 1.01, 1.02 parecia certo e não era: a caixa do
painel de trás tem 0,3 m de fundo, e a cara dela acabava na frente do vidro —
o relógio simplesmente não acendia. Agora cada camada tem seu raio em metros,
a partir da parede do estágio em 6.2.

## Decisões que valem saber

**Ninguém pode travar antes das cartas.** Isso guia o jogo inteiro: três corações, checkpoint a cada terço de cena, retorno automático, um modo mais leve oferecido depois de duas quedas no mesmo ponto, e um link "ir direto para as cartas" sempre visível num canto. O `validarTrajeto` em `js/fases.js` confere a cada meio metro que sobra pelo menos uma faixa livre, e reclama no console se algum padrão novo quebrar isso.

**Coletar envelope não destrava nada.** Os onze envelopes espalhados pelas cenas correspondem às onze cartas. Quem recolhe ganha um brilho dourado no escaninho correspondente; quem não recolhe abre a carta do mesmo jeito.

**O trajeto é sempre o mesmo.** Os obstáculos são sorteados com semente fixa, então a corrida dá para aprender em vez de depender de azar.

**Os marcos de Londres têm dois papéis, e a diferença importa.** Em `js/fases.js`:

- `pontos` são lugares **por onde ela passa**. Ficam parados num `z` do trajeto, e a fileira de casas abre uma clareira (`claro`, em metros) para o marco caber. Toda clareira precisa de chão, senão sobra o vazio embaixo do horizonte — daí o campo `piso`, que aceita `'praca'` (calçamento) ou `'agua'` (o Tâmisa, com muro de arrimo). O campo `legenda` mostra uma frase quando ela chega perto, com `aviso` metros de antecedência.
- `marcos` são **pano de fundo**: mantêm distância fixa da câmera e nunca são alcançados, como cenário de teatro.

Hoje ela atravessa a praça de Westminster com o Parlamento e o Big Ben (cena 1), passa sob a roda-gigante plantada no lago (cena 2) e cruza a **Tower Bridge** entre as duas torres, com o rio dos dois lados (cena 3). Vale dizer: a icônica das duas torres é a Tower Bridge; a London Bridge é a lisa ao lado. E a ponte aqui atravessa a rua da cena, não um Tâmisa geograficamente correto — é uma Londres de desenho, não um mapa.

**As cartas são intocáveis.** O `correio-dos-apaixonados-v2.html` só recebeu acréscimos: a capa preta que dissolve quando a URL traz `?from=jogo`, o brilho nos escaninhos vindos de `?c=`, e um link para jogar de novo. Abrir aquele arquivo sem parâmetro nenhum se comporta exatamente como antes.

## Vídeos

Os onze `.mp4` em `videos/` são referenciados por caminho relativo em `CONFIG.cartas[].video`, dentro do `correio-dos-apaixonados-v2.html`. Um deles tem espaços no nome (`1 ano de namoro.mp4`) — funciona, mas se algum dia for para um host mais rígido, vale renomear.

## Créditos

Three.js r185 (MIT), embutido — licença em `vendor/three/LICENSE`.
Todo o resto é código e desenho feitos aqui: nenhum modelo 3D, nenhuma imagem, nenhum arquivo de som.
