/* ═══════════════ as três cenas ═══════════════
   Tudo aqui é dado: paleta, luz, neblina, quais obstáculos aparecem e em que
   padrões. Os geradores de mundo.js só leem isso.

   O trajeto é sorteado com semente fixa, então a corrida é sempre a mesma —
   dá para aprender e melhorar, em vez de ser azar. E no fim passa por um
   validador que garante que sempre existe pelo menos uma faixa livre: essa é
   a promessa de que ninguém trava antes de chegar nas cartas.
   ═══════════════════════════════════════════════ */

import { sorteio, mistura, limita } from './util.js';
import { COMO_PASSAR } from './obstaculos.js';

/** Etiquetas curtas das 11 correspondências, na mesma ordem do site. */
export const CARTAS = [
  '14 ago 2021', '14 ago 2022', 'set 2023', 'dez 2023', 'jan 2024', 'dez 2024',
  'jan 2025', 'ago 2025', 'abr 2026', 'abr 2026', 'jun 2026',
];

/* ── padrões de obstáculo ───────────────────────────────────────────────
   Cada padrão é um trecho pequeno e autoral. `f` é a faixa (0 esquerda,
   1 meio, 2 direita) e `dz` a distância dentro do trecho.
   Regra de ouro ao escrever qualquer padrão novo: nunca ocupar as três
   faixas ao mesmo tempo. O validador reclama se escapar.
   ─────────────────────────────────────────────────────────────────────── */

const PADROES_RUA = [
  { n: 'cone solto',    comp: 6,  itens: [{ dz: 0, f: 1, t: 'cone' }] },
  { n: 'dois cones',    comp: 9,  itens: [{ dz: 0, f: 0, t: 'cone' }, { dz: 4, f: 1, t: 'cone' }] },
  { n: 'escadinha',     comp: 16, itens: [{ dz: 0, f: 0, t: 'caixote' }, { dz: 6, f: 1, t: 'caixote' }, { dz: 12, f: 2, t: 'caixote' }] },
  { n: 'corredor',      comp: 10, itens: [{ dz: 0, f: 0, t: 'lixeira' }, { dz: 0, f: 1, t: 'lixeira' }] },
  { n: 'poças',         comp: 14, itens: [{ dz: 0, f: 1, t: 'poca' }, { dz: 7, f: 2, t: 'poca' }] },
  { n: 'andaime',       comp: 11, itens: [{ dz: 0, f: 1, t: 'barreiraAlta' }, { dz: 0, f: 2, t: 'barreiraAlta' }] },
  { n: 'guarda-chuvas', comp: 13, itens: [{ dz: 0, f: 0, t: 'pedestre' }, { dz: 6, f: 2, t: 'pedestre' }] },
  { n: 'ônibus parado', comp: 20, itens: [{ dz: 7, f: 0, t: 'onibus' }, { dz: 16, f: 2, t: 'cone' }] },
  { n: 'baixa e pula',  comp: 18, itens: [{ dz: 0, f: 0, t: 'barreiraAlta' }, { dz: 9, f: 1, t: 'caixote' }] },
];

const PADROES_PARQUE = [
  { n: 'galho baixo',   comp: 8,  itens: [{ dz: 0, f: 1, t: 'galho' }] },
  { n: 'dois galhos',   comp: 13, itens: [{ dz: 0, f: 0, t: 'galho' }, { dz: 7, f: 2, t: 'galho' }] },
  { n: 'banco',         comp: 9,  itens: [{ dz: 0, f: 2, t: 'bancoVermelho' }] },
  { n: 'folhas',        comp: 12, itens: [{ dz: 0, f: 1, t: 'folhas' }, { dz: 6, f: 0, t: 'folhas' }] },
  { n: 'cachorro',      comp: 12, itens: [{ dz: 4, f: 1, t: 'cachorro' }] },
  { n: 'bicicletas',    comp: 11, itens: [{ dz: 0, f: 0, t: 'bicicleta' }, { dz: 5, f: 1, t: 'bicicleta' }] },
  { n: 'galho e banco', comp: 17, itens: [{ dz: 0, f: 1, t: 'galho' }, { dz: 9, f: 0, t: 'banco' }] },
  { n: 'alameda',       comp: 20, itens: [{ dz: 0, f: 0, t: 'banco' }, { dz: 8, f: 2, t: 'banco' }, { dz: 15, f: 1, t: 'galho' }] },
];

