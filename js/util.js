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
 * Escolhe o preset gráfico MEDINDO o aparelho.
 *
 * Antes aqui tinha um `if (ehTatil()) return 'baixo'` na frente de tudo, e era
 * o mesmo erro das árvores do parque: presumir o aparelho em vez de olhar para
 * ele. Todo celular caía no preset mais pobre — sem bloom, sem gota na lente e
 * desenhando um terço dos pixels de uma tela dpr 3, que o navegador depois
 * esticava. Um celular recente de 8 núcleos aguenta o preset do meio com folga.
 *
 * O toque continua contando, mas como um peso a mais e não como sentença: o
 * mesmo número de núcleos rende menos num chip de telefone, e a tela densa
 * cobra caro por pixel. Quem confere de verdade é o vigia de tempo de quadro do
 * `jogo.js`, que desce um degrau se o aparelho não segurar.
 */
export function qualidadeAutomatica() {
  const nucleos = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 4;
  const denso = (devicePixelRatio || 1) >= 2.5;

  let nota = 0;
  nota += nucleos >= 12 ? 3 : nucleos >= 8 ? 2 : nucleos >= 6 ? 1 : 0;
  nota += mem >= 8 ? 3 : mem >= 6 ? 2 : mem >= 4 ? 1 : 0;
  if (ehTatil()) nota -= 2;   // o mesmo núcleo rende menos num telefone
  if (denso) nota -= 1;       // e a tela densa cobra por pixel

  if (nota >= 4) return 'alto';
  if (nota >= 1) return 'medio';
  return 'baixo';
}

/* O preset baixo é para o jogo ficar mais LEVE, não mais pobre. Ele tinha 45%
   das árvores e 150 m de mundo desenhado, e como todo celular cai nele
   (`ehTatil()` acima), o parque chegava vazio no aparelho do Daniel e cheio no
   monitor. Árvore é barata — tronco e três esferas, com os materiais em cache —
   então quem economiza aqui são os pixels, as sombras e a chuva, não o cenário. */
/* `amostras` é o MSAA do alvo onde a cena é desenhada (ver `js/pos.js`): é o
   único antialiasing que este jogo pode ter, porque para a tela só vai o
   quadrado do passe final. Sem ele todo telhado, poste e cabo da roda-gigante
   fica em escada — é o que mais denunciava "brinquedo" na imagem.

   `sombraExt` é o meio-lado, em metros, do frustum da sombra. Ele acompanha o
   tamanho do mapa de propósito: 512 texels espalhados em 68 m dão 7 por metro,
   que é papa. Mapa menor, área menor, densidade parecida nos três presets. */
export const PRESETS = {
  alto:  { pixelRatio: 2,    sombra: 2048, chuva: 9000, bloomNiveis: 3, distancia: 260, arvores: 1,   gotas: 1, amostras: 4, sombraExt: 34, dof: 1 },
  medio: { pixelRatio: 1.5,  sombra: 1024, chuva: 4500, bloomNiveis: 2, distancia: 220, arvores: .9,  gotas: 1, amostras: 2, sombraExt: 28, dof: 1 },
  baixo: { pixelRatio: 1.25, sombra: 512,  chuva: 1800, bloomNiveis: 1, distancia: 200, arvores: .8,  gotas: 0, amostras: 2, sombraExt: 22, dof: 0 },
};

/** Da mais pesada para a mais leve — usado pelo vigia de tempo de quadro. */
export const ESCADA_QUALIDADE = ['alto', 'medio', 'baixo'];

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
