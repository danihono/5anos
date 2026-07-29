/* ═══════════════ util — matemática, sorteio determinístico e ajudinhas de DOM ═══════════════ */

export const TAU = Math.PI * 2;

export function limita(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

export function mistura(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Interpolação independente de framerate. `taxa` é quanto sobra da diferença
 * por segundo — 0.001 chega rápido, 0.5 chega devagar.
 */
export function amortece(atual, alvo, taxa, dt) {
  return mistura(atual, alvo, 1 - Math.pow(taxa, dt));
}

export function suave(t) {
  t = limita(t, 0, 1);
  return t * t * (3 - 2 * t);
}

export function suaveEntre(a, b, v) {
  return suave((v - a) / (b - a));
}

/** Sorteio determinístico (mulberry32): mesma semente, mesma corrida, sempre. */
export function sorteio(semente) {
  let s = semente >>> 0;
  const r = () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.entre = (a, b) => a + r() * (b - a);
  r.inteiro = (a, b) => Math.floor(a + r() * (b - a + 1));
  r.escolhe = (lista) => lista[Math.floor(r() * lista.length)];
  r.chance = (p) => r() < p;
  return r;
}

export function $(sel) {
  return document.querySelector(sel);
}

export function ehTatil() {
  return matchMedia('(hover: none) and (pointer: coarse)').matches || navigator.maxTouchPoints > 1;
}

export function menosMovimento() {
  return matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Escolhe o preset gráfico olhando para o aparelho. O jogo foi feito pensando
 * em computador, então "alto" é o normal por lá; celular começa em "baixo"
 * e a pessoa pode subir na pausa se quiser.
 */
export function qualidadeAutomatica() {
  const nucleos = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 4;
  if (ehTatil() || nucleos <= 4 || mem <= 3) return 'baixo';
  if (nucleos <= 8 || mem <= 6) return 'medio';
  return 'alto';
}

export const PRESETS = {
  alto:  { pixelRatio: 2,   sombra: 2048, chuva: 9000, bloomNiveis: 3, distancia: 260, arvores: 1,   gotas: 1 },
  medio: { pixelRatio: 1.5, sombra: 1024, chuva: 4500, bloomNiveis: 2, distancia: 200, arvores: .7,  gotas: 1 },
  baixo: { pixelRatio: 1,   sombra: 512,  chuva: 1800, bloomNiveis: 0, distancia: 150, arvores: .45, gotas: 0 },
};

/** Guarda progresso sem explodir se o navegador bloquear o localStorage. */
export const memoria = {
  ler(chave, padrao) {
    try {
      const v = localStorage.getItem('5anos:' + chave);
      return v === null ? padrao : JSON.parse(v);
    } catch (e) {
      return padrao;
    }
  },
  gravar(chave, valor) {
    try {
      localStorage.setItem('5anos:' + chave, JSON.stringify(valor));
    } catch (e) {
      /* modo privativo, cota cheia — seguir a vida */
    }
  },
};
