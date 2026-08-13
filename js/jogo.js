/* ═══════════════ o jogo ═══════════════
   Máquina de estados, laço de passo fixo, colisão, corações, checkpoints e a
   cutscene que entrega a menina na porta da agência.

   Regra que atravessa o arquivo inteiro: nunca deixar a jogadora presa. Todo
   caminho de erro leva de volta a correr, e existe sempre uma saída direta
   para as cartas.
   ═══════════════════════════════════════ */

import { WebGLRenderer, Scene, PerspectiveCamera, Vector3, PCFShadowMap, Box3,
         SRGBColorSpace, NoToneMapping, Group, PointLight, Color } from 'three';
import { $, limita, mistura, amortece, suaveEntre, sorteio, qualidadeAutomatica, PRESETS,
         ESCADA_QUALIDADE, ehTatil, menosMovimento, memoria } from './util.js';
import * as Som from './audio.js';
import { criarPos } from './pos.js';
import { criarMenina } from './personagem.js';
import { criarObstaculo, COMO_PASSAR } from './obstaculos.js';
import { criarMundo, criarAgencia } from './mundo.js';
import { FASES, CARTAS, gerarTrajeto, validarTrajeto, posicaoDaFaixa,
         listaDeMonumentos } from './fases.js';

/* 60 Hz de lógica com teto de 8 passos por quadro tolera queda até ~7 fps
   antes de entrar em câmera lenta. A 120 Hz o teto batia já abaixo de 15 fps,
   e num computador mais fraco o jogo simplesmente arrastava. */
const PASSO = 1 / 60;
const GRAVIDADE = -34;
const IMPULSO_PULO = 8.6;
const ALTURA_EM_PE = 1.72;
const ALTURA_AGACHADA = 0.92;
const MEIA_LARGURA = 0.32;
const MEIA_PROFUNDIDADE = 0.3;
const CORACOES_CHEIOS = 3;
const INVULNERAVEL = 1.25;
const DESTINO_CARTAS = 'correio-dos-apaixonados-v2.html';
/* O `fov` do three é VERTICAL, então a abertura horizontal muda com o formato
   da tela. Num 16:9 deitado dá ±42°; num celular em pé dá ±13° — e todo o
   cenário dos lados (o bosque do parque, os prédios da rua) sai do quadro. Era
   por isso que o parque parecia vazio no celular do Daniel e cheio no meu
   monitor.

   Aqui a conta é invertida: escolhe-se a abertura HORIZONTAL e deriva-se a
   vertical dela. Assim as duas visões mostram a mesma largura de mundo, e o
   retrato ganha altura em vez de perder os lados. Todos os `fov` do jogo estão
   escritos como "o que eu quero numa tela deitada" e passam por aqui. */
const FOV_BASE = 54;
const PROPORCAO_REF = 16 / 9;

/* A música que toca a corrida inteira. Basta salvar o arquivo com este nome
   dentro de `musica/` — nada mais precisa ser mexido, e se o arquivo não
   estiver lá o jogo roda exatamente como sempre rodou, com o som sintetizado.
   Ver o LEIA-ME. */
const MUSICA_DE_FUNDO = 'musica/perfect.mp3';

function fovVertical(fovDeitado, aspecto) {
  const meiaH = Math.atan(Math.tan((fovDeitado * Math.PI / 360)) * PROPORCAO_REF);
  const v = 2 * Math.atan(Math.tan(meiaH) / Math.max(aspecto, 0.42)) * 180 / Math.PI;
  /* Teto de 86°. Sem teto, um celular em pé pediria 126° para igualar a largura
     do monitor — vira olho de peixe, e o excesso de altura vira chão vazio com
     a menina minúscula no meio. A 86° a abertura horizontal ainda quase dobra
     em relação ao que era, e o resto se resolve subindo a mira (ver
     `atualizarCamera`), que empurra o chão para fora do quadro. */
  return limita(v, fovDeitado, 86);
}

const SVG_CORACAO = `<svg class="cor" viewBox="0 0 32 30" xmlns="http://www.w3.org/2000/svg">
<path d="M16 29S2.2 20.3 2.2 11.2C2.2 6.3 6 2.6 10.6 2.6c3 0 5 1.7 5.4 2.6.4-.9 2.4-2.6 5.4-2.6
4.6 0 8.4 3.7 8.4 8.6C29.8 20.3 16 29 16 29z" fill="#c8203a" stroke="#f8eeda" stroke-width="1.6"/></svg>`;

