/* ═══════════════ materiais — texturas geradas em canvas, sem nenhum arquivo ═══════════════
   O realismo aqui não vem de polígono, vem de material e luz: mapa de cor,
   mapa de normal derivado da altura e mapa de aspereza (o que faz o asfalto
   parecer molhado), tudo desenhado em <canvas> na hora de carregar.
   ═══════════════════════════════════════════════════════════════════════════ */

import { SRGBColorSpace, RepeatWrapping, CanvasTexture, LinearFilter, LinearMipmapLinearFilter,
         BackSide, ShaderMaterial, SphereGeometry, Mesh, Scene, PMREMGenerator, Vector3, Vector2,
         Color, Shape, ExtrudeGeometry } from 'three';
import { sorteio, limita, mistura } from './util.js';

const cache = new Map();

function lembrado(chave, faz) {
  if (!cache.has(chave)) cache.set(chave, faz());
  return cache.get(chave);
}

export function limparCache() {
  for (const v of cache.values()) {
    if (v && v.dispose) v.dispose();
    else if (v && v.map) Object.values(v).forEach((t) => t && t.dispose && t.dispose());
  }
  cache.clear();
}

function tela(l, a) {
  const c = document.createElement('canvas');
  c.width = l;
  c.height = a;
  return c;
}

/* ── ruído ─────────────────────────────────────────────────────────────── */

/** Ruído de valor que fecha nas bordas, para a textura poder repetir sem emenda. */
function ruidoTileavel(l, a, celulas, octaves, semente) {
  const saida = new Float32Array(l * a);
  let amplitude = 1;
  let total = 0;

  for (let o = 0; o < octaves; o++) {
    const cx = celulas << o;
    const cy = celulas << o;
    const r = sorteio(semente + o * 7919);
    const grade = new Float32Array(cx * cy);
    for (let i = 0; i < grade.length; i++) grade[i] = r();

    for (let y = 0; y < a; y++) {
      const fy = (y / a) * cy;
      const y0 = Math.floor(fy) % cy;
      const y1 = (y0 + 1) % cy;
      const ty = fy - Math.floor(fy);
      const sy = ty * ty * (3 - 2 * ty);
      for (let x = 0; x < l; x++) {
        const fx = (x / l) * cx;
        const x0 = Math.floor(fx) % cx;
        const x1 = (x0 + 1) % cx;
        const tx = fx - Math.floor(fx);
        const sx = tx * tx * (3 - 2 * tx);
        const v00 = grade[y0 * cx + x0], v10 = grade[y0 * cx + x1];
        const v01 = grade[y1 * cx + x0], v11 = grade[y1 * cx + x1];
        const v = mistura(mistura(v00, v10, sx), mistura(v01, v11, sx), sy);
        saida[y * l + x] += v * amplitude;
      }
    }
    total += amplitude;
    amplitude *= 0.5;
  }

  for (let i = 0; i < saida.length; i++) saida[i] /= total;
  return saida;
}

