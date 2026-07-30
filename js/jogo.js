/* ═══════════════ o jogo ═══════════════
   Máquina de estados, laço de passo fixo, colisão, corações, checkpoints e a
   cutscene que entrega a menina na porta da agência.

   Regra que atravessa o arquivo inteiro: nunca deixar a jogadora presa. Todo
   caminho de erro leva de volta a correr, e existe sempre uma saída direta
   para as cartas.
   ═══════════════════════════════════════ */

import { WebGLRenderer, Scene, PerspectiveCamera, Vector3, PCFShadowMap,
         SRGBColorSpace, NoToneMapping, Group, PointLight, Color } from 'three';
import { $, limita, mistura, amortece, suaveEntre, sorteio, qualidadeAutomatica, PRESETS,
         ehTatil, menosMovimento, memoria } from './util.js';
import * as Som from './audio.js';
import { criarPos } from './pos.js';
import { criarMenina } from './personagem.js';
import { criarObstaculo, COMO_PASSAR } from './obstaculos.js';
import { criarMundo, criarAgencia } from './mundo.js';
import { FASES, CARTAS, gerarTrajeto, validarTrajeto, posicaoDaFaixa } from './fases.js';

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
const FOV_BASE = 54;

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

  /* ─────────── renderizador ─────────── */
  let qualidade = memoria.ler('qualidade', qualidadeAutomatica());
  if (!PRESETS[qualidade]) qualidade = 'medio';
  let preset = PRESETS[qualidade];

  let renderer;
  try {
    renderer = new WebGLRenderer({ canvas: tela, antialias: false, powerPreference: 'high-performance' });
  } catch (e) {
    semWebGL();
    return;
  }
  if (!renderer.getContext()) { semWebGL(); return; }

  renderer.setPixelRatio(Math.min(devicePixelRatio, preset.pixelRatio));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;

  const cena = new Scene();
  const camera = new PerspectiveCamera(FOV_BASE, innerWidth / innerHeight, 0.25, 600);
  const pos = criarPos(renderer, cena, camera, { niveis: preset.bloomNiveis });

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
    // desfoque de fundo: some no preset baixo, onde cada passe conta
    u.forcaDof.value = preset.bloomNiveis > 0 ? (c.dof ?? 0.85) : 0;
    u.dofPerto.value = c.dofPerto ?? 14;
    u.dofLonge.value = c.dofLonge ?? 66;
    u.contraste.value = c.contraste ?? 0.22;
    u.saturacao.value = c.saturacao ?? 1.18;
    u.veu.value = c.veu ?? 0.12;
    if (c.corAmbiente) u.corAmbiente.value = c.corAmbiente;

    luzHeroi.intensity = fase.luzHeroi || 0;
    luzHeroi.visible = !!fase.luzHeroi;

    Som.ambiente(fase.som);
    await respirar('acendendo os postes…', 0.9);
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

  function dizerLegenda(texto, ms) {
    elLegenda.querySelector('span').textContent = texto;
    elLegenda.classList.add('on');
    setTimeout(() => elLegenda.classList.remove('on'), ms);
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
    const c = [...estado.envelopes].sort((a, b) => a - b).join(',');
    location.href = `${DESTINO_CARTAS}?from=jogo${c ? '&c=' + c : ''}`;
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

  function aplicarQualidade(nome) {
    qualidade = nome;
    preset = PRESETS[nome];
    memoria.gravar('qualidade', nome);
    renderer.setPixelRatio(Math.min(devicePixelRatio, preset.pixelRatio));
    pos.definirNiveis(preset.bloomNiveis);
    pos.uniforms.gotas.value = preset.gotas ? fase.camera.gotas : 0;
    if (mundo && mundo.sol) mundo.sol.shadow.mapSize.set(preset.sombra, preset.sombra);
    redimensionar();
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
  let fovAtual = FOV_BASE;
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
    alvoOlhar.set(estado.x * 0.35, 1.45 - (estado.agachado ? 0.2 : 0), estado.dist + 9);

    const olhada = olhadaAtiva();
    const fovAlvo = olhada ? mistura(FOV_BASE, olhada.o.fov ?? 76, olhada.peso) : FOV_BASE;
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

    if (estado.modo !== 'pausado') {
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

    // a menina
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
    menina.raiz.visible = !piscando || estado.modo === 'final';

    atualizarTrilha();
    // legenda ao se aproximar de um marco do trajeto
    if (mundo && mundo.pontos && estado.modo === 'correndo') {
      for (const p of mundo.pontos) {
        if (p.legenda && !p.mostrada && estado.dist > p.z - p.aviso) {
          p.mostrada = true;
          dizerLegenda(p.legenda, 4400);
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
    if (agencia) agencia.coracao.position.y = 8.4 + Math.sin(agora / 700) * 0.14;

    atualizarCamera(dt);

    const u = pos.uniforms;
    u.flash.value = estado.flash * 0.5;
    u.velocidade.value = estado.velocidade;
    pos.render(dt);

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
      };
    }

    anterior = performance.now();
    requestAnimationFrame(quadro);
  })();
}