export function iniciar() {
  /* ─────────── DOM ─────────── */
  const tela = $('#tela');
  const elCarregando = $('#carregando');
  const elBarra = $('#barra i');
  const elCargaTxt = $('#carga-txt');
  const elIntro = $('#intro');
  const elHud = $('#hud');
  const elCoracoes = $('#coracoes');
  const elBolsa = $('#bolsa .n');
  const elAchados = $('#achados');
  const elTituloFase = $('#titulo-fase');
  const elRecado = $('#recado');
  const elPausa = $('#pausa');
  const elLegenda = $('#legenda');
  const elFade = $('#fade');
  const elEscapar = $('#escapar');
  const elFps = $('#fps');
  const elTrilhaBarra = $('#trilha .barra i');
  const elTrilhaPct = $('#trilha .pct');

  if (ehTatil()) document.body.classList.add('tatil');
  if (location.hash === '#debug') document.body.classList.add('debug');

  /* `?sem=sombra,chuva` desliga subsistemas inteiros, um de cada vez.

     Existe por um motivo específico: a Isadora vê retângulos pretos na tela e eu
     não consigo reproduzir em máquina nenhuma minha — varri as cenas 1 e 3
     inteiras, em pé e deitado, com a qualidade travada em baixo e em médio, e
     não apareceu uma vez sequer. A máquina dela é a única que reproduz, então
     quem precisa conseguir bissectar é ela, e não eu. Com isto ela abre quatro
     endereços e diz em qual a tela limpa.

     Sem o parâmetro nada muda — mesmo espírito do `?fase=` e do `?dist=`. */
  const SEM = new Set(
    (new URLSearchParams(location.search).get('sem') || '')
      .split(',').map((s) => s.trim()).filter(Boolean));
  if (SEM.size) console.info('[5anos] diagnóstico — desligado:', [...SEM].join(', '));

  /* ─────────── renderizador ─────────── */
  let qualidade = memoria.ler('qualidade', qualidadeAutomatica());
  if (!PRESETS[qualidade]) qualidade = 'medio';
  let preset = PRESETS[qualidade];

  let renderer;
  try {
    /* `antialias` aqui é inútil de propósito, e vale saber por quê: a cena
       inteira é desenhada dentro do alvo do `pos.js`, e para este framebuffer
       só vai o quadrado do passe final. O antialiasing de verdade está lá, no
       MSAA do alvo (`preset.amostras`). */
    renderer = new WebGLRenderer({ canvas: tela, antialias: false, powerPreference: 'high-performance' });
  } catch (e) {
    semWebGL();
    return;
  }
  if (!renderer.getContext()) { semWebGL(); return; }

  renderer.setPixelRatio(Math.min(devicePixelRatio, preset.pixelRatio));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NoToneMapping;
  renderer.shadowMap.enabled = !SEM.has('sombra');
  /* PCF, e há um caminho fechado atrás desta linha que vale registrar.

     Para amaciar a borda o óbvio seria `PCFSoftShadowMap` — mas ele foi
     DESCONTINUADO no three r185: aceita o valor, imprime aviso no console e
     desenha PCF comum. O substituto seria o VSM, e eu cheguei a trocar: as
     capturas voltaram sem sombra NENHUMA — nem a menina, nem árvore, nem poste
     marcavam o chão. Sombra que existe vale mais que penumbra que some.

     Então a qualidade vem de onde dá para medir: frustum apertado em volta
     dela (`preset.sombraExt`), que multiplica os texels por metro, e a
     densidade certa por fase (`fase.sombra`). */
  renderer.shadowMap.type = PCFShadowMap;

  const cena = new Scene();
  const camera = new PerspectiveCamera(
    fovVertical(FOV_BASE, innerWidth / innerHeight), innerWidth / innerHeight, 0.25, 600);
  const pos = criarPos(renderer, cena, camera,
    { niveis: preset.bloomNiveis, amostras: preset.amostras });

  function semWebGL() {
    elCarregando.hidden = true;
    mostrarRecado(
      'Seu navegador não abriu o 3D',
      'Sem problema nenhum — as cartas não dependem do jogo. Elas estão logo ali.',
      [{ txt: 'ir para as cartas ♥', forte: true, acao: () => irParaCartas() }]
    );
  }

  /* ─────────── estado ─────────── */
  const estado = {
    modo: 'carregando',   // carregando | intro | correndo | caindo | pausado | trocando | final
    faseIndice: 0,
    dist: 0,
    velocidade: 0,
    faixa: 1,
    x: 0,
    y: 0,
    vy: 0,
    noChao: true,
    agachado: false,
    coracoes: CORACOES_CHEIOS,
    invuln: 0,
    tropeco: 0,
    checkpoint: 0,
    mortesNoCheckpoint: 0,
    piedade: 0,          // 0 normal, 1 modo mais leve
    envelopes: new Set(),
    tempoModo: 0,
    tremor: 0,
    flash: 0,
  };

  let fase = null;
  let mundo = null;
  let trajeto = [];
  let ativos = [];
  let proximoItem = 0;
  let agencia = null;
  const menina = criarMenina();
  cena.add(menina.raiz);
  menina.aoPassar = () => { if (estado.modo === 'correndo' || estado.modo === 'final') Som.passo(); };

  const respingos = criarRespingos();

  // Luz de apoio que acompanha a menina. Sem ela, na cena de noite a
  // protagonista virava uma silhueta preta no meio da rua bonita.
  const luzHeroi = new PointLight(new Color('#ffd9ae'), 0, 12, 2);
  luzHeroi.visible = false;
  cena.add(luzHeroi);

  /* ─────────── HUD ─────────── */
  function desenharCoracoes() {
    elCoracoes.innerHTML = SVG_CORACAO.repeat(CORACOES_CHEIOS);
    atualizarCoracoes();
  }
  function atualizarCoracoes(bateu = -1) {
    [...elCoracoes.children].forEach((c, i) => {
      c.classList.toggle('off', i >= estado.coracoes);
      if (i === bateu) {
        c.classList.remove('bate');
        void c.offsetWidth;
        c.classList.add('bate');
      }
    });
  }
  const TRAJETO_TOTAL = FASES.reduce((soma, f) => soma + f.comprimento, 0);
  const ANTES_DA_FASE = FASES.map((_, i) =>
    FASES.slice(0, i).reduce((soma, f) => soma + f.comprimento, 0));

  let pctMostrado = -1;
  function atualizarTrilha() {
    if (!fase) return;
    const andado = ANTES_DA_FASE[estado.faseIndice] + limita(estado.dist, 0, fase.comprimento);
    const pct = Math.round((andado / TRAJETO_TOTAL) * 100);
    if (pct === pctMostrado) return;
    pctMostrado = pct;
    elTrilhaBarra.style.width = pct + '%';
    elTrilhaPct.textContent = pct + '%';
  }

  function atualizarBolsa() {
    elBolsa.innerHTML = `${estado.envelopes.size}<span style="opacity:.4">/${CARTAS.length}</span>`;
  }
  function mostrarAchado(texto) {
    const d = document.createElement('div');
    d.className = 'achado';
    d.textContent = '✉ ' + texto;
    elAchados.appendChild(d);
    setTimeout(() => d.remove(), 2600);
  }
  function mostrarCartela(f) {
    elTituloFase.querySelector('.n').textContent = f.numero;
    elTituloFase.querySelector('.t').textContent = f.titulo;
    elTituloFase.classList.remove('mostra');
    void elTituloFase.offsetWidth;
    elTituloFase.classList.add('mostra');
  }

  function mostrarRecado(titulo, texto, botoes) {
    elRecado.querySelector('h3').textContent = titulo;
    elRecado.querySelector('p').textContent = texto;
    const acoes = elRecado.querySelector('.acoes');
    acoes.innerHTML = '';
    for (const b of botoes) {
      const el = document.createElement('button');
      el.className = 'mini' + (b.forte ? ' forte' : '');
      el.textContent = b.txt;
      el.onclick = () => { esconderRecado(); b.acao(); };
      acoes.appendChild(el);
    }
    elRecado.classList.add('on');
  }
  function esconderRecado() {
    elRecado.classList.remove('on');
  }

  /* ─────────── entrada ─────────── */
  const teclas = {};
  addEventListener('keydown', (e) => {
    if (e.repeat) return;
    teclas[e.code] = true;
    /* Na visita, as mesmas setas trocam de monumento em vez de trocar de faixa,
       e o Esc devolve a abertura em vez de abrir a pausa. Sai antes de tudo. */
    if (estado.modo === 'monumentos') {
      if (['ArrowLeft', 'KeyA'].includes(e.code)) irParaMonumento(monAtual - 1);
      if (['ArrowRight', 'KeyD'].includes(e.code)) irParaMonumento(monAtual + 1);
      if (e.code === 'Escape') fecharMonumentos(() => { elIntro.hidden = false; });
      return;
    }
    if (['ArrowLeft', 'KeyA'].includes(e.code)) trocarFaixa(-1);
    if (['ArrowRight', 'KeyD'].includes(e.code)) trocarFaixa(1);
    if (['Space', 'ArrowUp', 'KeyW'].includes(e.code)) { pular(); e.preventDefault(); }
    if (['Escape', 'KeyP'].includes(e.code)) alternarPausa();
  });
  addEventListener('keyup', (e) => { teclas[e.code] = false; });

  // toque: arrastar nas quatro direções, tocar para pular
  let toqueX = 0, toqueY = 0, toqueT = 0, toqueAtivo = false;
  const areaToque = $('#toque');
  areaToque.addEventListener('pointerdown', (e) => {
    toqueX = e.clientX; toqueY = e.clientY; toqueT = performance.now(); toqueAtivo = true;
  });
  areaToque.addEventListener('pointermove', (e) => {
    if (!toqueAtivo) return;
    const dx = e.clientX - toqueX;
    const dy = e.clientY - toqueY;
    if (Math.abs(dx) > 42 && Math.abs(dx) > Math.abs(dy)) {
      trocarFaixa(Math.sign(dx));
      toqueAtivo = false;
    } else if (dy < -42) {
      pular();
      toqueAtivo = false;
    } else if (dy > 42) {
      agacharToque();
      toqueAtivo = false;
    }
  });
  areaToque.addEventListener('pointerup', () => {
    if (toqueAtivo && performance.now() - toqueT < 260) pular();
    toqueAtivo = false;
  });
  areaToque.addEventListener('pointercancel', () => { toqueAtivo = false; });

  let agacharAte = 0;
  function agacharToque() { agacharAte = performance.now() + 700; }

  function trocarFaixa(d) {
    if (estado.modo !== 'correndo' && estado.modo !== 'final') return;
    estado.faixa = limita(estado.faixa + d, 0, 2);
  }
  function pular() {
    if (estado.modo !== 'correndo' && estado.modo !== 'final') return;
    if (!estado.noChao) return;
    estado.vy = IMPULSO_PULO;
    estado.noChao = false;
    Som.pulo();
  }

  function lerGamepad() {
    const gps = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const gp of gps) {
      if (!gp) continue;
      const b = gp.buttons;
      if (b[14] && b[14].pressed && !gpAnterior.esq) trocarFaixa(-1);
      if (b[15] && b[15].pressed && !gpAnterior.dir) trocarFaixa(1);
      if (b[0] && b[0].pressed && !gpAnterior.a) pular();
      gpAnterior.esq = b[14] && b[14].pressed;
      gpAnterior.dir = b[15] && b[15].pressed;
      gpAnterior.a = b[0] && b[0].pressed;
      gpAnterior.baixo = b[13] && b[13].pressed;
      return;
    }
  }
  const gpAnterior = { esq: false, dir: false, a: false, baixo: false };

  /* ─────────── respingos ─────────── */
  /* A poça dá retorno por som e por uma freada leve. Cheguei a acumular
     partículas aqui, mas nunca eram desenhadas — melhor não fingir. */
  function criarRespingos() {
    return {
      soltar() { Som.respingo(); },
    };
  }

  /* ─────────── montagem de fase ─────────── */

  function limparAtivos() {
    for (const o of ativos) mundo.grupo.remove(o.grupo);
    ativos = [];
  }

  function descarregarFase() {
    limparAtivos();
    if (agencia) { cena.remove(agencia.grupo); agencia = null; }
    if (mundo) { mundo.dispose(); mundo = null; }
  }

  async function carregarFase(indice) {
    descarregarFase();
    fase = FASES[indice];
    estado.faseIndice = indice;

    await respirar('desenhando ' + fase.titulo.toLowerCase() + '…', 0.1);
    mundo = criarMundo(cena, renderer, fase, preset);

    await respirar('espalhando obstáculos…', 0.6);
    trajeto = gerarTrajeto(fase);
    const problemas = validarTrajeto(fase, trajeto);
    if (problemas.length) console.warn('[fases]', ...problemas);
    trajeto.sort((a, b) => a.z - b.z);
    proximoItem = 0;

    if (fase.id === 'agencia') {
      agencia = criarAgencia();
      agencia.grupo.position.set(0, 0, fase.comprimento + 4);
      cena.add(agencia.grupo);
    }

    const c = fase.camera;
    const u = pos.uniforms;
    u.exposicao.value = c.exposicao;
    u.forcaBloom.value = c.bloom;
    u.vinheta.value = c.vinheta;
    u.grao.value = menosMovimento() ? c.grao * 0.4 : c.grao;
    u.gotas.value = preset.gotas ? c.gotas : 0;
    u.aberracao.value = c.aberracao;
    // desfoque de fundo: some no preset baixo, onde cada passe conta — e junto
    // com ele some o blit de resolução da profundidade do MSAA
    u.forcaDof.value = preset.dof ? (c.dof ?? 0.85) : 0;
    u.dofPerto.value = c.dofPerto ?? 14;
    u.dofLonge.value = c.dofLonge ?? 66;
    u.contraste.value = c.contraste ?? 0.22;
    u.saturacao.value = c.saturacao ?? 1.18;
    u.veu.value = c.veu ?? 0.12;
    if (c.corAmbiente) u.corAmbiente.value = c.corAmbiente;

    luzHeroi.intensity = fase.luzHeroi || 0;
    luzHeroi.visible = !!fase.luzHeroi;

    Som.ambiente(fase.som);
    aplicarDiagnostico();
    await respirar('acendendo os postes…', 0.9);
  }

  /* `?sem=texturas` é a chave que vale mais que todas as outras juntas: tira o
     mapa de cor, o de normal, o de aspereza e o emissivo de TODO material da
     cena e põe um cinza liso no lugar. Se o retângulo preto sumir, o defeito é
     de TEXTURA (canvas que não desenhou, mipmap, espaço de cor). Se ficar, é de
     GEOMETRIA ou de luz. É a divisão que a bissecção ainda não fez.

     Roda de novo a cada tanto porque obstáculo nasce no meio da corrida: material
     que ainda não existia quando a cena montou também tem que ser despido. O
     conjunto de já-vistos deixa a repetição barata. */
  const despidos = new Set();
  function despirTexturas() {
    if (!SEM.has('texturas')) return;
    cena.traverse((o) => {
      if (!o.isMesh) return;
      for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
        if (!m || despidos.has(m.uuid)) continue;
        despidos.add(m.uuid);
        for (const k of ['map', 'normalMap', 'roughnessMap', 'emissiveMap', 'metalnessMap', 'aoMap']) {
          if (m[k]) m[k] = null;
        }
        if (m.color) m.color.setHex(0x9a9a9a);
        if (m.emissive) m.emissive.setHex(0x000000);
        m.needsUpdate = true;
      }
    });
  }

  /* Aplica o `?sem=` no mundo recém-montado. Vai no fim de cada `carregarFase`
     porque o `mundo` é desmontado e refeito a cada troca de cena. */
  function aplicarDiagnostico() {
    if (!SEM.size || !mundo) return;
    if (SEM.has('chuva') && mundo.chuva) mundo.chuva.objeto.visible = false;
    if (SEM.has('predios')) {
      for (const b of mundo.blocos) b.grupo.visible = false;
    }
    if (SEM.has('ceu') && mundo.ceu) mundo.ceu.malha.visible = false;
    if (SEM.has('chao') && mundo.chao) mundo.chao.visible = false;
    if (SEM.has('pontos') && mundo.pontosGrupo) mundo.pontosGrupo.visible = false;
    if (SEM.has('marcos') && mundo.marcos) mundo.marcos.visible = false;
    if (SEM.has('menina')) menina.raiz.visible = false;

    /* `?sem=tudo` esconde TODO objeto da cena — sobra o céu de fundo e mais nada.
       É o teste que decide a pergunta que a bissecção não conseguiu responder:
       ela já apagou o chão, os prédios, os obstáculos, os marcos, os pontos, a
       chuva, a sombra e o pós-processamento inteiro, um por um, e o retângulo
       preto sobreviveu a todos. Ou tem alguma coisa que eu não estou alcançando,
       ou o preto não é geometria — é a GPU dela devolvendo lixo. Com a cena
       vazia, se o preto continuar, está provado que não é objeto nenhum. */
    if (SEM.has('tudo')) {
      for (const o of cena.children) {
        if (o.isLight || o === mundo.ceu?.malha) continue;
        o.visible = false;
      }
      menina.raiz.visible = false;
    }

    if (SEM.has('via') || SEM.has('calcada') || SEM.has('agua')) {
      cena.traverse((o) => {
        if (SEM.has(o.name)) o.visible = false;
      });
    }
    despirTexturas();
    const u = pos.uniforms;
    if (SEM.has('dof')) u.forcaDof.value = 0;
    if (SEM.has('bloom')) u.forcaBloom.value = 0;
    if (SEM.has('gotas')) u.gotas.value = 0;
    if (SEM.has('grao')) u.grao.value = 0;
    if (SEM.has('vinheta')) u.vinheta.value = 0;
  }

  /** Cede o controle para o navegador desenhar a barra de carregamento. */
  function respirar(texto, progresso) {
    if (texto) elCargaTxt.textContent = texto;
    if (progresso != null) elBarra.style.width = Math.round(progresso * 100) + '%';
    return new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
  }

  function reiniciarPosicao(dist) {
    estado.dist = dist;
    estado.faixa = 1;
    estado.x = 0;
    estado.y = 0;
    estado.vy = 0;
    estado.noChao = true;
    estado.agachado = false;
    estado.tropeco = 0;
    estado.invuln = 1;
    estado.velocidade = velocidadeDaFase(dist) * 0.6;
    limparAtivos();
    proximoItem = 0;
    while (proximoItem < trajeto.length && trajeto[proximoItem].z < dist - 10) proximoItem++;
    for (const it of trajeto) it.usado = false;
  }

  function velocidadeDaFase(dist) {
    const t = limita(dist / fase.comprimento, 0, 1);
    const base = mistura(fase.velocidadeInicial, fase.velocidadeFinal, t);
    return base * (estado.piedade ? 0.78 : 1);
  }

  /* ─────────── obstáculos ativos ─────────── */

  function alimentarObstaculos() {
    if (SEM.has('obstaculos')) return;
    const limite = estado.dist + preset.distancia * 0.72;
    while (proximoItem < trajeto.length && trajeto[proximoItem].z < limite) {
      const it = trajeto[proximoItem++];
      if (it.usado) continue;
      if (estado.piedade && it.tipo !== 'envelope' && COMO_PASSAR[it.tipo] !== 'livre' && (proximoItem % 4 === 0)) {
        continue; // no modo leve, alguns obstáculos simplesmente não aparecem
      }
      const o = criarObstaculo(it.tipo, {
        x: posicaoDaFaixa(it.faixa),
        z: it.z,
        r: sorteio((it.z * 977) | 0),
        carta: it.carta,
      });
      o.origem = it;
      mundo.grupo.add(o.grupo);
      ativos.push(o);
    }

    for (let i = ativos.length - 1; i >= 0; i--) {
      if (ativos[i].z < estado.dist - 22) {
        mundo.grupo.remove(ativos[i].grupo);
        ativos.splice(i, 1);
      }
    }
  }

  function testarColisoes() {
    const alturaAtual = estado.agachado ? ALTURA_AGACHADA : ALTURA_EM_PE;
    const pe = estado.y;
    const topo = estado.y + alturaAtual;

    for (const o of ativos) {
      if (o.usado) continue;
      const dz = o.z - estado.dist;
      if (Math.abs(dz) > o.mp + MEIA_PROFUNDIDADE) continue;
      if (Math.abs(o.x - estado.x) > o.ml + MEIA_LARGURA) continue;
      const y1 = o.alturaDinamica ? o.y1Atual : o.y1;
      if (y1 <= 0.02) continue;
      if (topo <= o.y0 || pe >= y1) continue;

      o.usado = true;
      if (o.origem) o.origem.usado = true;

      if (o.coletavel) {
        pegarEnvelope(o);
      } else if (o.inofensivo) {
        respingos.soltar(o.x, o.z);
        estado.velocidade *= 0.9;
      } else {
        levarPancada();
      }
    }
  }

  function pegarEnvelope(o) {
    estado.envelopes.add(o.dados.carta);
    atualizarBolsa();
    mostrarAchado(CARTAS[o.dados.carta] || '');
    Som.sino();
    mundo.grupo.remove(o.grupo);
    const i = ativos.indexOf(o);
    if (i >= 0) ativos.splice(i, 1);
  }

  function levarPancada() {
    if (estado.invuln > 0) return;
    estado.coracoes--;
    estado.invuln = INVULNERAVEL;
    estado.tropeco = 0.75;
    estado.velocidade *= 0.62;
    estado.tremor = 1;
    estado.flash = 1;
    Som.baque();
    atualizarCoracoes(estado.coracoes);

    if (estado.coracoes <= 0) cair();
  }

  function cair() {
    estado.modo = 'caindo';
    estado.tempoModo = 0;
    Som.tombo();
  }

  function voltarAoCheckpoint() {
    estado.mortesNoCheckpoint++;
    estado.coracoes = CORACOES_CHEIOS;
    atualizarCoracoes();
    reiniciarPosicao(estado.checkpoint);
    estado.modo = 'correndo';

    if (estado.mortesNoCheckpoint >= 2 && !estado.piedade) {
      mostrarRecado(
        'Quer que eu segure a mão?',
        'Posso deixar essa parte mais tranquila: um pouco mais devagar e com menos coisa no caminho. As cartas são as mesmas de qualquer jeito.',
        [
          { txt: 'pode deixar mais leve', forte: true, acao: () => { estado.piedade = 1; } },
          { txt: 'quero tentar de novo', acao: () => {} },
          { txt: 'ir direto para as cartas ♥', acao: () => irParaCartas() },
        ]
      );
    }
  }

  function checarCheckpoint() {
    const trecho = fase.comprimento / 3;
    const marca = Math.floor(estado.dist / trecho) * trecho;
    if (marca > estado.checkpoint && marca < fase.comprimento) {
      estado.checkpoint = marca;
      estado.mortesNoCheckpoint = 0;
      Som.marco();
    }
  }

  /* ─────────── troca de fase e final ─────────── */

  let trocando = false;
  async function proximaFase() {
    if (trocando) return;
    trocando = true;
    estado.modo = 'trocando';

    elFade.style.transitionDuration = '.7s';
    elFade.classList.add('on');
    await esperar(760);

    const seguinte = estado.faseIndice + 1;
    elCarregando.hidden = false;
    await carregarFase(seguinte);
    elCarregando.hidden = true;

    estado.checkpoint = 0;
    estado.mortesNoCheckpoint = 0;
    estado.coracoes = CORACOES_CHEIOS;
    atualizarCoracoes();
    reiniciarPosicao(0);
    posicionarCameraAtras(true);

    elFade.classList.remove('on');
    estado.modo = 'correndo';
    mostrarCartela(fase);
    setTimeout(() => dizerLegenda(fase.legenda, 3600), 1900);
    trocando = false;
  }

  /** `nome` é opcional: sem ele a legenda é só a frase, como nas aberturas. */
  function dizerLegenda(texto, ms, nome = '') {
    elLegenda.querySelector('.nome').textContent = nome;
    elLegenda.querySelector('.frase').textContent = texto;
    elLegenda.classList.add('on');
    clearTimeout(dizerLegenda.tempo);
    dizerLegenda.tempo = setTimeout(() => elLegenda.classList.remove('on'), ms);
  }

  const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

  /*
   * O final é encenado em TEMPO DE JOGO, não em setTimeout. A volta da câmera
   * até a fachada é calculada a partir de estado.tempoModo; se as legendas e o
   * fade corressem no relógio de parede, num computador mais devagar o fade
   * começaria com a câmera ainda no meio do movimento.
   */
  const MARCAS_FINAL = [
    { t: 2.6, feito: false, faz: () => dizerLegenda('Onze cartas esperaram cinco anos por você.', 4200) },
    { t: 7.2, feito: false, faz: () => { elFade.style.transitionDuration = '1.6s'; elFade.classList.add('on'); } },
    { t: 9.2, feito: false, faz: () => irParaCartas() },
  ];

  let finalIniciado = false;
  function encerrar() {
    if (finalIniciado) return;
    finalIniciado = true;
    estado.modo = 'final';
    estado.tempoModo = 0;
    elHud.classList.remove('on');
    elEscapar.classList.remove('on');
    Som.sinetaDaPorta();
  }

  function encenarFinal() {
    for (const m of MARCAS_FINAL) {
      if (!m.feito && estado.tempoModo >= m.t) {
        m.feito = true;
        m.faz();
      }
    }
  }

  function irParaCartas() {
    Som.silenciarTudo();
    memoria.gravar('jogou', true);
    memoria.gravar('coletadas', [...estado.envelopes]);

    /* Versão só-o-jogo (o build --demo, para mostrar por aí): as cartas e os
       vídeos não estão do lado, então não há para onde navegar. Em vez de um
       link morto, um cartão. O presente de verdade não passa por aqui — o
       atributo só existe no index-demo.html. */
    if (window.__soOJogo) { cartaoSoOJogo(); return; }

    const c = [...estado.envelopes].sort((a, b) => a - b).join(',');
    location.href = `${DESTINO_CARTAS}?from=jogo${c ? '&c=' + c : ''}`;
  }

  function cartaoSoOJogo() {
    const n = estado.envelopes.size;
    const chegou = estado.modo === 'final';
    /* A cutscene termina fundindo para o preto (#fade está em z-index 70, o
       recado em 18). Em vez de desfazer o fade, o cartão sobe por cima dele:
       fica igual à entrega de verdade, em que o site das cartas nasce do preto. */
    elRecado.style.zIndex = '71';
    const recolhidos = n === CARTAS.length
      ? ` E você recolheu os ${n} envelopes, todos eles.`
      : n > 0
        ? ` Você recolheu ${n} envelope${n === 1 ? '' : 's'} pelo caminho — mas nenhuma carta depende disso.`
        : '';
    mostrarRecado(
      chegou ? 'Você chegou na porta.' : 'É aqui que as cartas abrem.',
      `${chegou ? 'A porta abre' : 'No presente de verdade, a porta abre'} e as ${CARTAS.length} cartas estão esperando.${recolhidos}`
        + ' Esta é só a versão de mostrar o jogo — as cartas, os vídeos e a encomenda assinada ficam no presente.',
      [{ txt: chegou ? 'jogar de novo' : 'voltar para o jogo', forte: true, acao: () => location.reload() }]
    );
  }

  /* ─────────── pausa e ajustes ─────────── */

  function alternarPausa() {
    if (estado.modo === 'correndo') {
      estado.modo = 'pausado';
      elPausa.hidden = false;
      montarOpcoes();
    } else if (estado.modo === 'pausado') {
      estado.modo = 'correndo';
      elPausa.hidden = true;
      Som.retomar();
    }
  }

  function montarOpcoes() {
    const alvoQ = $('#op-qualidade');
    alvoQ.innerHTML = '';
    for (const nome of ['baixo', 'medio', 'alto']) {
      const b = document.createElement('button');
      b.className = 'mini' + (nome === qualidade ? ' sel' : '');
      b.textContent = nome === 'medio' ? 'médio' : nome;
      b.onclick = () => { aplicarQualidade(nome); montarOpcoes(); };
      alvoQ.appendChild(b);
    }
    const alvoS = $('#op-som');
    alvoS.innerHTML = '';
    const bs = document.createElement('button');
    bs.className = 'mini' + (Som.estaMudo() ? '' : ' sel');
    bs.textContent = Som.estaMudo() ? 'ligar som' : 'som ligado';
    bs.onclick = () => { Som.alternarMudo(); montarOpcoes(); };
    alvoS.appendChild(bs);
  }

  function aplicarQualidade(nome, lembrar = true) {
    qualidade = nome;
    preset = PRESETS[nome];
    if (lembrar) {
      memoria.gravar('qualidade', nome);
      vigiaAtivo = false;   // escolha da pessoa manda; o vigia se cala
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, preset.pixelRatio));
    pos.definirNiveis(preset.bloomNiveis);
    pos.definirAmostras(preset.amostras);
    pos.uniforms.gotas.value = preset.gotas ? fase.camera.gotas : 0;
    pos.uniforms.forcaDof.value = preset.dof ? (fase.camera.dof ?? 0.85) : 0;
    if (mundo && mundo.sol) {
      mundo.sol.shadow.mapSize.set(preset.sombra, preset.sombra);
      mundo.ajustarSombra(preset);
    }
    redimensionar();
  }

  /* ─────────── vigia de tempo de quadro ───────────
     Os presets subiram (MSAA, sombra macia, mais pixels no celular) e eu não
     tenho o aparelho da Isadora na mão para saber se ele segura. Então em vez
     de chutar baixo por precaução — que foi o erro que deixou o telefone dela
     com um terço dos pixels — o jogo mede os primeiros segundos de corrida e
     desce um degrau se estiver arrastando.

     Mediana, não média: um pico de 300 ms compilando shader ou trocando de
     bloco não pode condenar o aparelho. E não grava a escolha na memória, para
     não rebaixar para sempre quem só passou por um mau momento. */
  const VIGIA_ALVO = 28;       // ms por quadro; ~36 fps
  const VIGIA_AQUECE = 1.5;    // s de corrida ignorados: os primeiros quadros compilam shader
  const VIGIA_JANELA = 4;      // s de medição por decisão
  const VIGIA_MINIMO = 12;     // amostras mínimas para a mediana significar algo
  let vigiaTempos = [];
  let vigiaEspera = VIGIA_AQUECE;
  let vigiaJanela = 0;
  let vigiaAtivo = !memoria.ler('qualidade', null);   // quem escolheu na pausa manda

  /* A janela é de TEMPO, não de quadros. Contar 90 quadros parece equivalente e
     não é: num aparelho ruim de verdade — o caso que este vigia existe para
     socorrer — 90 quadros podem levar um minuto e meio, e a pessoa passa esse
     minuto e meio no engasgo que era para ser consertado. Por segundos, a
     decisão sai igual num aparelho rápido e num lento. */
  function vigiarQuadro(ms) {
    if (!vigiaAtivo || estado.modo !== 'correndo') return;
    const s = ms / 1000;
    if (vigiaEspera > 0) { vigiaEspera -= s; return; }
    vigiaTempos.push(ms);
    vigiaJanela += s;
    if (vigiaJanela < VIGIA_JANELA) return;

    const meio = vigiaTempos.slice().sort((a, b) => a - b)[vigiaTempos.length >> 1];
    const bastante = vigiaTempos.length >= VIGIA_MINIMO;
    vigiaTempos = [];
    vigiaJanela = 0;

    // poucas amostras num aparelho MUITO lento ainda é veredito: quadro enorme
    if (bastante && meio <= VIGIA_ALVO) { vigiaAtivo = false; return; }
    const abaixo = ESCADA_QUALIDADE[ESCADA_QUALIDADE.indexOf(qualidade) + 1];
    if (!abaixo) { vigiaAtivo = false; return; }
    aplicarQualidade(abaixo, false);
  }

  $('#btn-voltar').onclick = alternarPausa;
  $('#btn-recomecar').onclick = () => {
    elPausa.hidden = true;
    estado.coracoes = CORACOES_CHEIOS;
    atualizarCoracoes();
    reiniciarPosicao(estado.checkpoint);
    estado.modo = 'correndo';
  };
  $('#btn-pular-pausa').onclick = (e) => { e.preventDefault(); irParaCartas(); };
  $('#btn-pular-intro').onclick = (e) => { e.preventDefault(); irParaCartas(); };
  elEscapar.onclick = (e) => { e.preventDefault(); irParaCartas(); };

  /* ─────────── câmera ─────────── */
  let camX = 0, camY = 2.85, camTremor = new Vector3();
  const alvoOlhar = new Vector3();

  function posicionarCameraAtras(imediato) {
    const desejadoX = estado.x * 0.62;
    camX = imediato ? desejadoX : camX;
    camera.position.set(camX, camY, estado.dist - 6.6);
    alvoOlhar.set(estado.x * 0.35, 1.45, estado.dist + 9);
    camera.lookAt(alvoOlhar);
  }

  /**
   * Procura uma "olhada" ativa — o momento em que a câmera vira para um marco.
   * Devolve o peso 0→1→0 (entra e sai suave) e o alvo. A câmera NUNCA sai de
   * trás dela: só abre o ângulo, sobe, recua e muda a mira. Assim ela continua
   * na tela e no controle o tempo inteiro.
   */
  let fovAtual = camera.fov;
  let dofMisturado = 0;
  function olhadaAtiva() {
    if (!mundo || !mundo.pontos || estado.modo !== 'correndo') return null;
    for (const p of mundo.pontos) {
      const o = p.olhada;
      if (!o) continue;
      if (estado.dist < o.de || estado.dist > o.ate) continue;
      const t = (estado.dist - o.de) / (o.ate - o.de);
      // sobe no primeiro quinto, segura, desce no último quinto
      const peso = Math.min(suaveEntre(0, 0.2, t), suaveEntre(1, 0.8, t));
      return { o, peso };
    }
    return null;
  }

  function atualizarCamera(dt) {
    if (estado.modo === 'monumentos') {
      camaraDeVoo(dt);
      return;
    }

    if (estado.modo === 'final' && estado.tempoModo > 0.4) {
      // a câmera dá a volta e enquadra a fachada
      const t = suaveEntre(0.4, 5.2, estado.tempoModo);
      const zFachada = fase.comprimento + 4;
      const ax = mistura(estado.x * 0.62, -10.5, t);
      const ay = mistura(camY, 3.4, t);
      const az = mistura(estado.dist - 6.6, estado.dist - 12, t);
      camera.position.set(ax, ay, az);
      alvoOlhar.set(mistura(estado.x * 0.35, -1.6, t), mistura(1.45, 4.6, t), mistura(estado.dist + 9, zFachada, t));
      camera.lookAt(alvoOlhar);
      return;
    }

    camX = amortece(camX, estado.x * 0.62, 0.0009, dt);
    const alturaAlvo = 2.85 - (estado.agachado ? 0.3 : 0) + estado.y * 0.32;
    camY = amortece(camY, alturaAlvo, 0.0025, dt);

    estado.tremor = Math.max(0, estado.tremor - dt * 2.6);
    const forcaTremor = estado.tremor * (menosMovimento() ? 0.25 : 1);
    camTremor.set(
      (Math.random() - 0.5) * forcaTremor * 0.55,
      (Math.random() - 0.5) * forcaTremor * 0.4,
      0
    );

    let px = camX + camTremor.x;
    let py = camY + camTremor.y;
    let pz = estado.dist - 6.6;
    /* Em retrato o fov vertical é maior, e a altura extra ia toda para o chão:
       metade da tela virava calçada vazia com a menina pequena no meio. Subindo
       a mira na mesma proporção, o quadro ganha cenário em cima em vez de piso
       embaixo, e ela volta a ocupar o lugar certo. */
    // sai da PROPORÇÃO da tela, não do fov corrente: durante uma olhada o fov
    // fecha (46 no Piccadilly), e usar ele aqui baixava a mira bem na hora do
    // enquadramento do marco
    const subidaRetrato = (fovVertical(FOV_BASE, camera.aspect) - FOV_BASE) * 0.055;
    alvoOlhar.set(estado.x * 0.35,
      1.45 + subidaRetrato - (estado.agachado ? 0.2 : 0), estado.dist + 9);

    const olhada = olhadaAtiva();
    // os `fov` das olhadas são escritos como tela deitada e convertidos aqui,
    // igual ao FOV_BASE — senão o enquadramento dos marcos só valeria no monitor
    const fovDeitado = olhada ? mistura(FOV_BASE, olhada.o.fov ?? 76, olhada.peso) : FOV_BASE;
    const fovAlvo = fovVertical(fovDeitado, camera.aspect);
    if (olhada) {
      const { o, peso } = olhada;
      py += (o.subida ?? 2.4) * peso;
      pz -= (o.recuo ?? 5) * peso;
      alvoOlhar.lerp(new Vector3(o.mira[0], o.mira[1], o.mira[2]), peso);
    }
    // o desfoque de fundo é feito para a rua; num marco distante ele apaga
    // justamente o que se quer ver, então a olhada empurra o foco para longe
    if (olhada || dofMisturado > 0.001) {
      const c = fase.camera;
      const o = olhada ? olhada.o : null;
      dofMisturado = olhada ? olhada.peso : 0;
      const u = pos.uniforms;
      u.dofPerto.value = mistura(c.dofPerto ?? 14, (o && o.dofPerto) ?? 170, dofMisturado);
      u.dofLonge.value = mistura(c.dofLonge ?? 66, (o && o.dofLonge) ?? 620, dofMisturado);
    }

    // trocar o fov exige recalcular a projeção; só quando muda de verdade
    if (Math.abs(fovAlvo - fovAtual) > 0.01) {
      fovAtual = fovAlvo;
      camera.fov = fovAtual;
      camera.updateProjectionMatrix();
    }

    camera.position.set(px, py, pz);
    camera.lookAt(alvoOlhar);
  }

  /* ─────────── a visita aos monumentos ───────────
     Uma terceira porta na abertura, para quem não quiser correr (ou já tiver
     corrido) e mesmo assim quiser ver de perto o que a corrida só deixa passar.
     A cidade é a mesma: nada é construído de novo aqui. O que muda é que a
     câmera larga as costas dela e passa a dar voltas em volta de um marco.

     A conta do enquadramento sai da CAIXA ENVOLVENTE real de cada objeto, medida
     depois de posicionado e escalado (`mundo.voos`, montado em `criarPontos`).
     Foi a forma de a mesma linha servir para um ônibus de 10 m e para a London
     Eye de 80: doze raios escritos à mão em `fases.js` seriam doze chances de
     errar, e todos precisariam ser refeitos a cada mudança de escala. */

  const MONUMENTOS = listaDeMonumentos();
  const elMon = $('#monumentos');
  const elMonTitulo = $('#mon-titulo');
  const elMonFita = $('#mon-fita');
  const elMonDica = $('#mon-dica');
  const VOLTA_AUTO = 0.09;          // rad/s do sobrevoo sozinho
  const ESPERA_AUTO = 2.2;          // s parada antes de o giro voltar

  let monAtual = -1;
  let monVoo = null;                // { mira:Vector3, raio, altura, fov }
  let monAngulo = 0;
  let monRaio = 40;
  let monAltura = 12;
  let monParado = 0;                // tempo desde o último arrastar
  let monTrocando = false;
  const monMira = new Vector3();

  /** Enquadramento de um marco, medido da caixa envolvente dele. */
  function medirVoo(objeto, ponto) {
    const caixa = new Box3().setFromObject(objeto);
    const tam = caixa.getSize(new Vector3());
    const centro = caixa.getCenter(new Vector3());
    const v = ponto.voo || {};

    /* Mirar no centro geométrico deixa metade do quadro no chão em coisa alta e
       fina — a torre do Big Ben tem 96 m de altura para 12 de base. Descer um
       pouco a mira põe o pé do marco no quadro junto com o topo. */
    const mira = new Vector3(centro.x, caixa.min.y + tam.y * 0.42, centro.z);

    /* Raio: a metade da maior medida horizontal, mais o que a altura pede, mais
       uma folga. O `0.55` da altura é o que faz a torre caber em pé sem a câmera
       ter de subir junto — foi medido olhando, não deduzido. */
    const largo = Math.max(tam.x, tam.z);
    const raio = v.raio ?? (largo * 0.62 + tam.y * 0.55 + 9);
    const altura = v.altura ?? (mira.y + tam.y * 0.30 + 3.5);

    /* Quem mora DENTRO da rua — os ônibus e a loja de discos — tem um problema
       que os marcos grandes não têm: a fileira de casas está a 9 m do eixo, e
       uma órbita de 18 m enfia a câmera dentro da parede da frente. Metade da
       volta virava um bloco chapado ocupando a tela.

       A saída não é encolher a órbita (a 4 m de um ônibus não se lê nada): é
       SUBIR quando a volta passa da fachada, e é o que um drone faria mesmo —
       sobe, passa por cima do telhado e desce do outro lado. Marco com clareira
       (Big Ben, ponte, Piccadilly) não entra nisso: ali a fileira já foi
       aberta e não há parede nenhuma para bater. */
    const canyon = fase.tipo === 'rua' && !ponto.claro && Math.abs(mira.x) < 9;

    return { mira, raio, altura, fov: v.fov ?? 58, canyon, angulo: v.angulo,
             raioMin: raio * 0.45, raioMax: raio * 2.4 };
  }

  function desenharFita() {
    elMonFita.innerHTML = '';
    MONUMENTOS.forEach((m, i) => {
      const b = document.createElement('button');
      b.textContent = m.nome;
      b.className = i === monAtual ? 'atual' : '';
      b.onclick = () => irParaMonumento(i);
      elMonFita.appendChild(b);
    });
    const atual = elMonFita.children[monAtual];
    if (atual) atual.scrollIntoView({ block: 'nearest', inline: 'center' });
  }

  async function irParaMonumento(i) {
    if (monTrocando) return;
    const alvo = (i + MONUMENTOS.length) % MONUMENTOS.length;
    const m = MONUMENTOS[alvo];
    monTrocando = true;
    try {
      if (m.fase !== estado.faseIndice) {
        /* Trocar de cena é desmontar e remontar Londres inteira: os segundos de
           "carregando" são os mesmos da troca de cena da corrida. A lista está
           em ordem de cena justamente para isso ser raro. */
        elCarregando.hidden = false;
        await carregarFase(m.fase);
        elCarregando.hidden = true;
      }
      monAtual = alvo;

      const achado = (mundo.voos || []).find((v) => v.ponto === m.ponto);
      monVoo = achado ? medirVoo(achado.objeto, m.ponto) : null;
      if (monVoo) {
        monMira.copy(monVoo.mira);
        monRaio = monVoo.raio;
        monAltura = monVoo.altura;
      }
      /* Começa de trás e de lado, e não de frente: de frente a primeira imagem
         é a fachada chapada, sem volume nenhum. Na rua o ângulo é outro — ali a
         primeira imagem tem que estar SOBRE O ASFALTO, que é de onde o anúncio
         da lateral do ônibus e a vitrine da loja se leem. */
      monAngulo = monVoo && monVoo.angulo != null ? monVoo.angulo
        : monVoo && monVoo.canyon
          ? Math.asin(limita(-monMira.x / Math.max(monRaio, 1), -1, 1)) - 0.35
          : -2.2;
      monParado = ESPERA_AUTO;

      /* O mundo recicla os quarteirões pela distância dela, e a cena do parque
         interpola o anoitecer por ela também. Pondo `dist` no z do marco, a
         cidade se monta em volta dele e a hora do dia é a que ele teria. */
      estado.dist = monMira.z;
      estado.x = 0;
      menina.raiz.position.set(0, -50, monMira.z);

      /* O desfoque de fundo é feito para a rua e apagaria justamente o que se
         veio ver — a mesma armadilha da `olhada`. Aqui ele sai de vez. */
      pos.uniforms.forcaDof.value = 0;

      elMonTitulo.querySelector('.n').textContent = m.nome;
      elMonTitulo.querySelector('.l').textContent = m.legenda;
      desenharFita();
      atualizarCamera(0);
      mundo.atualizar(0, estado.dist, camera.position);
    } finally {
      monTrocando = false;
    }
  }

  function camaraDeVoo(dt) {
    if (!monVoo) return;
    monParado += dt;
    if (monParado >= ESPERA_AUTO) {
      monAngulo += VOLTA_AUTO * dt * (menosMovimento() ? 0.35 : 1);
    }
    let alt = Math.max(monMira.y + 1.5, monAltura);
    const cx = monMira.x + Math.sin(monAngulo) * monRaio;
    const cz = monMira.z + Math.cos(monAngulo) * monRaio;
    if (monVoo.canyon) {
      // sobe por cima da fileira quando a volta passa da fachada (x = ±9);
      // 6 m de rampa para a subida ser um voo e não um salto
      // 26 m passa dos 20,4 do prédio mais alto (6 andares de 3,4)
      const excesso = Math.abs(cx) - 8.2;
      if (excesso > 0) alt = mistura(alt, Math.max(alt, 26), suaveEntre(0, 2.5, excesso));
    }
    camera.position.set(cx, alt, cz);
    alvoOlhar.copy(monMira);
    camera.lookAt(alvoOlhar);

    const fovAlvo = fovVertical(monVoo.fov, camera.aspect);
    if (Math.abs(fovAlvo - fovAtual) > 0.01) {
      fovAtual = fovAlvo;
      camera.fov = fovAtual;
      camera.updateProjectionMatrix();
    }
  }

  /* ── controles do sobrevoo ──
     Registrados na camada e não na janela: durante a corrida esses mesmos
     gestos são o comando dela, e roubar o `pointerdown` global quebraria o
     jogo. Fora do modo `monumentos` nada aqui chega a rodar. */
  let arrastando = false, arrastouX = 0, arrastouY = 0;

  elMon.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button, a')) return;
    arrastando = true;
    arrastouX = e.clientX;
    arrastouY = e.clientY;
    elMon.classList.add('arrastando');
    elMon.setPointerCapture(e.pointerId);
  });
  elMon.addEventListener('pointermove', (e) => {
    if (!arrastando || !monVoo) return;
    monAngulo -= (e.clientX - arrastouX) * 0.006;
    monAltura = limita(monAltura - (e.clientY - arrastouY) * 0.09,
                       monMira.y - monVoo.raio * 0.25, monMira.y + monVoo.raio * 1.1);
    arrastouX = e.clientX;
    arrastouY = e.clientY;
    monParado = 0;
  });
  /* `pointerleave` NÃO entra aqui: com a captura ligada o navegador já garante
     que o `pointerup` chega nesta camada mesmo se o dedo sair da janela, e o
     `leave` chega junto com a captura em alguns navegadores — matando o
     arrastar no primeiro pixel. */
  for (const ev of ['pointerup', 'pointercancel']) {
    elMon.addEventListener(ev, () => { arrastando = false; elMon.classList.remove('arrastando'); });
  }
  elMon.addEventListener('wheel', (e) => {
    if (!monVoo) return;
    e.preventDefault();
    monRaio = limita(monRaio * (1 + Math.sign(e.deltaY) * 0.09), monVoo.raioMin, monVoo.raioMax);
    monParado = 0;
  }, { passive: false });

  /* Pinça no celular: duas contas de distância entre os dedos, sem biblioteca. */
  const dedos = new Map();
  let pincaAntes = 0;
  elMon.addEventListener('pointerdown', (e) => dedos.set(e.pointerId, e));
  elMon.addEventListener('pointermove', (e) => {
    if (!dedos.has(e.pointerId)) return;
    dedos.set(e.pointerId, e);
    if (dedos.size !== 2 || !monVoo) return;
    arrastando = false;
    const [a, b] = [...dedos.values()];
    const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    if (pincaAntes) {
      monRaio = limita(monRaio * (pincaAntes / d), monVoo.raioMin, monVoo.raioMax);
      monParado = 0;
    }
    pincaAntes = d;
  });
  for (const ev of ['pointerup', 'pointercancel']) {
    elMon.addEventListener(ev, (e) => { dedos.delete(e.pointerId); if (dedos.size < 2) pincaAntes = 0; });
  }

  async function abrirMonumentos() {
    /* Mesmo gesto que o "começar": é aqui que o navegador libera o áudio, e a
       música tem que atravessar a visita e a corrida sem recomeçar. */
    Som.iniciar();
    Som.retomar();
    Som.musica(MUSICA_DE_FUNDO, { volume: 0.42 });
    Som.ambiente(fase.som);

    elIntro.hidden = true;
    elMon.hidden = false;
    elHud.classList.remove('on');
    elEscapar.classList.remove('on');
    menina.raiz.visible = false;
    estado.modo = 'monumentos';
    elMonDica.style.opacity = '1';
    setTimeout(() => { elMonDica.style.opacity = '0'; }, 6000);
    await irParaMonumento(0);
  }

  /** Sai da visita e devolve o jogo ao pé da letra: cena 1, do zero. */
  async function fecharMonumentos(entao) {
    if (monTrocando) return;
    monTrocando = true;
    try {
      elMon.hidden = true;
      monVoo = null;
      if (estado.faseIndice !== 0) {
        elCarregando.hidden = false;
        await carregarFase(0);
        elCarregando.hidden = true;
      }
      estado.coracoes = CORACOES_CHEIOS;
      atualizarCoracoes();
      reiniciarPosicao(0);
      estado.checkpoint = 0;
      menina.raiz.visible = true;
      pos.uniforms.forcaDof.value = preset.dof ? (fase.camera.dof ?? 0.85) : 0;
      posicionarCameraAtras(true);
      estado.modo = 'intro';
    } finally {
      monTrocando = false;
    }
    if (entao) entao();
  }

  $('#btn-monumentos').onclick = (e) => { e.preventDefault(); abrirMonumentos(); };
  $('#mon-antes').onclick = () => irParaMonumento(monAtual - 1);
  $('#mon-depois').onclick = () => irParaMonumento(monAtual + 1);
  $('#mon-voltar').onclick = () => fecharMonumentos(() => { elIntro.hidden = false; });
  $('#mon-correr').onclick = () => fecharMonumentos(comecar);
  $('#mon-cartas').onclick = (e) => { e.preventDefault(); irParaCartas(); };

  /* ─────────── passo de lógica ─────────── */

  function passoLogica(dt) {
    estado.tempoModo += dt;
    estado.invuln = Math.max(0, estado.invuln - dt);
    estado.tropeco = Math.max(0, estado.tropeco - dt);
    estado.flash = Math.max(0, estado.flash - dt * 3.4);

    if (estado.modo === 'caindo') {
      if (estado.tempoModo > 1.15) voltarAoCheckpoint();
      return;
    }

    if (estado.modo === 'final') {
      encenarFinal();
      // desacelera até parar em frente à porta
      const parada = fase.comprimento - 2;
      const restante = Math.max(0, parada - estado.dist);
      estado.velocidade = Math.min(estado.velocidade, restante * 0.8);
      estado.velocidade = Math.max(estado.velocidade, restante > 0.4 ? 1.1 : 0);
      estado.dist += estado.velocidade * dt;
      estado.x = amortece(estado.x, 0, 0.0009, dt);
      estado.noChao = true;
      estado.y = 0;
      return;
    }

    if (estado.modo !== 'correndo') return;

    // velocidade alvo da fase, subindo suavemente
    const alvoVel = velocidadeDaFase(estado.dist);
    estado.velocidade = amortece(estado.velocidade, alvoVel, 0.35, dt);
    estado.dist += estado.velocidade * dt;

    // faixa
    estado.x = amortece(estado.x, posicaoDaFaixa(estado.faixa), 0.000018, dt);

    // pulo e gravidade
    if (!estado.noChao) {
      estado.vy += GRAVIDADE * dt;
      estado.y += estado.vy * dt;
      if (estado.y <= 0) {
        estado.y = 0;
        estado.vy = 0;
        estado.noChao = true;
        Som.pouso();
      }
    }

    // agachar: tecla segurada ou o gesto de arrastar para baixo
    estado.agachado = estado.noChao && (
      teclas.ArrowDown || teclas.KeyS || gpAnterior.baixo || performance.now() < agacharAte
    );

    alimentarObstaculos();
    testarColisoes();
    checarCheckpoint();

    if (estado.dist >= fase.comprimento - (fase.id === 'agencia' ? 40 : 0)) {
      if (fase.id === 'agencia') encerrar();
      else if (estado.dist >= fase.comprimento) proximaFase();
    }
  }

  /* ─────────── laço ─────────── */

  let anterior = performance.now();
  let acumulador = 0;
  let contaFps = 0, tempoFps = 0;

  function quadro(agora) {
    requestAnimationFrame(quadro);
    const dtReal = Math.min((agora - anterior) / 1000, 0.25);
    anterior = agora;

    if (estado.modo === 'carregando') return;

    if (estado.modo !== 'pausado' && estado.modo !== 'monumentos') {
      lerGamepad();
      acumulador += dtReal;
      let voltas = 0;
      while (acumulador >= PASSO && voltas < 8) {
        passoLogica(PASSO);
        acumulador -= PASSO;
        voltas++;
      }
      if (voltas >= 8) acumulador = 0;
    }

    const dt = dtReal;

    // obstáculos que se mexem
    for (const o of ativos) if (o.atualizar) o.atualizar(dt, o);

    // a menina — na visita aos monumentos ela não está em cena
    if (estado.modo !== 'monumentos') {
      menina.raiz.position.set(estado.x, estado.y, estado.dist);
      menina.atualizar(dt, {
        velocidade: estado.velocidade,
        noChao: estado.noChao,
        agachado: estado.agachado,
        tropeco: estado.tropeco > 0,
        x: estado.x,
      });
      // pisca enquanto está invulnerável, para a pancada ficar legível
      const piscando = estado.invuln > 0 && Math.floor(estado.invuln * 12) % 2 === 0;
      menina.raiz.visible = (!piscando || estado.modo === 'final') && !SEM.has('tudo') && !SEM.has('menina');
      atualizarTrilha();
    }
    // legenda ao se aproximar de um marco do trajeto
    if (mundo && mundo.pontos && estado.modo === 'correndo') {
      for (const p of mundo.pontos) {
        if (p.legenda && !p.mostrada && estado.dist > p.z - p.aviso) {
          p.mostrada = true;
          dizerLegenda(p.legenda, 5200, p.nome || '');
        }
        // os sinos tocam quando ela entra na janela da olhada, e só uma vez:
        // se morrer e voltar ao checkpoint, não repetem
        if (p.badalada && !p.soou && p.olhada && estado.dist > p.olhada.de - 6) {
          p.soou = true;
          Som.badaladas();
        }
      }
    }
    if (luzHeroi.visible) luzHeroi.position.set(estado.x, estado.y + 2.6, estado.dist - 1.2);
    if (mundo) mundo.atualizar(dt, estado.dist, camera.position);
    // obstáculo nasce no meio da corrida: o `?sem=texturas` tem que alcançá-lo
    if (SEM.has('texturas') && Math.floor(agora / 500) % 2 === 0) despirTexturas();
    if (agencia) agencia.coracao.position.y = 8.4 + Math.sin(agora / 700) * 0.14;

    atualizarCamera(dt);

    const u = pos.uniforms;
    u.flash.value = estado.flash * 0.5;
    u.velocidade.value = estado.velocidade;
    if (SEM.has('pos')) {
      // sem passe nenhum de pós: a cena crua direto na tela. Fica lavada (o
      // tonemap mora no passe final), mas serve para dizer se o preto vem de lá
      renderer.setRenderTarget(null);
      renderer.render(cena, camera);
    } else {
      pos.render(dt);
    }

    vigiarQuadro(dtReal * 1000);

    contaFps++;
    tempoFps += dtReal;
    if (tempoFps >= 0.5) {
      elFps.textContent = Math.round(contaFps / tempoFps) + ' fps · ' + qualidade;
      contaFps = 0;
      tempoFps = 0;
    }
  }

  /* ─────────── redimensionar ─────────── */
  function redimensionar() {
    const l = innerWidth, a = innerHeight;
    camera.aspect = l / a;
    // girar o celular muda a proporção: o fov vertical tem que ser recalculado,
    // senão a abertura horizontal deixa de ser a mesma nas duas visões
    camera.fov = fovVertical(FOV_BASE, camera.aspect);
    fovAtual = camera.fov;
    camera.updateProjectionMatrix();
    renderer.setSize(l, a, false);
    const pr = renderer.getPixelRatio();
    pos.redimensiona(l * pr, a * pr);
  }
  addEventListener('resize', redimensionar);

  /* ─────────── partida ─────────── */

  async function comecar() {
    elIntro.hidden = true;
    Som.iniciar();
    Som.retomar();
    /* A música vem ANTES do ambiente: o `Som.ambiente` olha se há música
       tocando para decidir o volume do pad. E ela é ligada aqui, no gesto de
       apertar "começar" — navegador nenhum deixa tocar áudio antes disso.

       Depois daqui ela nunca mais é tocada: `carregarFase` chama `ambiente`
       de novo em cada troca de cena, e a música tem que atravessar as três
       sem recomeçar do zero. */
    Som.musica(MUSICA_DE_FUNDO, { volume: 0.42 });
    Som.ambiente(fase.som);
    elHud.classList.add('on');
    elEscapar.classList.add('on');
    estado.modo = 'correndo';
    mostrarCartela(fase);
    setTimeout(() => dizerLegenda(fase.legenda, 3600), 1900);
  }

  $('#btn-comecar').onclick = comecar;

  (async function bootar() {
    desenharCoracoes();
    atualizarBolsa();
    redimensionar();

    // Atalhos de desenvolvimento: ?fase=2 abre direto a última cena e
    // ?dist=700 começa já adiantada nela. Inofensivos em produção — sem os
    // parâmetros o jogo começa do início, como deve.
    const busca = new URLSearchParams(location.search);
    const pedida = parseInt(busca.get('fase') || '0', 10);
    const inicial = Number.isFinite(pedida) ? limita(pedida, 0, FASES.length - 1) : 0;
    const distInicial = parseFloat(busca.get('dist') || '0') || 0;

    await respirar('preparando Londres…', 0.05);
    await carregarFase(inicial);
    reiniciarPosicao(limita(distInicial, 0, fase.comprimento - 5));
    estado.checkpoint = limita(distInicial, 0, fase.comprimento - 5);
    posicionarCameraAtras(true);
    await respirar('quase lá…', 1);

    // um quadro renderizado antes de sumir com a tela de carregamento,
    // para a intro já aparecer por cima da cidade e não de um vazio preto
    pos.render(0.016);
    await respirar(null, 1);

    elCarregando.hidden = true;
    elIntro.hidden = false;
    estado.modo = 'intro';

    if (memoria.ler('jogou', false)) {
      const p = elIntro.querySelector('.conto');
      p.textContent = 'Você já chegou até a porta uma vez. Pode correr de novo, ou ir direto para as cartas — elas continuam lá.';
    }

    /* A abertura em duas telas: primeiro a cartela, depois as orientações.
       A cartela passa sozinha em 2,6 s, mas QUALQUER toque, clique ou tecla
       adianta — cartão que prende quem está esperando não é abertura, é
       pedágio. `passar` é idempotente, então tanto faz quem chegar primeiro. */
    const elCartela = $('#intro-cartela');
    const elGuia = $('#intro-guia');
    let cartelaPassou = false;
    function passarCartela() {
      if (cartelaPassou) return;
      cartelaPassou = true;
      clearTimeout(relogioCartela);
      removeEventListener('pointerdown', passarCartela);
      removeEventListener('keydown', passarCartela);
      elCartela.hidden = true;
      elGuia.hidden = false;
    }
    /* A contagem só começa depois de a cartela ter sido PINTADA.

       Armando o relógio na hora, os 2,6 s correm junto com o primeiro quadro do
       jogo — e esse quadro segura a thread por mais de dois segundos na estreia,
       que é quando os shaders compilam. Medido: a cartela ficava 2,6 s de
       relógio e 300 ms de tela. Dois `requestAnimationFrame` garantem uma
       pintura antes de a contagem começar.

       E os 600 ms de rede de segurança existem porque a espera pela pintura não
       pode ser infinita: numa máquina bem lenta o primeiro quadro leva sete
       segundos, e aí a abertura viraria uma sala de espera. */
    let relogioCartela = setTimeout(iniciarContagem, 600);
    let contando = false;
    function iniciarContagem() {
      if (contando || cartelaPassou) return;
      contando = true;
      clearTimeout(relogioCartela);
      relogioCartela = setTimeout(passarCartela, 2600);
    }
    requestAnimationFrame(() => requestAnimationFrame(iniciarContagem));
    addEventListener('pointerdown', passarCartela);
    addEventListener('keydown', passarCartela);

    // gancho de inspeção, só com #debug na URL: permite medir posições e
    // caixas envolventes de dentro do navegador sem poluir o escopo global
    if (document.body.classList.contains('debug')) {
      window.__jogo = {
        get cena() { return cena; },
        get camera() { return camera; },
        get estado() { return estado; },
        get mundo() { return mundo; },
        get fase() { return fase; },
        get trajeto() { return trajeto; },
        get pos() { return pos; },
        get renderer() { return renderer; },
        get preset() { return preset; },
        get qualidade() { return qualidade; },
        get vigia() { return { ativo: vigiaAtivo, amostras: vigiaTempos.length }; },
        get som() { return { musica: Som.temMusica() }; },
      };
    }

    anterior = performance.now();
    requestAnimationFrame(quadro);
  })();
}