const PADROES_NOITE = [
  { n: 'caixotes',      comp: 10, itens: [{ dz: 0, f: 0, t: 'caixote' }, { dz: 5, f: 0, t: 'caixote' }] },
  { n: 'persiana',      comp: 9,  itens: [{ dz: 0, f: 1, t: 'portao' }] },
  { n: 'duas persianas',comp: 15, itens: [{ dz: 0, f: 0, t: 'portao' }, { dz: 8, f: 2, t: 'portao' }] },
  { n: 'entrega',       comp: 12, itens: [{ dz: 0, f: 2, t: 'bicicleta' }, { dz: 6, f: 1, t: 'caixote' }] },
  { n: 'beco',          comp: 14, itens: [{ dz: 0, f: 0, t: 'lixeira' }, { dz: 0, f: 1, t: 'lixeira' }, { dz: 8, f: 1, t: 'lixeira' }, { dz: 8, f: 2, t: 'lixeira' }] },
  { n: 'obra noturna',  comp: 16, itens: [{ dz: 0, f: 1, t: 'barreiraAlta' }, { dz: 8, f: 0, t: 'caixote' }] },
  { n: 'poças de neon', comp: 13, itens: [{ dz: 0, f: 2, t: 'poca' }, { dz: 6, f: 1, t: 'poca' }] },
  { n: 'último trecho', comp: 19, itens: [{ dz: 0, f: 0, t: 'portao' }, { dz: 7, f: 1, t: 'caixote' }, { dz: 14, f: 2, t: 'barreiraAlta' }] },
];

/* ── as fases ───────────────────────────────────────────────────────────── */