/** Sobel sobre um mapa de altura -> mapa de normal em tangent space. */
function normalDaAltura(altura, l, a, forca = 2.2) {
  const c = tela(l, a);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(l, a);
  const d = img.data;
  const em = (x, y) => altura[((y + a) % a) * l + ((x + l) % l)];

  for (let y = 0; y < a; y++) {
    for (let x = 0; x < l; x++) {
      const dx =
        em(x - 1, y - 1) + 2 * em(x - 1, y) + em(x - 1, y + 1) -
        (em(x + 1, y - 1) + 2 * em(x + 1, y) + em(x + 1, y + 1));
      const dy =
        em(x - 1, y - 1) + 2 * em(x, y - 1) + em(x + 1, y - 1) -
        (em(x - 1, y + 1) + 2 * em(x, y + 1) + em(x + 1, y + 1));
      let nx = dx * forca, ny = dy * forca, nz = 1;
      const inv = 1 / Math.hypot(nx, ny, nz);
      nx *= inv; ny *= inv; nz *= inv;
      const i = (y * l + x) * 4;
      d[i] = (nx * 0.5 + 0.5) * 255;
      d[i + 1] = (ny * 0.5 + 0.5) * 255;
      d[i + 2] = (nz * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Canvas em tons de cinza a partir de um Float32Array. */
function cinzaDoMapa(mapa, l, a, min = 0, max = 1) {
  const c = tela(l, a);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(l, a);
  const d = img.data;
  for (let i = 0; i < mapa.length; i++) {
    const v = limita(mistura(min, max, mapa[i]), 0, 1) * 255;
    d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v;
    d[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function texturaDe(canvas, { cor = false, repete = [1, 1] } = {}) {
  const t = new CanvasTexture(canvas);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(repete[0], repete[1]);
  t.anisotropy = 8;
  t.minFilter = LinearMipmapLinearFilter;
  t.magFilter = LinearFilter;
  if (cor) t.colorSpace = SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/**
 * Ondulação da água: só o mapa de normal, para escorregar por cima da cor.
 *
 * A água do lago e a do Tâmisa eram cor chapada — e água parada de cor chapada
 * é a coisa que mais denuncia maquete. Aqui não entra reflexo de verdade
 * (caro), entra normal: a superfície deixa de ser um plano perfeito, então o
 * céu bate nela em ângulos diferentes a cada palmo e vira cintilação em vez de
 * chapa. Duas escalas de ruído, a larga mandando na forma e a fina quebrando a
 * silhueta de perto.
 *
 * Cada usuário deve pedir um `.clone()`: a imagem é compartilhada, mas
 * `repeat` e `offset` precisam ser de cada um, e é o `offset` que anima.
 */
export function ondulacao(semente = 7) {
  return lembrado(`ondulacao:${semente}`, () => {
    const L = 256, A = 256;
    const largo = ruidoTileavel(L, A, 4, 3, semente);
    const fino = ruidoTileavel(L, A, 13, 2, semente + 31);
    const altura = new Float32Array(L * A);
    for (let i = 0; i < altura.length; i++) altura[i] = largo[i] * 0.74 + fino[i] * 0.26;
    return texturaDe(normalDaAltura(altura, L, A, 1.4));
  });
}

/* ── geometria ─────────────────────────────────────────────────────────── */

/**
 * Caixa de cantos arredondados. O estilo pedido não tem quina viva em nada,
 * e uma esfera achatada vira jujuba — o meio certo é a caixa com bisel.
 * Reaproveitada em carro, caixote, lixeira e na fachada da agência.
 */
export function caixaArredondada(l, a, p, raio = 0.08, seg = 3) {
  const r = Math.min(raio, l / 2 - 0.001, a / 2 - 0.001, p / 2 - 0.001);
  const x = l / 2 - r;
  const y = a / 2 - r;
  const forma = new Shape();
  forma.moveTo(-x, -y - r);
  forma.lineTo(x, -y - r);
  forma.quadraticCurveTo(x + r, -y - r, x + r, -y);
  forma.lineTo(x + r, y);
  forma.quadraticCurveTo(x + r, y + r, x, y + r);
  forma.lineTo(-x, y + r);
  forma.quadraticCurveTo(-x - r, y + r, -x - r, y);
  forma.lineTo(-x - r, -y);
  forma.quadraticCurveTo(-x - r, -y - r, -x, -y - r);

  const geo = new ExtrudeGeometry(forma, {
    depth: p - r * 2,
    bevelEnabled: true,
    bevelThickness: r,
    bevelSize: r,
    bevelOffset: 0,
    bevelSegments: seg,
    curveSegments: seg,
  });
  geo.translate(0, 0, -(p - r * 2) / 2);
  geo.computeVertexNormals();
  return geo;
}

/* ── chão ──────────────────────────────────────────────────────────────── */

/**
 * Asfalto. O truque do "molhado" está no mapa de aspereza: poças escuras têm
 * aspereza quase zero, então refletem o céu e os postes com nitidez, enquanto
 * o resto continua fosco. É isso que o olho lê como chuva.
 */
export function asfalto(molhado = 1, semente = 11) {
  return lembrado(`asfalto:${molhado}:${semente}`, () => {
    const L = 512, A = 512;
    const grao = ruidoTileavel(L, A, 8, 5, semente);
    const manchas = ruidoTileavel(L, A, 3, 3, semente + 101);

    const c = tela(L, A);
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(L, A);
    const d = img.data;
    for (let i = 0; i < grao.length; i++) {
      // asfalto claro e quente: num mundo pastel, rua quase preta puxa
      // o quadro inteiro para baixo
      const base = 96 + grao[i] * 26;
      const escurece = manchas[i] * 10 * molhado;
      d[i * 4] = base - escurece + 3;
      d[i * 4 + 1] = base - escurece;
      d[i * 4 + 2] = base - escurece - 2;
      d[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);

    // remendos e bueiro: sem nenhum detalhe a via de 10 m vira um vazio cinza
    const rr = sorteio(semente + 555);
    ctx.globalAlpha = 0.09;
    for (let i = 0; i < 7; i++) {
      ctx.fillStyle = '#77746f';
      ctx.beginPath();
      ctx.ellipse(rr() * L, rr() * A, 26 + rr() * 70, 18 + rr() * 40, rr() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (let i = 0; i < 2; i++) {
      const bx = rr() * L, by = rr() * A;
      ctx.fillStyle = '#6f6c67';
      ctx.beginPath();
      ctx.arc(bx, by, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#5b5854';
      ctx.lineWidth = 2;
      for (let k = -3; k <= 3; k++) {
        ctx.beginPath();
        ctx.moveTo(bx - 11, by + k * 3.4);
        ctx.lineTo(bx + 11, by + k * 3.4);
        ctx.stroke();
      }
    }

    // Aspereza: quanto mais "mancha", mais lisa a superfície (poça d'água).
    // O piso da aspereza não pode ser baixo demais: espelho perfeito debaixo
    // de um céu claro devolve branco chapado e a rua vira manchada de tinta.
    // 0,2 já dá o reflexo molhado sem estourar.
    const asp = new Float32Array(grao.length);
    for (let i = 0; i < asp.length; i++) {
      const poca = Math.pow(limita((manchas[i] - 0.58) * 3.4, 0, 1), 1.6) * molhado;
      asp[i] = mistura(0.62 + grao[i] * 0.3, 0.2, poca);
    }

    return {
      map: texturaDe(c, { cor: true }),
      normalMap: texturaDe(normalDaAltura(grao, L, A, 0.45)),
      roughnessMap: texturaDe(cinzaDoMapa(asp, L, A)),
    };
  });
}

/** Calçada de lajotas grandes, com rejunte fundo. */
export function calcada(molhado = 1, semente = 23) {
  return lembrado(`calcada:${molhado}:${semente}`, () => {
    const L = 512, A = 512;
    const r = sorteio(semente);
    const grao = ruidoTileavel(L, A, 10, 4, semente);
    const altura = new Float32Array(L * A);

    const c = tela(L, A);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#8f8877';
    ctx.fillRect(0, 0, L, A);

    const cols = 4, linhas = 4, junta = 5;
    const lw = L / cols, lh = A / linhas;
    for (let y = 0; y < linhas; y++) {
      for (let x = 0; x < cols; x++) {
        const tom = 176 + r() * 26;
        ctx.fillStyle = `rgb(${tom | 0},${(tom - 3) | 0},${(tom - 8) | 0})`;
        ctx.fillRect(x * lw + junta / 2, y * lh + junta / 2, lw - junta, lh - junta);
      }
    }

    const img = ctx.getImageData(0, 0, L, A);
    const d = img.data;
    for (let i = 0; i < altura.length; i++) {
      const g = grao[i];
      d[i * 4] = limita(d[i * 4] * (0.82 + g * 0.32), 0, 255);
      d[i * 4 + 1] = limita(d[i * 4 + 1] * (0.82 + g * 0.32), 0, 255);
      d[i * 4 + 2] = limita(d[i * 4 + 2] * (0.82 + g * 0.32), 0, 255);
      altura[i] = d[i * 4] / 255 * 0.7 + g * 0.3;
    }
    ctx.putImageData(img, 0, 0);

    const asp = new Float32Array(altura.length);
    for (let i = 0; i < asp.length; i++) {
      const naJunta = altura[i] < 0.46 ? 1 : 0;
      asp[i] = mistura(mistura(0.75, 0.5, molhado), 0.12, naJunta * molhado);
    }

    return {
      map: texturaDe(c, { cor: true }),
      normalMap: texturaDe(normalDaAltura(altura, L, A, 1.3)),
      roughnessMap: texturaDe(cinzaDoMapa(asp, L, A)),
    };
  });
}

/** Paralelepípedo arredondado — a rua da cena 3. */
export function paralelepipedo(molhado = 1, semente = 37) {
  return lembrado(`pedra:${molhado}:${semente}`, () => {
    const L = 512, A = 512;
    const r = sorteio(semente);
    const cols = 16, linhas = 16;
    const centros = [];
    for (let y = 0; y < linhas; y++) {
      for (let x = 0; x < cols; x++) {
        centros.push({
          x: ((x + 0.5 + (y % 2) * 0.5 + (r() - 0.5) * 0.24) / cols) * L,
          y: ((y + 0.5 + (r() - 0.5) * 0.24) / linhas) * A,
          raio: (L / cols) * (0.44 + r() * 0.12),
          tom: 0.62 + r() * 0.38,
        });
      }
    }

    const altura = new Float32Array(L * A);
    const cores = new Float32Array(L * A);
    const passoX = L / cols, passoY = A / linhas;

    for (let y = 0; y < A; y++) {
      for (let x = 0; x < L; x++) {
        let melhor = 1e9, tom = 0.5;
        // só olha os centros vizinhos, senão vira O(n²) e trava o carregamento
        const gx = Math.floor(x / passoX), gy = Math.floor(y / passoY);
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const ix = (gx + dx + cols) % cols;
            const iy = (gy + dy + linhas) % linhas;
            const c0 = centros[iy * cols + ix];
            let ddx = x - c0.x, ddy = y - c0.y;
            if (ddx > L / 2) ddx -= L; else if (ddx < -L / 2) ddx += L;
            if (ddy > A / 2) ddy -= A; else if (ddy < -A / 2) ddy += A;
            const dist = Math.hypot(ddx, ddy) / c0.raio;
            if (dist < melhor) { melhor = dist; tom = c0.tom; }
          }
        }
        const i = y * L + x;
        altura[i] = limita(1 - Math.pow(melhor, 2.6), 0, 1);
        cores[i] = tom;
      }
    }

    const grao = ruidoTileavel(L, A, 24, 3, semente + 5);
    const c = tela(L, A);
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(L, A);
    const d = img.data;
    for (let i = 0; i < altura.length; i++) {
      const dome = 0.35 + altura[i] * 0.65;
      const v = cores[i] * dome * (0.78 + grao[i] * 0.42);
      d[i * 4] = limita(v * 208, 0, 255);
      d[i * 4 + 1] = limita(v * 196, 0, 255);
      d[i * 4 + 2] = limita(v * 178, 0, 255);
      d[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);

    const asp = new Float32Array(altura.length);
    for (let i = 0; i < asp.length; i++) {
      // a água empoça nas frestas — mas com piso alto de aspereza: em 0,08
      // cada fresta virava espelho e a rua parecia plástico-bolha
      const fresta = limita(1 - altura[i] * 2.2, 0, 1);
      asp[i] = mistura(0.78, 0.34, fresta * molhado);
    }

    return {
      map: texturaDe(c, { cor: true }),
      normalMap: texturaDe(normalDaAltura(altura, L, A, 0.85)),
      roughnessMap: texturaDe(cinzaDoMapa(asp, L, A)),
    };
  });
}

/** Grama do parque, vista de longe. */
export function grama(semente = 51) {
  return lembrado(`grama:${semente}`, () => {
    const L = 512, A = 512;
    const fino = ruidoTileavel(L, A, 40, 3, semente);
    const largo = ruidoTileavel(L, A, 4, 3, semente + 13);
    const c = tela(L, A);
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(L, A);
    const d = img.data;
    for (let i = 0; i < fino.length; i++) {
      const v = fino[i] * 0.55 + largo[i] * 0.45;
      // verde amarelado e suave: o verde saturado dava cara de tapete sintético
      d[i * 4] = 128 + v * 40;
      d[i * 4 + 1] = 152 + v * 40;
      d[i * 4 + 2] = 92 + v * 30;
      d[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return {
      map: texturaDe(c, { cor: true }),
      normalMap: texturaDe(normalDaAltura(fino, L, A, 1.6)),
      roughnessMap: texturaDe(cinzaDoMapa(fino, L, A, 0.72, 0.94)),
    };
  });
}

/* ── fachadas ──────────────────────────────────────────────────────────── */

/**
 * Fachada de prédio londrino: tijolo ou reboco, fileiras de janelas com
 * caixilho, cornija entre andares e loja no térreo. As janelas acesas viram
 * mapa de emissão — de noite é isso que enche a rua de vida.
 */
export function fachada({ semente = 1, andares = 5, tijolo = true, corBase = '#6b4a3e',
                          acesas = 0, corLuz = '#ffcf8f', loja = false, corLoja = '#7a2230',
                          corPorta = '#2f5a8c' } = {}) {
  const chave = `fachada:${semente}:${andares}:${tijolo}:${corBase}:${acesas}:${loja}:${corLoja}:${corPorta}`;
  return lembrado(chave, () => {
    // a textura tem exatamente a altura do prédio: nada de sobra nem de
    // andar cortado no topo, e o térreo cai certinho na base
    const L = 256;
    const alturaAndar = 128;
    const andaresDesenhados = andares;
    const A = alturaAndar * andaresDesenhados;
    const r = sorteio(semente);
    const c = tela(L, A);
    const ctx = c.getContext('2d');
    const luz = tela(L, A);
    const lctx = luz.getContext('2d');
    lctx.fillStyle = '#000';
    lctx.fillRect(0, 0, L, A);

    const base = new Color(corBase);
    const tom = (m) => `rgb(${limita(base.r * 255 * m, 0, 255) | 0},${limita(base.g * 255 * m, 0, 255) | 0},${limita(base.b * 255 * m, 0, 255) | 0})`;
    const BRANCO = '#fbf7ef';

    // parede pintada, com um degradê suavíssimo: chapado puro fica sem vida,
    // mancha de umidade estraga a alegria. o meio do caminho é isto
    const degrade = ctx.createLinearGradient(0, 0, 0, A);
    degrade.addColorStop(0, tom(1.05));
    degrade.addColorStop(1, tom(0.9));
    ctx.fillStyle = degrade;
    ctx.fillRect(0, 0, L, A);

    if (tijolo) {
      // tijolo de mesma família de cor e contraste baixíssimo: dá textura de
      // perto e some de longe, sem sujar o pastel
      const th = 12, tw = 48, junta = 2;
      for (let y = 0, linha = 0; y < A; y += th, linha++) {
        const desloca = (linha % 2) * (tw / 2);
        for (let x = -tw; x < L + tw; x += tw) {
          ctx.fillStyle = tom(0.97 + r() * 0.08);
          ctx.fillRect(x + desloca + junta, y + junta, tw - junta * 2, th - junta * 2);
        }
      }
    }

    // cantoneiras brancas nas laterais: é o que faz ler como casa geminada
    // pintada de Londres em vez de um bloco colorido
    ctx.fillStyle = BRANCO;
    ctx.fillRect(0, 0, 7, A);
    ctx.fillRect(L - 7, 0, 7, A);

    const colunas = 3;
    const margem = 26;
    const vaoL = (L - margem * 2) / colunas;
    const janL = vaoL * 0.56;
    const janA = alturaAndar * 0.52;

    for (let a = 0; a < andaresDesenhados; a++) {
      const topo = a * alturaAndar;
      const terreo = loja && a === andaresDesenhados - 1;

      // faixa branca separando os andares, nítida e limpa
      ctx.fillStyle = BRANCO;
      ctx.fillRect(0, topo + alturaAndar - 9, L, 7);

      if (terreo) {
        // Térreo de loja: porta de um lado e vitrine dividida do outro. Sem a
        // porta e sem os montantes, um vidro de 7 m virava outdoor em branco.
        const baseY = topo + 22;
        const baseA = alturaAndar - 40;
        ctx.fillStyle = corLoja;
        ctx.fillRect(0, topo, L, alturaAndar);

        const gv = ctx.createLinearGradient(0, baseY, 0, baseY + baseA);
        gv.addColorStop(0, '#ffeccb');
        gv.addColorStop(1, '#f3cd94');

        // porta: ombreira branca, vidro alto e uma maçaneta dourada
        const portaL = 46;
        const px = 18;
        ctx.fillStyle = BRANCO;
        ctx.fillRect(px - 5, baseY - 5, portaL + 10, baseA + 5);
        ctx.fillStyle = gv;
        ctx.fillRect(px, baseY, portaL, baseA);
        ctx.fillStyle = BRANCO;
        ctx.fillRect(px, baseY + baseA * 0.6, portaL, 4);
        ctx.fillStyle = '#d8ab4e';
        ctx.beginPath();
        ctx.arc(px + portaL - 9, baseY + baseA * 0.72, 3.4, 0, Math.PI * 2);
        ctx.fill();
        lctx.globalAlpha = 0.34;
        lctx.fillStyle = corLuz;
        lctx.fillRect(px, baseY, portaL, baseA);

        // vitrine dividida em três panos por montantes brancos
        const vx = px + portaL + 16;
        const vl = L - vx - 18;
        ctx.fillStyle = BRANCO;
        ctx.fillRect(vx - 6, baseY - 6, vl + 12, baseA * 0.78 + 12);
        ctx.fillStyle = gv;
        ctx.fillRect(vx, baseY, vl, baseA * 0.78);
        lctx.fillStyle = corLuz;
        lctx.fillRect(vx, baseY, vl, baseA * 0.78);
        lctx.globalAlpha = 1;
        ctx.fillStyle = BRANCO;
        for (let m = 1; m < 3; m++) {
          ctx.fillRect(vx + (vl / 3) * m - 3, baseY, 6, baseA * 0.78);
        }
        // soleira de pedra sob a vitrine
        ctx.fillRect(vx - 8, baseY + baseA * 0.78 + 4, vl + 16, 9);

        // toldinho listrado sobre a vitrine
        for (let i = 0; i < 6; i++) {
          ctx.fillStyle = i % 2 ? BRANCO : corLoja;
          ctx.fillRect(vx + (vl / 6) * i, baseY - 20, vl / 6, 12);
        }
        continue;
      }

      // Térreo de casa (sem loja): porta colorida com bandeira em leque e
      // degraus. É o detalhe que faz uma rua pastel virar Notting Hill.
      if (!loja && a === andaresDesenhados - 1) {
        const pl = 52, pa = alturaAndar - 46;
        const px = 30;
        const py = topo + alturaAndar - pa - 10;

        ctx.fillStyle = BRANCO;
        ctx.fillRect(px - 9, py - 26, pl + 18, pa + 26);
        ctx.fillStyle = corPorta;
        ctx.fillRect(px, py, pl, pa);
        // bandeira em leque acima da porta
        ctx.fillStyle = '#e9f0f6';
        ctx.beginPath();
        ctx.arc(px + pl / 2, py - 2, pl / 2 - 2, Math.PI, 0);
        ctx.fill();
        ctx.strokeStyle = BRANCO;
        ctx.lineWidth = 2.5;
        for (let k = 1; k < 5; k++) {
          const ang = Math.PI + (Math.PI / 5) * k;
          ctx.beginPath();
          ctx.moveTo(px + pl / 2, py - 2);
          ctx.lineTo(px + pl / 2 + Math.cos(ang) * (pl / 2 - 2), py - 2 + Math.sin(ang) * (pl / 2 - 2));
          ctx.stroke();
        }
        // maçaneta e degrau
        ctx.fillStyle = '#d8ab4e';
        ctx.beginPath();
        ctx.arc(px + pl - 11, py + pa * 0.5, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#e4ded2';
        ctx.fillRect(px - 14, topo + alturaAndar - 11, pl + 28, 9);

        // uma janela grande ao lado da porta
        const jx = px + pl + 30;
        const jl = L - jx - 26;
        const jy = py + 6;
        const ja = pa - 18;
        ctx.fillStyle = BRANCO;
        ctx.fillRect(jx - 8, jy - 8, jl + 16, ja + 16);
        const gj = ctx.createLinearGradient(jx, jy, jx + jl * 0.6, jy + ja);
        gj.addColorStop(0, '#cfe0ee');
        gj.addColorStop(1, '#8fa6bd');
        ctx.fillStyle = gj;
        ctx.fillRect(jx, jy, jl, ja);
        ctx.strokeStyle = BRANCO;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(jx + jl / 2, jy);
        ctx.lineTo(jx + jl / 2, jy + ja);
        ctx.moveTo(jx, jy + ja / 2);
        ctx.lineTo(jx + jl, jy + ja / 2);
        ctx.stroke();
        continue;
      }

      for (let j = 0; j < colunas; j++) {
        const x = margem + j * vaoL + (vaoL - janL) / 2;
        const y = topo + (alturaAndar - janA) / 2;

        // moldura branca sólida em volta da janela
        ctx.fillStyle = BRANCO;
        ctx.fillRect(x - 8, y - 8, janL + 16, janA + 16);
        // peitoril
        ctx.fillRect(x - 12, y + janA + 6, janL + 24, 6);

        const ligada = r() < acesas;
        if (ligada) {
          const brilho = 0.7 + r() * 0.3;
          ctx.fillStyle = corLuz;
          ctx.globalAlpha = brilho;
          ctx.fillRect(x, y, janL, janA);
          ctx.globalAlpha = 1;
          lctx.fillStyle = corLuz;
          lctx.globalAlpha = brilho;
          lctx.fillRect(x, y, janL, janA);
          lctx.globalAlpha = 1;
        } else {
          // vidro claro refletindo o céu, não um buraco preto
          const g = ctx.createLinearGradient(x, y, x + janL * 0.6, y + janA);
          g.addColorStop(0, '#cfe0ee');
          g.addColorStop(0.55, '#9fb6cc');
          g.addColorStop(1, '#7d93aa');
          ctx.fillStyle = g;
          ctx.fillRect(x, y, janL, janA);
        }

        // caixilho branco em cruz
        ctx.strokeStyle = BRANCO;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(x + janL / 2, y);
        ctx.lineTo(x + janL / 2, y + janA);
        ctx.moveTo(x, y + janA / 2);
        ctx.lineTo(x + janL, y + janA / 2);
        ctx.stroke();
      }
    }

    return {
      map: texturaDe(c, { cor: true }),
      emissiveMap: acesas > 0 ? texturaDe(luz, { cor: true }) : null,
    };
  });
}

/**
 * Placa com texto, para o letreiro da agência. Sem isto o letreiro é uma barra
 * dourada e a chegada perde a graça — o nome tem que estar legível, porque é
 * o mesmo que está no site das cartas.
 */
export function placaTexto(linhas, { largura = 1024, altura = 256, corTexto = '#f8eeda',
                                     corFundo = '#4a1219', fonte = 'Alfa Slab One' } = {}) {
  return lembrado(`placa:${linhas.join('|')}:${corTexto}:${corFundo}`, () => {
    const c = tela(largura, altura);
    const ctx = c.getContext('2d');
    ctx.fillStyle = corFundo;
    ctx.fillRect(0, 0, largura, altura);

    // filete dourado em volta
    ctx.strokeStyle = '#c9973f';
    ctx.lineWidth = 8;
    ctx.strokeRect(10, 10, largura - 20, altura - 20);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const alturaLinha = altura / (linhas.length + 0.6);
    linhas.forEach((linha, i) => {
      const tam = Math.round(alturaLinha * (linhas.length === 1 ? 0.62 : 0.72));
      // a fonte pode não ter carregado; a serifa do sistema segura o texto
      ctx.font = `${tam}px "${fonte}", Georgia, serif`;
      ctx.fillStyle = corTexto;
      const y = alturaLinha * (i + 0.8);
      ctx.fillText(linha, largura / 2, y);
    });

    const t = texturaDe(c, { cor: true });
    t.wrapS = t.wrapT = RepeatWrapping;
    return { map: t };
  });
}

/* ── céu e iluminação do ambiente ──────────────────────────────────────── */

/*
 * Projeção normal, e a abóbada é grande de verdade (raio ~450, dentro do plano
 * distante da câmera).
 *
 * A primeira versão usava o truque de skybox `gl_Position = p.xyww` numa esfera
 * de raio 1 em volta da câmera. Numa esfera que ENVOLVE a câmera metade dos
 * vértices fica atrás dela, com w negativo, e forçar z=w faz a clipagem
 * homogênea produzir buracos: a cena da noite ficava com um rasgo preto no
 * meio do céu, medido em (0,0,0), enquanto as bordas apareciam normais.
 */
const VERT_CEU = `
varying vec3 vDir;
void main(){
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAG_CEU = `
varying vec3 vDir;
uniform vec3 corAlto, corHorizonte, corBaixo, corSol, dirSol;
uniform float tamanhoSol, forcaSol, neblina;
uniform vec3 corNuvemFina, corNuvemDensa;
uniform float nuvens, nuvemCobertura, nuvemEscala, tempoCeu;
uniform vec2 nuvemVento;

float hashCeu(vec2 p){
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

/* Ruído de valor com interpolação suave. Vale mais que o ruído puro por um
   motivo prático: quina de célula em nuvem lê como bloco, e bloco no céu é a
   coisa mais artificial que existe. */
float ruidoCeu(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hashCeu(i);
  float b = hashCeu(i + vec2(1.0, 0.0));
  float c = hashCeu(i + vec2(0.0, 1.0));
  float d = hashCeu(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbmCeu(vec2 p){
  float v = 0.0, amp = 0.5;
  for (int i = 0; i < 3; i++){
    v += ruidoCeu(p) * amp;
    p = p * 2.03 + vec2(11.7, 5.3);
    amp *= 0.5;
  }
  return v;
}

void main(){
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 cor = mix(corHorizonte, corAlto, smoothstep(0.0, 0.55, h));
  cor = mix(corBaixo, cor, smoothstep(-0.28, 0.02, h));

  // brilho difuso ao redor do sol + o disco em si
  float cosA = max(dot(d, normalize(dirSol)), 0.0);
  cor += corSol * pow(cosA, tamanhoSol) * forcaSol;
  cor += corSol * pow(cosA, 3.0) * forcaSol * 0.16;

  /* Nuvem. O céu era um degradê liso ocupando um terço do quadro — numa
     Londres de chuva isso é o que mais entregava "cenário" em vez de céu.

     A conta é a de sempre para nuvem barata: projeta a direção do olhar num
     plano lá em cima e sorteia ruído nesse plano.

     Duas medidas mandaram nos números aqui, e sem elas a nuvem simplesmente
     não aparecia. A primeira: o jogo NUNCA olha para o alto — com a câmera
     mirando 5° abaixo do horizonte e 54° de abertura vertical, o topo do
     quadro fica a 22°, ou seja, todo o céu jogável cabe em h de 0 a 0,37.
     Máscara que só abria em 0,30 deixava a nuvem numa tira invisível no topo.
     A segunda: dividir por h joga a projeção para o infinito rente ao
     horizonte, então o divisor leva um "+ 0,14". Isso mantém a perspectiva
     (nuvem menor ao longe) sem a explosão que virava listra esticada — e de
     quebra deixa a coordenada num intervalo em que o ruído tem célula
     suficiente para desenhar forma. */
  if (nuvens > 0.001) {
    float mascara = smoothstep(0.004, 0.085, h);
    vec2 plano = d.xz / (h + 0.14);
    vec2 p = plano * nuvemEscala + nuvemVento * tempoCeu;
    /* Normalizado, senão a cobertura pedida mente. As três oitavas somam no
       máximo 0.875 e ficam em torno de 0.44, então um corte de 0.34 — que a
       gente escreve pensando "66% de cobertura" — caía ABAIXO da média e
       fechava o céu inteiro. Foi assim que a cena da chuva virou uma chapa
       leitosa sem degradê nenhum. */
    float n = fbmCeu(p) / 0.875;
    float corte = 1.0 - nuvemCobertura;
    /* Faixa estreita de propósito: o que faz ler como nuvem é a BORDA entre o
       furo e o corpo. Rampa larga devolve o mesmo cinza médio em todo lugar,
       que é neblina, não nuvem. */
    float dens = smoothstep(corte, corte + 0.20, n) * mascara * nuvens;

    /* Nuvem é vista POR BAIXO, e isso decide as cores: onde ela é fina a luz
       atravessa e ela é clara; onde engrossa, a barriga fica pesada e escura.
       (À noite inverte, e por isso a cor vem da fase: aí é o brilho da cidade
       que acende justamente a barriga mais grossa.) */
    vec3 corN = mix(corNuvemFina, corNuvemDensa, smoothstep(corte, corte + 0.34, n));
    /* A borda fina é onde o sol atravessa, e é o que faz a nuvem parecer
       fotografada em vez de pintada. Por isso o realce entra proporcional ao
       que FALTA de densidade. */
    corN += corSol * pow(cosA, 8.0) * forcaSol * 0.55 * (1.0 - dens);
    cor = mix(cor, corN, dens);
  }

  // banho de neblina perto do horizonte: é o que dá a Londres enevoada
  cor = mix(cor, corHorizonte, neblina * (1.0 - smoothstep(-0.05, 0.42, h)));
  gl_FragColor = vec4(cor, 1.0);
}`;

/**
 * Cria a abóbada do céu e devolve também o env map derivado dela, para que
 * todo material reflita exatamente o céu que está no alto.
 */
export function criarCeu(renderer, paleta) {
  const uniforms = {
    corAlto: { value: new Color(paleta.ceuAlto) },
    corHorizonte: { value: new Color(paleta.ceuHorizonte) },
    corBaixo: { value: new Color(paleta.ceuBaixo) },
    corSol: { value: new Color(paleta.corSol) },
    dirSol: { value: new Vector3().fromArray(paleta.dirSol).normalize() },
    tamanhoSol: { value: paleta.tamanhoSol ?? 160 },
    forcaSol: { value: paleta.forcaSol ?? 1 },
    neblina: { value: paleta.neblinaCeu ?? 0.35 },
    nuvens: { value: paleta.nuvens ?? 0 },
    nuvemCobertura: { value: paleta.nuvemCobertura ?? 0.5 },
    nuvemEscala: { value: paleta.nuvemEscala ?? 0.09 },
    nuvemVento: { value: new Vector2().fromArray(paleta.nuvemVento ?? [0.004, 0.0015]) },
    corNuvemFina: { value: new Color(paleta.corNuvemFina ?? '#ffffff') },
    corNuvemDensa: { value: new Color(paleta.corNuvemDensa ?? '#9aa3ad') },
    tempoCeu: { value: 0 },
  };

  const malha = new Mesh(
    new SphereGeometry(1, 40, 24),
    new ShaderMaterial({
      uniforms,
      vertexShader: VERT_CEU,
      fragmentShader: FRAG_CEU,
      side: BackSide,
      depthWrite: false,
      toneMapped: false,
      fog: false,
    })
  );
  malha.frustumCulled = false;
  malha.renderOrder = -1000;

  const pmrem = new PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const cenaTemp = new Scene();
  const copia = malha.clone();
  copia.material = malha.material;
  copia.scale.setScalar(50);
  cenaTemp.add(copia);
  const alvo = pmrem.fromScene(cenaTemp, 0.04, 0.1, 200);
  pmrem.dispose();
  cenaTemp.remove(copia);

  return { malha, ambiente: alvo.texture, uniforms, alvo };
}
