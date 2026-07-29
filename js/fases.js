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

    paleta: {
      ceuAlto: '#93c2ea', ceuHorizonte: '#e6e2d4', ceuBaixo: '#f1e4cd',
      corSol: '#fff3d8', dirSol: [0.28, 0.42, 0.86], tamanhoSol: 90,
      forcaSol: 1.1, neblinaCeu: 0.75,
    },
    neblina: 0.0031,
    forcaHalo: 0,
    dirLuz: [0.32, 0.7, 0.64],
    corSol: '#fff0d4', forcaLuzSol: 1.9,
    corCeuLuz: '#cfe2f2', corChaoLuz: '#cdbfa8', forcaHemisferio: 1.5,
    corPoste: '#ffc98a', forcaPoste: 9,
    sombra: 0.6,

    chuva: 0.4, corChuva: '#cfe2f4', vento: [-1.2, 0],
    molhado: 0.55, pedra: false,

    coresPredio: ['#f2d3d6', '#cfe4dc', '#f7e7c9', '#f6dfa6', '#dee2f1', '#f4cdb9'],
    janelasAcesas: 0.16, corJanela: '#ffe6b8', forcaJanela: 0.9,
    lojas: true, coresLoja: ['#c02a3e', '#2f7a68', '#3f5a9c', '#8a5aa8', '#d08a2a'],
    coresPorta: ['#2f5a8c', '#1f6b52', '#8e2436', '#3c3160', '#c07a1e', '#1d1b22'],

    marcos: [
      { tipo: 'bigben', x: -20, distancia: 178, escala: 1.35 },
      { tipo: 'parlamento', x: -78, distancia: 250, escala: 1 },
      { tipo: 'roda', x: 34, distancia: 260, escala: 1 },
    ],

    padroes: PADROES_RUA,
    camera: { exposicao: 0.94, bloom: 0.5, vinheta: 0.3, grao: 0.004, gotas: 0.5, aberracao: 0,
               dof: 0.8, dofPerto: 26, dofLonge: 140,
               contraste: 1.16, saturacao: 1.22, veu: 0.1 },
    som: { chuva: 1, vento: 0.5, acorde: [130.81, 196, 246.94] },
  },

  {
    id: 'hyde',
    numero: 'segunda parte',
    titulo: 'A tarde parou no parque',
    legenda: 'A chuva passou. O sol resolveu ficar do nosso lado.',
    tipo: 'parque',
    semente: 20230917,
    comprimento: 850,
    velocidadeInicial: 12.5,
    velocidadeFinal: 16,
    cartas: [4, 5, 6, 7],

    paleta: {
      ceuAlto: '#8ec2e8', ceuHorizonte: '#ffe7bb', ceuBaixo: '#f7d9a8',
      corSol: '#fff0cc', dirSol: [-0.62, 0.22, 0.75], tamanhoSol: 200,
      forcaSol: 2.4, neblinaCeu: 0.34,
    },
    neblina: 0.0038,
    forcaHalo: 0,
    dirLuz: [-0.58, 0.44, 0.68],
    corSol: '#ffdfae', forcaLuzSol: 2.5,
    corCeuLuz: '#d2e6fa', corChaoLuz: '#b8a67c', forcaHemisferio: 1.25,
    corPoste: '#ffe2b4', forcaPoste: 4,
    sombra: 0.62,

    chuva: 0.12, corChuva: '#ffe4c0', vento: [-0.5, 0],
    molhado: 0.8, pedra: false,
    coresFolhagem: ['#b4671f', '#c98a2a', '#8c4f1c', '#6f7a2a', '#a8551a', '#d19a34'],
    corAgua: '#27424a',

    coresPredio: ['#7a6a58'],
    janelasAcesas: 0, lojas: false,

    marcos: [{ tipo: 'roda', x: -46, distancia: 205, escala: 0.85 }],

    padroes: PADROES_PARQUE,
    camera: { exposicao: 0.9, bloom: 0.6, vinheta: 0.26, grao: 0.004, gotas: 0.14, aberracao: 0,
               dof: 0.82, dofPerto: 28, dofLonge: 150,
               contraste: 1.14, saturacao: 1.26, veu: 0.14, corAmbiente: [1.05, 1.0, 0.92] },
    som: { chuva: 0.18, vento: 0.75, acorde: [174.61, 261.63, 329.63] },
  },

  {
    id: 'agencia',
    numero: 'última parte',
    titulo: 'A rua da agência',
    legenda: 'É aqui. A luz acesa no fim da rua é para você.',
    tipo: 'rua',
    semente: 20260814,
    comprimento: 800,
    velocidadeInicial: 13,
    velocidadeFinal: 16.5,
    cartas: [8, 9, 10],

    paleta: {
      ceuAlto: '#2b4a86', ceuHorizonte: '#a9a2c4', ceuBaixo: '#6d6690',
      corSol: '#ffd7a8', dirSol: [0.45, 0.3, -0.6], tamanhoSol: 220,
      forcaSol: 1.2, neblinaCeu: 0.7,
    },
    neblina: 0.0072,
    forcaHalo: 0.03,
    dirLuz: [0.4, 0.66, -0.5],
    corSol: '#b9c3ea', forcaLuzSol: 0.95,
    corCeuLuz: '#6b81be', corChaoLuz: '#3e3442', forcaHemisferio: 1.0,
    corPoste: '#ffc070', forcaPoste: 24,
    sombra: 0.5,

    chuva: 0.3, corChuva: '#cbd8ea', vento: [-0.9, 0],
    molhado: 0.85, pedra: true,

    coresPredio: ['#e8c8cd', '#c3dcd6', '#eedcc0', '#cfd2ea', '#e6c4b4'],
    janelasAcesas: 0.72, corJanela: '#ffd79a', forcaJanela: 2.8,
    lojas: true, coresLoja: ['#c02a3e', '#2f6a78', '#5a4180', '#b06a24'],
    coresPorta: ['#2f5a8c', '#1f6b52', '#8e2436', '#3c3160', '#1d1b22'],

    marcos: [{ tipo: 'bigben', x: 22, distancia: 210, escala: 0.95 }],

    padroes: PADROES_NOITE,
    camera: { exposicao: 1.05, bloom: 0.85, vinheta: 0.38, grao: 0.005, gotas: 0.42, aberracao: 0,
               dof: 0.85, dofPerto: 22, dofLonge: 120,
               contraste: 1.2, saturacao: 1.2, veu: 0.16, corAmbiente: [0.98, 0.99, 1.06] },
    som: { chuva: 0.6, vento: 0.4, acorde: [110, 164.81, 220] },
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

  encaixarEnvelopes(fase, itens, r);
  return itens;
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

export function posicaoDaFaixa(faixa) {
  return (faixa - 1) * LARGURA_FAIXA;
}