export const FASES = [
  {
    id: 'westminster',
    numero: 'primeira parte',
    titulo: 'Manhã de chuva em Londres',
    legenda: 'Westminster, e uma cidade inteira entre você e a porta.',
    tipo: 'rua',
    semente: 20210814,
    comprimento: 900,
    velocidadeInicial: 11,
    velocidadeFinal: 14.5,
    cartas: [0, 1, 2, 3],

    /* Manhã de chuva de verdade, com o céu carregado. Antes isto era um branco
       em que não dava para ver nada, e as duas causas estavam aqui:
       - `dirSol` apontava para o fim da rua (z=0.86), então o ponto de fuga
         virava um borrão branco. Agora o sol está de lado e baixo, atrás das
         nuvens, e o fundo da rua é legível.
       - `neblinaCeu` a 0.75 lavava três quartos do céu com a cor do horizonte,
         que era um creme quase branco. Caiu para 0.32, e o horizonte ficou
         cinza-azulado.
       Com o céu fechado, as vitrines acesas e o asfalto molhado passam a
       recortar contra ele — que é o que faz esta ser a Londres chuvosa bonita
       em vez de uma folha em branco. */
    /* A manta fechada da chuva. Cobertura alta e escala grande: são bancos
       largos e pesados, quase sem furo, que é o céu que Londres tem quando
       chove de verdade — e é contra ele que as vitrines acesas recortam. */
    paleta: {
      ceuAlto: '#5c7796', ceuHorizonte: '#9aa6ae', ceuBaixo: '#b3b6b2',
      corSol: '#e8e4d8', dirSol: [0.86, 0.24, -0.22], tamanhoSol: 130,
      forcaSol: 0.45, neblinaCeu: 0.32,
      nuvens: 0.95, nuvemCobertura: 0.6, nuvemEscala: 0.5,
      corNuvemFina: '#a7b2bd', corNuvemDensa: '#5d6b7a',
      nuvemVento: [0.02, 0.006],
    },
    neblina: 0.0034,
    forcaHalo: 0.018,
    dirLuz: [0.72, 0.6, -0.18],
    corSol: '#dfe6ee', forcaLuzSol: 1.15,
    corCeuLuz: '#93a8bf', corChaoLuz: '#8d8577', forcaHemisferio: 1.15,
    corPoste: '#ffc98a', forcaPoste: 16,
    /* Medido, não chutado: com 0.35 — e mesmo com 0.62, que era o valor da
       cena do parque — a sombra simplesmente NÃO APARECIA no quadro. A luz
       hemisférica e o env map preenchem o que o sol tira, e a curva em S do
       pós comprime o resto. Só perto de 1 a sombra volta a marcar o chão. Aqui
       fica um pouco abaixo porque é dia de chuva: sol fraco espalha de
       verdade. */
    sombra: 0.72,

    chuva: 0.75, corChuva: '#d6e4f2', vento: [-1.2, 0],
    molhado: 0.9, pedra: false,

    coresPredio: ['#f2d3d6', '#cfe4dc', '#f7e7c9', '#f6dfa6', '#dee2f1', '#f4cdb9'],
    janelasAcesas: 0.62, corJanela: '#ffdd9a', forcaJanela: 2.6,
    lojas: true, coresLoja: ['#c02a3e', '#2f7a68', '#3f5a9c', '#8a5aa8', '#d08a2a'],
    coresPorta: ['#2f5a8c', '#1f6b52', '#8e2436', '#3c3160', '#c07a1e', '#1d1b22'],

    /* Westminster mudou para a cena da noite, onde a torre pode ser iluminada
       de verdade. No lugar dela, o Piccadilly Circus — porque 900 m de fileira
       pastel sem nada acontecendo é muito tempo correndo por nada, que foi
       exatamente a queixa do Daniel.

       Fica no meio do percurso, com os telões virados para quem vem pela rua.
       A janela de olhada segue a mesma conta do Big Ben: no auge (dist ≈ 400)
       o paredão está a 66 m e ocupa boa parte da tela, com a menina ainda
       dentro do quadro. */
    pontos: [
      { tipo: 'piccadilly', x: 0, z: 466, claro: 190, lado: 1,
        nome: 'Piccadilly Circus',
        legenda: 'A cidade acordando com as luzes ainda acesas.',
        aviso: 150,
        /* A fachada fica em z≈498, à frente e à esquerda, virada para dentro do
           cruzamento. No auge (dist ≈ 470) ela está a uns 60 m: ocupa metade da
           altura da tela, com a menina ainda no quadro. fov 50, um pouco mais
           fechado que os 54 de base — aqui o marco é largo, então precisa de
           aproximação e não de espaço vertical. */
        olhada: { de: 360, ate: 500, fov: 50, recuo: 12, subida: 1.6,
                  mira: [24, 14, 498], dofPerto: 120, dofLonge: 480 } },

      /* ── os ônibus da linha 1D ──────────────────────────────────────────
         Cinco ônibus, cinco cidades: Holmes Chapel, Doncaster, Bradford,
         Mullingar e Wolverhampton. Todos da mesma linha. Não tem legenda
         nenhuma e não vai ter — quem conhece reconhece, e é aí que está a
         graça.

         Ficam encostados no meio-fio, em `x = ±4.2`, que é onde os ônibus de
         cenário já param: a meia-largura deles é 1,3, então a lataria começa em
         2,9, e a faixa de fora com a menina dentro chega a 2,32 — 58 cm de
         folga, sem tocar em faixa nenhuma.

         Estão aqui como PONTOS, e não sorteados nos blocos, por dois motivos:
         ponto tem `z` absoluto e não é reciclado (então a cidade não troca no
         meio da corrida), e assim dá para garantir que os cinco aparecem.

         Três nesta cena, dois na cena da agência. Fora da clareira do
         Piccadilly (376 a 556) para não pousarem dentro da praça. */
      { tipo: 'onibus', x: 4.2, z: 176, destino: 'HOLMES CHAPEL' },
      { tipo: 'onibus', x: -4.2, z: 288, rot: Math.PI, destino: 'DONCASTER' },
      { tipo: 'onibus', x: 4.2, z: 654, destino: 'BRADFORD' },
    ],

    padroes: PADROES_RUA,
    // bloom mais forte: é ele que faz as vitrines e os telões sangrarem no
    // cinza da chuva. E o véu quente sai, que ali só empapava o branco.
    camera: { exposicao: 1.0, bloom: 0.8, vinheta: 0.32, grao: 0.005, gotas: 0.7, aberracao: 0,
               dof: 0.78, dofPerto: 32, dofLonge: 270,
               contraste: 0.3, saturacao: 1.14, veu: 0.04 },
    som: { chuva: 1, vento: 0.5, acorde: [130.81, 196, 246.94] },
  },

  {
    id: 'hyde',
    numero: 'segunda parte',
    titulo: 'A tarde caindo no parque',
    legenda: 'A chuva passou, e o dia resolveu ir embora devagar.',
    tipo: 'parque',
    semente: 20230917,
    comprimento: 850,
    velocidadeInicial: 12.5,
    velocidadeFinal: 16,
    cartas: [4, 5, 6, 7],

    /* "A chuva passou": nuvem alta e rala, com muito azul entre uma e outra.
       Cobertura baixa e escala fina fazem os flocos separados de tarde limpa —
       e são eles que, na hora azul, seguram o último laranja do horizonte. */
    paleta: {
      ceuAlto: '#8ec2e8', ceuHorizonte: '#ffe7bb', ceuBaixo: '#f7d9a8',
      corSol: '#fff0cc', dirSol: [0.62, 0.22, 0.75], tamanhoSol: 200,
      forcaSol: 2.4, neblinaCeu: 0.34,
      nuvens: 0.8, nuvemCobertura: 0.36, nuvemEscala: 0.8,
      corNuvemFina: '#fff4e4', corNuvemDensa: '#d3b8ad',
      nuvemVento: [0.012, 0.0035],
    },
    neblina: 0.0038,
    forcaHalo: 0,
    /* Sol do lado das árvores, não do lado do lago. Estava bem atrás da roda:
       o aço claro contra o clarão do sol não tinha silhueta nenhuma. Agora as
       folhas de outono ficam em contraluz (que é o que elas pedem) e a roda
       recebe o dourado de frente, com o céu limpo atrás. */
    dirLuz: [0.58, 0.44, 0.68],
    corSol: '#ffdfae', forcaLuzSol: 2.5,
    corCeuLuz: '#d2e6fa', corChaoLuz: '#b8a67c', forcaHemisferio: 1.25,
    corPoste: '#ffe2b4', forcaPoste: 4,
    sombra: 0.95,

    /* O dia cai enquanto ela corre. Começa nesta tarde dourada e termina na
       hora azul, que é quando a London Eye acende — o Daniel pediu a roda à
       noite, colorida, e o pôr do sol é o que dá isso sem perder as árvores de
       outono, que ficam lindas em contraluz. Interpolado por distância no
       `atualizar` de mundo.js. */
    /* O dia cai na primeira metade: na janela da roda (dist ≈ 418 de 850, ou
       seja 0.49) já é noite fechada, que é onde ela precisa estar acesa. A
       segunda metade corre no escuro e entrega a cena 3, que também é noite. */
    anoitece: { de: 0.03, ate: 0.5 },
    /* Hora azul, não pôr do sol.

       A primeira versão terminava num laranja enorme e depois num vermelho
       enorme, e o motivo é geometria do céu, não a cor escolhida: o degradê é
       `mix(horizonte, alto, smoothstep(0, 0.55, h))`, então a cor do HORIZONTE
       ainda vale 30% a dezesseis graus de elevação. Uma cor de pôr do sol ali
       pinta metade da tela — e como a saturação da cena é 1.24, o verde e o
       azul são esmagados e sobra lava. Quatrocentos metros correndo dentro de
       um campo laranja chapado é a mesma queixa que o Daniel já fez uma vez,
       só que noutra cor.

       O conserto tem duas metades, e eu só acertei a segunda na terceira
       tentativa. A primeira é escurecer o horizonte, quase até a cor do alto.
       A segunda é `forcaSol`, que eu tinha SUBIDO para 2.1 achando que ia
       concentrar o brilho — só que ela multiplica os dois termos do céu, e o
       segundo é `pow(cosA, 3)`, um lóbulo de quase quarenta graus de raio.
       Subir a força triplicou justamente o clarão largo que eu queria matar.
       Ela desce para 0.5: o disco do sol continua lá, baixo e à esquerda, e o
       céu volta a ser noite. É contra esse azul que a roda aparece. */
    paletaFim: {
      // roxo, não vermelho: no ângulo em que a faixa do horizonte cai (3° a
      // 17° de elevação) o vermelho puro dava fogo, e o que se quer é hora azul
      ceuAlto: '#080d26', ceuHorizonte: '#41263f', ceuBaixo: '#151129',
      corSol: '#ff8a4a', dirSol: [0.62, -0.015, 0.75], tamanhoSol: 260,
      forcaSol: 0.5, neblinaCeu: 0.14,
      /* A nuvem some quase toda no escuro. Nuvem clara sobre céu de hora azul
         vira mancha de leite: quem tem que aparecer aqui é a roda acesa. O
         pouco que fica é escuro, com o laranja do horizonte pegando de raspão
         na borda. */
      nuvens: 0.68, nuvemCobertura: 0.42, nuvemEscala: 0.8,
      corNuvemFina: '#3a2c45', corNuvemDensa: '#20182f',
      nuvemVento: [0.012, 0.0035],
    },
    neblinaFim: 0.0044,
    /* A neblina do mundo tem cor própria no fim. Antes ela seguia
       `ceuHorizonte`, e com o horizonte laranja tudo o que estava longe —
       árvores, água, a roda inteira — recebia banho de laranja. */
    corNeblinaFim: '#1c2246',
    corSolFim: '#ff8a55', forcaLuzSolFim: 0.3,
    corCeuLuzFim: '#33477e', corChaoLuzFim: '#2b2734', forcaHemisferioFim: 0.46,
    ambienteFim: 0.16,
    corAguaFim: '#12283c',
    forcaPosteFim: 26,

    // "A chuva passou": só o resto dela, um fiapo. A 0.12 os riscos brancos
    // atravessavam o céu do anoitecer inteiro e pareciam arranhão de lente.
    chuva: 0.04, corChuva: '#ffe4c0', vento: [-0.5, 0],
    molhado: 0.8, pedra: false,
    coresFolhagem: ['#b4671f', '#c98a2a', '#8c4f1c', '#6f7a2a', '#a8551a', '#d19a34'],
    corAgua: '#2f89a3',

    coresPredio: ['#7a6a58'],
    janelasAcesas: 0, lojas: false,

    pontos: [
      /* O coreto, logo na entrada. A cena abria com oitocentos metros de
         alameda reta até a roda-gigante, e mesmo com o parque cheio isso é
         muito tempo sem nada para onde olhar. Ele fica do lado das árvores
         (x positivo é a ESQUERDA da tela) e perto do caminho, a 14 m, para
         passar grande sem precisar de janela de câmera própria. */
      { tipo: 'coreto', x: 14, z: 118, escala: 1,
        nome: 'O coreto',
        legenda: 'Alguém tocava aqui nos domingos. Hoje é só o vento.',
        aviso: 55 },

      /* A London Eye em balanço sobre o lago, com o pé na margem de lá (a água
         vai de x=-58 a x=-11). Antes ela era menor e ficava a x=-40: a menina
         passava quase por baixo e a roda saía cortada pela quina de cima da
         tela. O enquadramento vem da mesma conta do Big Ben — no auge da janela
         (dist 418, a 76,6 m dela) o topo do aro fica 21° acima do eixo e a
         menina 30° abaixo, os dois dentro dos 35° de meia-abertura, com a roda
         ocupando dois terços da altura da tela.

         O `recuo` de 18 é o que devolve folga para ela: afastando a câmera, o
         ângulo dela abaixo do horizonte encolhe junto. */
      { tipo: 'roda', x: -60, z: 470, escala: 1.2,
        nome: 'London Eye',
        legenda: 'A roda parada no alto, como quem também não quer que acabe.',
        aviso: 145,
        olhada: { de: 330, ate: 440, fov: 70, recuo: 18, subida: 1.2,
                  mira: [-60, 36, 470], dofPerto: 130, dofLonge: 520 } },
    ],

    padroes: PADROES_PARQUE,
    camera: { exposicao: 0.9, bloom: 0.6, vinheta: 0.26, grao: 0.004, gotas: 0.14, aberracao: 0,
               dof: 0.82, dofPerto: 28, dofLonge: 150,
               contraste: 0.2, saturacao: 1.24, veu: 0.14, corAmbiente: [1.05, 1.0, 0.92] },
    som: { chuva: 0.18, vento: 0.75, acorde: [174.61, 261.63, 329.63] },
  },

  {
    id: 'agencia',
    numero: 'última parte',
    titulo: 'A rua da agência',
    legenda: 'É aqui. A luz acesa no fim da rua é para você.',
    tipo: 'rua',
    semente: 20260814,
    comprimento: 1000,
    velocidadeInicial: 13,
    velocidadeFinal: 16.5,
    cartas: [8, 9, 10],

    /* Noite de verdade, não fim de tarde. O horizonte lavanda claro que estava
       aqui antes era também a cor da neblina, e por isso a torre iluminada
       aparecia como um fantasma pálido: claro sobre claro. Céu fundo + neblina
       rala = o dourado do Big Ben tem contra o que brilhar. */
    paleta: {
      ceuAlto: '#0d1b3e', ceuHorizonte: '#3c3a63', ceuBaixo: '#211f40',
      corSol: '#ffd7a8', dirSol: [0.45, 0.3, -0.6], tamanhoSol: 220,
      forcaSol: 1.2, neblinaCeu: 0.55,
      /* Nuvem partida de noite de cidade: escura, mas com a barriga
         alaranjada, que é o brilho de Londres batendo nela por baixo. Sem isso
         o céu noturno fica um azul liso perfeito, que não existe em lugar
         nenhum onde haja luz de rua. */
      nuvens: 0.55, nuvemCobertura: 0.38, nuvemEscala: 0.62,
      corNuvemFina: '#212a4c', corNuvemDensa: '#463451',
      nuvemVento: [0.014, 0.004],

      /* A estrela do Liam. Só nesta cena, e sem uma palavra em lugar nenhum.

         A mira: a 11° de elevação e 6° para a esquerda do eixo da rua. O teto
         é o topo do quadro na tela deitada — a câmera mira 5° abaixo do
         horizonte com 54° de abertura vertical, então acima de 22° a estrela
         sai de cena. Comecei a 13° e o halo dela encostava na quina de cima;
         a 11° ela fica alta o bastante para estar no céu, inteira dentro do
         quadro, e na chegada aparece logo acima da porta da agência. */
      estrela: 1, dirEstrela: [0.10, 0.195, 0.95], corEstrela: '#eaf1ff',
    },
    neblina: 0.004,
    forcaHalo: 0.03,
    dirLuz: [0.4, 0.66, -0.5],
    corSol: '#b9c3ea', forcaLuzSol: 0.95,
    corCeuLuz: '#4a5c96', corChaoLuz: '#3e3442', forcaHemisferio: 0.88,
    corPoste: '#ffc070', forcaPoste: 24,
    sombra: 0.85,
    /* A luz que acompanha ela. Existe desde o começo em jogo.js e nunca tinha
       sido ligada em fase nenhuma. Agora que ela veste couro preto, é o que
       impede a protagonista de virar uma silhueta perdida na rua noturna. */
    // 5 era para ela de couro preto; com blusa e meias creme o trabalho pesado
    // já está feito pela própria roupa, e 5 deixava o cabelo alaranjado demais
    luzHeroi: 3,

    // garoa discreta: contra o céu agora fundo, a chuva clara virava risco
    chuva: 0.3, corChuva: '#8ea3c6', vento: [-0.9, 0],
    molhado: 0.85, pedra: true,

    coresPredio: ['#e8c8cd', '#c3dcd6', '#eedcc0', '#cfd2ea', '#e6c4b4'],
    janelasAcesas: 0.72, corJanela: '#ffd79a', forcaJanela: 2.8,
    lojas: true, coresLoja: ['#c02a3e', '#2f6a78', '#5a4180', '#b06a24'],
    coresPorta: ['#2f5a8c', '#1f6b52', '#8e2436', '#3c3160', '#1d1b22'],

    pontos: [
      /* O CORAÇÃO DA CENA. É o lugar preferido dela, então o Big Ben não é
         marco de passagem: a fileira de casas abre, os holofotes lavam a
         pedra, os quatro relógios acendem e os sinos tocam. A janela de
         `olhada` é calculada: a 76° de abertura uma torre de 100 m precisa de
         ~123 m de distância para caber, e entre z=120 e z=205 ela está a
         210–125 m. Cabe inteira o tempo todo. */
      /* O Palácio corre para o sul a partir da torre, como o de verdade. Bem
         afastado da rua: a 34 m ele entrava no quadro pelo canto direito como
         um paredão preto de 19 m quando ela passava ao lado. */
      { tipo: 'parlamento', x: -52, z: 450, rot: Math.PI / 2, escala: 0.72, noturno: true },

      /* A clareira é do Big Ben, não do Parlamento: precisa começar ANTES da
         janela da olhada, senão a última casa da fileira tapa a torre bem na
         hora de olhar. De z=100 a z=560, com o Parlamento inteiro dentro. */
      { tipo: 'bigben', x: -34, z: 330, escala: 0.92, noturno: true, badalada: true,
        claro: 460, lado: -1, piso: 'praca', larguraPiso: 56, rio: true,
        nome: 'Big Ben',
        legenda: 'O lugar preferido dela, aceso só para ela passar.',
        aviso: 210,
        /* Enquadramento medido, não chutado. A câmera fica a 4,05 m do chão e
           20,6 m atrás dela, mirando a 38 m de altura na torre. No auge da
           janela (dist ≈ 216) a torre ocupa 37° dos 70° de abertura — mais da
           metade da tela — com o topo 21° acima do eixo e a menina 23° abaixo:
           os dois dentro dos 35° de meia-abertura, do começo ao fim.
           Mirar mais alto encheria mais o quadro, mas jogaria ela para fora —
           e ela continua correndo, então continua na tela.
           O desfoque de fundo também abre: com dofLonge de 120 m a torre
           virava mancha justamente aqui. */
        olhada: { de: 118, ate: 240, fov: 70, recuo: 14, subida: 1.2,
                  mira: [-30, 38, 330], dofPerto: 170, dofLonge: 620 } },

      { tipo: 'ponte', x: 0, z: 620, escala: 1, claro: 176, lado: 0, piso: 'agua',
        // a travessia é um momento, não um teste: nada de obstáculo em cima da ponte
        limpo: 62,
        nome: 'Tower Bridge',
        legenda: 'Do outro lado do rio já dá para ver a agência.', aviso: 110 },

      // os dois últimos da linha 1D, já depois da ponte (que ocupa 532 a 708)
      { tipo: 'onibus', x: -4.2, z: 748, rot: Math.PI, destino: 'MULLINGAR' },
      { tipo: 'onibus', x: 4.2, z: 892, destino: 'WOLVERHAMPTON' },

      /* A loja de discos, na reta final. Encostada na fileira de casas
         (a fachada fica em x = 9) e virada para a rua: `x = 8.4` deixa a
         vitrine 60 cm à frente da parede, sem furar o quarteirão. x positivo é
         a ESQUERDA da tela. */
      { tipo: 'discos', x: 8.4, z: 806, rot: -Math.PI / 2 },
    ],
    corRio: '#2c6b80',

    padroes: PADROES_NOITE,
    camera: { exposicao: 1.05, bloom: 0.85, vinheta: 0.38, grao: 0.005, gotas: 0.42, aberracao: 0,
               dof: 0.85, dofPerto: 22, dofLonge: 120,
               contraste: 0.3, saturacao: 1.18, veu: 0.16, corAmbiente: [0.98, 0.99, 1.06] },
    /* A harmonia anda nesta cena, em vez de ficar num acorde só: I–V–vi–IV em
       Lá. O primeiro acorde é exatamente o que a cena já tocava (Lá2·Mi3·Lá3),
       então ela não muda de identidade — só passa a caminhar.

       Vale dizer o que isto é e o que não é: progressão de acordes não é de
       ninguém, é a mais comum do pop inteiro. Ela evoca. Melodia, não —
       melodia é a música, e a música de verdade entra pelo arquivo em
       `musica/`, que é do Daniel. */
    som: { chuva: 0.6, vento: 0.4, compasso: 6.5,
           progressao: [
             [110.00, 164.81, 220.00],   // I   — Lá
             [82.41, 123.47, 164.81],    // V   — Mi
             [92.50, 138.59, 185.00],    // vi  — Fá#m
             [73.42, 110.00, 146.83],    // IV  — Ré
           ] },
  },
];

/* ── geração do trajeto ─────────────────────────────────────────────────── */

const LARGURA_FAIXA = 2;
const MARGEM_SEGURANCA = 1.6;

/** Meia-profundidade aproximada de cada tipo, para o validador de espaço. */
const MEIA_PROF = {
  cone: 0.24, caixote: 0.36, lixeira: 0.29, banco: 0.26, bancoVermelho: 0.26,
  galho: 0.35, barreiraAlta: 0.22, pedestre: 0.34, cachorro: 0.42, onibus: 5.3,
  bicicleta: 0.62, portao: 0.2, poca: 0.9, folhas: 0.6, envelope: 0.5,
};

/**
 * Monta a lista de obstáculos da fase e depois encaixa os envelopes em
 * faixas comprovadamente livres.
 */
export function gerarTrajeto(fase) {
  const r = sorteio(fase.semente);
  const itens = [];
  const inicioCalmo = 55;
  const fimCalmo = fase.id === 'agencia' ? 110 : 60;
  const fim = fase.comprimento - fimCalmo;

  let z = inicioCalmo;
  while (z < fim) {
    const padrao = fase.padroes[Math.floor(r() * fase.padroes.length)];
    for (const it of padrao.itens) {
      itens.push({ tipo: it.t, faixa: it.f, z: z + it.dz });
    }
    // a folga entre padrões encolhe conforme ela avança: a fase esquenta
    const progresso = limita((z - inicioCalmo) / (fim - inicioCalmo), 0, 1);
    const folga = mistura(r.entre(16, 22), r.entre(8, 13), progresso);
    z += padrao.comp + folga;
  }

  // Trechos que são momento, não desafio: a travessia da ponte fica sem
  // obstáculo. Filtrar aqui em vez de na hora de instanciar mantém o
  // validador vendo o trajeto de verdade.
  const limpos = [];
  for (const p of (fase.pontos || [])) {
    if (p.limpo) limpos.push({ de: p.z - p.limpo / 2, ate: p.z + p.limpo / 2 });
    // se a câmera está virada para o marco, nada pode estar no caminho —
    // isso é justiça com quem joga, não enfeite
    if (p.olhada) limpos.push({ de: p.olhada.de - 12, ate: p.olhada.ate + 22 });
  }
  const filtrado = itens.filter((it) => {
    if (COMO_PASSAR[it.tipo] === 'livre') return true;
    return !limpos.some((c) => it.z > c.de && it.z < c.ate);
  });

  encaixarEnvelopes(fase, filtrado, r);
  return filtrado;
}

function ocupacao(itens, z, faixa) {
  for (const it of itens) {
    if (it.faixa !== faixa) continue;
    if (COMO_PASSAR[it.tipo] === 'livre') continue;
    const mp = (MEIA_PROF[it.tipo] || 0.5) + MARGEM_SEGURANCA;
    if (z > it.z - mp && z < it.z + mp) return true;
  }
  return false;
}

function encaixarEnvelopes(fase, itens, r) {
  const quantos = fase.cartas.length;
  const inicio = fase.comprimento * 0.16;
  const fim = fase.comprimento * 0.9;

  fase.cartas.forEach((indiceCarta, i) => {
    const alvo = mistura(inicio, fim, quantos === 1 ? 0.5 : i / (quantos - 1));
    // procura um lugar de verdade livre perto do alvo, andando para os lados
    for (let tentativa = 0; tentativa < 90; tentativa++) {
      const z = alvo + (tentativa % 2 === 0 ? 1 : -1) * Math.floor(tentativa / 2) * 2.5;
      if (z < 20 || z > fase.comprimento - 30) continue;
      const livres = [0, 1, 2].filter((f) => !ocupacao(itens, z, f));
      if (livres.length) {
        const faixa = livres[Math.floor(r() * livres.length)];
        itens.push({ tipo: 'envelope', faixa, z, carta: indiceCarta });
        return;
      }
    }
    // último recurso: joga num trecho calmo, nunca deixa de existir
    itens.push({ tipo: 'envelope', faixa: 1, z: Math.min(alvo, fase.comprimento - 40), carta: indiceCarta });
  });
}

/**
 * Confere a promessa central: em qualquer ponto do trajeto tem que sobrar ao
 * menos uma faixa completamente livre. Se algum padrão novo quebrar isso,
 * aparece no console em vez de virar uma parede intransponível no presente.
 */
export function validarTrajeto(fase, itens) {
  const problemas = [];
  for (let z = 0; z < fase.comprimento; z += 0.5) {
    let livres = 0;
    for (let f = 0; f < 3; f++) if (!ocupacao(itens, z, f)) livres++;
    if (livres === 0) problemas.push(z);
  }
  if (problemas.length) {
    const de = problemas[0];
    const ate = problemas[problemas.length - 1];
    return [`fase "${fase.id}": trecho sem saída entre ${de.toFixed(1)} m e ${ate.toFixed(1)} m`];
  }
  return [];
}

/* Faixa 0 é a da ESQUERDA de quem joga, 2 é a da direita.
   Repare no sinal invertido: a câmera olha ao longo de +z, e num sistema destro
   isso põe o +x do mundo à ESQUERDA da tela. Enquanto isso aqui era
   `(faixa - 1)`, apertar seta esquerda diminuía a faixa, diminuía o x e mandava
   ela para a direita da tela — o contrário do que qualquer um espera. Corrigir
   aqui conserta teclado e toque de uma vez só, porque os dois passam por
   `trocarFaixa`. */
export function posicaoDaFaixa(faixa) {
  return (1 - faixa) * LARGURA_FAIXA;
}
