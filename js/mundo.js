/* ═══════════════ o mundo ═══════════════
   A pista é construída em blocos de 24 m que se reciclam: quando a menina
   passa de um bloco, ele é remontado lá na frente. Como as geometrias e os
   materiais são compartilhados, remontar custa quase nada.

   Os marcos de Londres (Big Ben, o Parlamento, a roda-gigante) ficam a uma
   distância fixa da câmera e acompanham o trajeto, então nunca são alcançados
   — é o mesmo truque de fundo dos cenários de teatro.
   ═════════════════════════════════════════ */

import { Group, Mesh, MeshStandardMaterial, MeshPhysicalMaterial, BoxGeometry, PlaneGeometry,
         CylinderGeometry, SphereGeometry, ConeGeometry, TorusGeometry, CircleGeometry,
         DirectionalLight, HemisphereLight, PointLight, Color, DoubleSide, FogExp2,
         BufferGeometry, Float32BufferAttribute, ShaderMaterial, LineSegments, AdditiveBlending,
         NormalBlending,
         Vector3 } from 'three';
import { TAU, mistura, sorteio } from './util.js';
import * as Mat from './materiais.js';

export const BLOCO = 24;
export const LARGURA_FAIXA = 2;
export const FAIXAS = [-LARGURA_FAIXA, 0, LARGURA_FAIXA];
const ALTURA_ANDAR = 3.4;

/* Geometria da rua num lugar só. A via é larga o suficiente para caber carro
   estacionado no meio-fio sem encostar na faixa de fora (que vai até x≈2,3). */
const LARGURA_VIA = 10;
const BORDA = LARGURA_VIA / 2;          // meio-fio em x = ±5
const LARGURA_CALCADA = 4;              // calçada de 5 a 9
const FRENTE_PREDIO = BORDA + LARGURA_CALCADA;   // fachada em x = ±9
const FAIXA_CARRO = 4.3;                // eixo do carro estacionado

/* ── chão ──────────────────────────────────────────────────────────────── */

function materialChao(texturas, repete, tinta) {
  const m = new MeshStandardMaterial({
    map: texturas.map,
    normalMap: texturas.normalMap,
    roughnessMap: texturas.roughnessMap,
    roughness: 1,
    metalness: 0.06,
    color: tinta ? new Color(tinta) : new Color('#ffffff'),
  });
  [m.map, m.normalMap, m.roughnessMap].forEach((t) => t && t.repeat.set(repete[0], repete[1]));
  return m;
}

function criarChao(fase, comprimento) {
  const g = new Group();
  const larguraVia = LARGURA_VIA;

  if (fase.tipo === 'parque') {
    const gramaTex = Mat.grama(fase.semente);
    const caminhoTex = Mat.calcada(fase.molhado, fase.semente + 3);

    const grama = new Mesh(
      new PlaneGeometry(120, comprimento),
      materialChao(gramaTex, [40, comprimento / 3])
    );
    grama.rotation.x = -Math.PI / 2;
    grama.position.y = -0.06;
    grama.receiveShadow = true;
    g.add(grama);

    const caminho = new Mesh(
      new PlaneGeometry(larguraVia, comprimento),
      materialChao(caminhoTex, [3, comprimento / 3], '#d9c49b')
    );
    caminho.rotation.x = -Math.PI / 2;
    caminho.receiveShadow = true;
    g.add(caminho);

    // o lago, do lado esquerdo
    const lago = new Mesh(
      new PlaneGeometry(46, comprimento),
      new MeshPhysicalMaterial({
        color: new Color(fase.corAgua || '#1b2a2e'),
        roughness: 0.045, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.03,
      })
    );
    lago.rotation.x = -Math.PI / 2;
    lago.position.set(-38, -0.02, 0);
    g.add(lago);
    return g;
  }

  const viaTex = fase.pedra ? Mat.paralelepipedo(fase.molhado, fase.semente)
                            : Mat.asfalto(fase.molhado, fase.semente);
  const via = new Mesh(
    new PlaneGeometry(larguraVia, comprimento),
    materialChao(viaTex, [fase.pedra ? 6 : 3, comprimento / (fase.pedra ? 2.6 : 6)])
  );
  via.rotation.x = -Math.PI / 2;
  via.receiveShadow = true;
  g.add(via);

  const calcTex = Mat.calcada(fase.molhado, fase.semente + 7);
  for (const lado of [-1, 1]) {
    const c = new Mesh(
      new PlaneGeometry(LARGURA_CALCADA, comprimento),
      materialChao(calcTex, [2, comprimento / 4])
    );
    c.rotation.x = -Math.PI / 2;
    c.position.set(lado * (BORDA + LARGURA_CALCADA / 2), 0.16, 0);
    c.receiveShadow = true;
    g.add(c);

    // meio-fio
    const meioFio = new Mesh(
      new BoxGeometry(0.28, 0.18, comprimento),
      new MeshStandardMaterial({ color: new Color('#cfc7ba'), roughness: 0.7 })
    );
    meioFio.position.set(lado * (larguraVia / 2 + 0.14), 0.08, 0);
    meioFio.receiveShadow = true;
    g.add(meioFio);
  }
  return g;
}

/* ── prédios ───────────────────────────────────────────────────────────── */

function prepararFachadas(fase, preset) {
  const variantes = [];
  // menos variantes em máquina fraca: cada uma é uma textura na GPU
  const quantas = preset.sombra >= 2048 ? 5 : preset.sombra >= 1024 ? 4 : 3;
  for (let v = 0; v < quantas; v++) {
    for (let andares = 3; andares <= 6; andares++) {
      const t = Mat.fachada({
        semente: fase.semente * 31 + v * 17 + andares,
        andares,
        tijolo: v % 2 === 0,
        corBase: fase.coresPredio[v % fase.coresPredio.length],
        acesas: fase.janelasAcesas,
        corLuz: fase.corJanela || '#ffcf8f',
        loja: fase.lojas && (v + andares) % 3 === 0,
        // o índice mistura variante e andares para as lojas e as portas não
        // saírem todas da mesma cor, como aconteceu na primeira tentativa
        corLoja: fase.coresLoja ? fase.coresLoja[(v + andares) % fase.coresLoja.length] : '#7a2230',
        corPorta: fase.coresPorta ? fase.coresPorta[(v * 2 + andares) % fase.coresPorta.length] : '#2f5a8c',
      });
      variantes.push({
        andares,
        material: new MeshStandardMaterial({
          map: t.map,
          emissiveMap: t.emissiveMap || null,
          emissive: t.emissiveMap ? new Color(fase.corJanela || '#ffcf8f') : new Color('#000'),
          emissiveIntensity: t.emissiveMap ? (fase.forcaJanela ?? 1.4) : 0,
          roughness: 0.92,
          metalness: 0.02,
        }),
      });
    }
  }
  return variantes;
}

const geoCubo = new BoxGeometry(1, 1, 1);

/**
 * Uma casa da fileira. A frente dela olha para a rua no eixo X, então a
 * largura visível é a extensão em Z — é isso que faz a rua parecer uma
 * fileira de casas geminadas de larguras diferentes, e não uma parede só.
 */
function predio(r, fachadas, lado) {
  const escolha = fachadas[Math.floor(r() * fachadas.length)];
  const altura = escolha.andares * ALTURA_ANDAR;
  const largura = r.entre(6.5, 10.5);   // ao longo da rua (Z)
  const profundidade = 9;               // para dentro do quarteirão (X)

  const g = new Group();
  const corpo = new Mesh(geoCubo, escolha.material);
  corpo.scale.set(profundidade, altura, largura);
  corpo.position.y = altura / 2;
  corpo.castShadow = true;
  corpo.receiveShadow = true;
  g.add(corpo);

  // cornija no topo, que é o que dá o perfil londrino
  const cornija = new Mesh(geoCubo, materialCornija());
  cornija.scale.set(profundidade + 0.5, 0.42, largura + 0.3);
  cornija.position.y = altura + 0.2;
  cornija.castShadow = true;
  g.add(cornija);

  // chaminés
  const quantas = r.inteiro(1, 3);
  for (let i = 0; i < quantas; i++) {
    const ch = new Mesh(geoCubo, materialChamine());
    const l = r.entre(0.5, 0.9);
    ch.scale.set(l, r.entre(0.9, 1.8), l);
    ch.position.set(r.entre(-2, 2), altura + 0.4 + ch.scale.y / 2, r.entre(-largura / 3, largura / 3));
    ch.castShadow = true;
    g.add(ch);
  }

  g.position.x = lado * (FRENTE_PREDIO + profundidade / 2);
  return { grupo: g, largura };
}

let _matCornija = null, _matChamine = null;
function materialCornija() {
  if (!_matCornija) _matCornija = new MeshStandardMaterial({ color: new Color('#fbf7ef'), roughness: 0.72 });
  return _matCornija;
}
function materialChamine() {
  if (!_matChamine) _matChamine = new MeshStandardMaterial({ color: new Color('#d9cdbd'), roughness: 0.8 });
  return _matChamine;
}

/* ── adereços de rua ───────────────────────────────────────────────────── */

/**
 * Cache de protótipos de adereço. O clone compartilha geometria e material com
 * o protótipo, o que é ótimo para memória — mas quem descartar precisa lembrar
 * de limpar este cache também (ver limparProps e o dispose do mundo).
 */
const cacheProps = {};
function prop(chave, faz) {
  if (!cacheProps[chave]) cacheProps[chave] = faz();
  return cacheProps[chave].clone(true);
}

/** Descarta os protótipos de adereço e esvazia o cache. */
function limparProps() {
  for (const chave in cacheProps) {
    cacheProps[chave].traverse((o) => {
      if (o.isMesh) {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
        }
      }
    });
    delete cacheProps[chave];
  }
}

function fazPoste(corLuz, forcaHalo = 0.02) {
  const g = new Group();
  // verde-garrafa quase preto, como os postes de Londres, mas sem virar
  // silhueta chapada no meio de um cenário claro
  const matFerro = new MeshStandardMaterial({ color: new Color('#42544c'), roughness: 0.38, metalness: 0.45 });
  const base = new Mesh(new CylinderGeometry(0.2, 0.28, 0.6, 14), matFerro);
  base.position.y = 0.3;
  g.add(base);
  const anel = new Mesh(new TorusGeometry(0.19, 0.05, 8, 16), matFerro);
  anel.position.y = 0.66;
  anel.rotation.x = Math.PI / 2;
  g.add(anel);
  const haste = new Mesh(new CylinderGeometry(0.075, 0.11, 4.4, 14), matFerro);
  haste.position.y = 2.7;
  g.add(haste);
  const braco = new Mesh(new TorusGeometry(0.5, 0.06, 8, 14, Math.PI / 2), matFerro);
  braco.position.set(0, 4.9, 0);
  braco.rotation.y = Math.PI / 2;
  g.add(braco);

  // luminária de vidro: uma caixinha quente com chapéu e um pingente, em vez
  // do cone branco de antes, que virava um triângulo estranho contra o céu
  const lanterna = new Group();
  lanterna.position.set(0, 4.62, 0.5);
  const vidro = new Mesh(
    new CylinderGeometry(0.19, 0.13, 0.42, 4),
    new MeshStandardMaterial({
      color: new Color(corLuz), emissive: new Color(corLuz),
      emissiveIntensity: 5, roughness: 1,
    })
  );
  lanterna.add(vidro);
  const chapeu = new Mesh(new ConeGeometry(0.27, 0.2, 4), matFerro);
  chapeu.position.y = 0.3;
  chapeu.rotation.y = Math.PI / 4;
  lanterna.add(chapeu);
  const pingente = new Mesh(new SphereGeometry(0.05, 8, 6), matFerro);
  pingente.position.y = -0.24;
  lanterna.add(pingente);
  g.add(lanterna);

  // cone de luz visível na neblina — só nas cenas escuras. Contra um céu
  // claro ele aparecia como um triângulo branco flutuando.
  if (forcaHalo > 0.001) {
    const halo = new Mesh(
      new ConeGeometry(2.1, 5, 14, 1, true),
      new ShaderMaterial({
        transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide,
        uniforms: { cor: { value: new Color(corLuz) }, forca: { value: forcaHalo } },
        vertexShader: `varying float vY; void main(){ vY = uv.y;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `varying float vY; uniform vec3 cor; uniform float forca;
          void main(){ gl_FragColor = vec4(cor, pow(vY, 2.2) * forca); }`,
      })
    );
    halo.position.set(0, 2.3, 0.5);
    g.add(halo);
  }

  g.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  return g;
}

/**
 * Cabine telefônica. Tem que ser construída como armação: na primeira versão
 * eu fiz uma caixa vermelha sólida e enfiei o vidro dentro dela, então o vidro
 * ficava invisível e a cabine virava uma laje vermelha sem leitura nenhuma.
 * Agora são cantoneiras, travessas e vidro à vista entre elas.
 */
function fazCabineTelefonica() {
  const g = new Group();
  const matVermelho = new MeshStandardMaterial({ color: new Color('#c0293c'), roughness: 0.3, metalness: 0.12 });
  const matVidro = new MeshPhysicalMaterial({
    color: new Color('#dcecf4'), roughness: 0.08, metalness: 0.05,
    transparent: true, opacity: 0.55, clearcoat: 1,
    emissive: new Color('#8a6a2c'), emissiveIntensity: 0.35,
  });
  const L = 1.02, ALTO = 2.35;

  // vidro primeiro, para as travessas ficarem por cima dele
  const vidro = new Mesh(Mat.caixaArredondada(L - 0.1, ALTO - 0.5, L - 0.1, 0.04, 2), matVidro);
  vidro.position.y = 0.3 + (ALTO - 0.5) / 2;
  g.add(vidro);

  const base = new Mesh(Mat.caixaArredondada(L + 0.1, 0.32, L + 0.1, 0.06, 2), matVermelho);
  base.position.y = 0.16;
  base.castShadow = true;
  g.add(base);

  // cantoneiras
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const posto = new Mesh(Mat.caixaArredondada(0.15, ALTO, 0.15, 0.04, 2), matVermelho);
      posto.position.set(sx * (L / 2 - 0.06), 0.3 + ALTO / 2, sz * (L / 2 - 0.06));
      posto.castShadow = true;
      g.add(posto);
    }
  }
  // travessas horizontais dividindo os vidros
  for (const y of [0.95, 1.62, 2.28]) {
    const travessa = new Mesh(Mat.caixaArredondada(L + 0.02, 0.09, L + 0.02, 0.03, 2), matVermelho);
    travessa.position.y = y;
    g.add(travessa);
  }

  // coroa, tabuleta e cúpula
  const friso = new Mesh(Mat.caixaArredondada(L + 0.16, 0.34, L + 0.16, 0.07, 2), matVermelho);
  friso.position.y = 2.72;
  friso.castShadow = true;
  g.add(friso);
  const placa = new Mesh(new BoxGeometry(L - 0.06, 0.19, 0.03), new MeshStandardMaterial({
    color: new Color('#fdf4e2'), emissive: new Color('#ffdca0'),
    emissiveIntensity: 0.8, roughness: 0.6,
  }));
  placa.position.set(0, 2.72, (L + 0.16) / 2 + 0.01);
  g.add(placa);
  const teto = new Mesh(Mat.caixaArredondada(L + 0.06, 0.14, L + 0.06, 0.05, 2), matVermelho);
  teto.position.y = 2.95;
  g.add(teto);
  const cupula = new Mesh(new SphereGeometry(0.22, 14, 8, 0, TAU, 0, Math.PI / 2), matVermelho);
  cupula.position.y = 3;
  g.add(cupula);

  return g;
}

function fazCaixaCorreio() {
  const g = new Group();
  const matVermelho = new MeshStandardMaterial({ color: new Color('#c0293c'), roughness: 0.32, metalness: 0.1 });
  const corpo = new Mesh(new CylinderGeometry(0.33, 0.35, 1.25, 20), matVermelho);
  corpo.position.y = 0.62;
  g.add(corpo);
  const topo = new Mesh(new SphereGeometry(0.345, 20, 10, 0, TAU, 0, Math.PI / 2), matVermelho);
  topo.position.y = 1.25;
  g.add(topo);
  const boca = new Mesh(new BoxGeometry(0.5, 0.09, 0.1), new MeshStandardMaterial({ color: new Color('#1a1416'), roughness: 0.8 }));
  boca.position.set(0, 1.02, 0.32);
  g.add(boca);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

/**
 * Carrinho estacionado no meio-fio. Não colide — fica fora das faixas — e
 * serve só para a rua não ficar um corredor de asfalto vazio. Formas
 * arredondadas e cor pastel, no espírito de desenho animado.
 */
function fazCarrinho(cor) {
  const g = new Group();
  const matPintura = new MeshStandardMaterial({
    color: new Color(cor), roughness: 0.26, metalness: 0.12,
  });
  const matVidro = new MeshStandardMaterial({
    color: new Color('#a8c8dc'), roughness: 0.1, metalness: 0.25,
  });
  const matPneu = new MeshStandardMaterial({ color: new Color('#2b2830'), roughness: 0.75 });
  const matCromo = new MeshStandardMaterial({ color: new Color('#e6e2d8'), roughness: 0.25, metalness: 0.7 });

  // caixa arredondada em vez de esfera achatada: a esfera dava jujuba,
  // a caixa com bisel lê como carrinho de desenho
  const corpo = new Mesh(Mat.caixaArredondada(1.42, 0.56, 3.2, 0.2, 3), matPintura);
  corpo.position.y = 0.62;
  corpo.castShadow = true;
  g.add(corpo);

  const capo = new Mesh(Mat.caixaArredondada(1.32, 0.24, 1.0, 0.13, 3), matPintura);
  capo.position.set(0, 0.96, 1.06);
  g.add(capo);

  const cabine = new Mesh(Mat.caixaArredondada(1.26, 0.54, 1.4, 0.18, 3), matVidro);
  cabine.position.set(0, 1.16, -0.28);
  cabine.castShadow = true;
  g.add(cabine);

  const teto = new Mesh(Mat.caixaArredondada(1.24, 0.15, 1.36, 0.14, 3), matPintura);
  teto.position.set(0, 1.46, -0.3);
  teto.castShadow = true;
  g.add(teto);

  const bagageiro = new Mesh(Mat.caixaArredondada(1.3, 0.27, 0.86, 0.13, 3), matPintura);
  bagageiro.position.set(0, 0.98, -1.28);
  g.add(bagageiro);

  for (const z of [-1.12, 1.16]) {
    for (const x of [-0.74, 0.74]) {
      const roda = new Mesh(new CylinderGeometry(0.31, 0.31, 0.22, 18), matPneu);
      roda.rotation.z = Math.PI / 2;
      roda.position.set(x, 0.31, z);
      g.add(roda);
      const calota = new Mesh(new CylinderGeometry(0.155, 0.155, 0.24, 14), matCromo);
      calota.rotation.z = Math.PI / 2;
      calota.position.set(x * 1.03, 0.31, z);
      g.add(calota);
    }
  }

  for (const x of [-0.52, 0.52]) {
    const farol = new Mesh(new SphereGeometry(0.14, 14, 10), new MeshStandardMaterial({
      color: new Color('#fff8e6'), emissive: new Color('#ffe6ae'),
      emissiveIntensity: 0.7, roughness: 0.22,
    }));
    farol.position.set(x, 0.72, 1.7);
    farol.scale.z = 0.6;
    g.add(farol);
  }
  const paraChoque = new Mesh(new CylinderGeometry(0.075, 0.075, 1.5, 12), matCromo);
  paraChoque.rotation.z = Math.PI / 2;
  paraChoque.position.set(0, 0.44, 1.74);
  g.add(paraChoque);

  return g;
}

function fazArvore(r, cores) {
  const g = new Group();
  const alturaTronco = r.entre(2.2, 3.4);
  const tronco = new Mesh(
    new CylinderGeometry(0.18, 0.32, alturaTronco, 8),
    new MeshStandardMaterial({ color: new Color('#4b3a2c'), roughness: 0.95 })
  );
  tronco.position.y = alturaTronco / 2;
  tronco.castShadow = true;
  g.add(tronco);

  const matCopa = new MeshStandardMaterial({
    color: new Color(cores[Math.floor(r() * cores.length)]), roughness: 0.9,
  });
  const tufos = r.inteiro(3, 5);
  for (let i = 0; i < tufos; i++) {
    const t = new Mesh(new SphereGeometry(r.entre(1.1, 1.9), 9, 7), matCopa);
    t.position.set(r.entre(-0.9, 0.9), alturaTronco + r.entre(0.2, 1.4), r.entre(-0.9, 0.9));
    t.scale.y = 0.8;
    t.castShadow = true;
    g.add(t);
  }
  return g;
}

/* ── marcos ao longe ───────────────────────────────────────────────────── */

function fazBigBen() {
  const g = new Group();
  const matPedra = new MeshStandardMaterial({ color: new Color('#8b7b5e'), roughness: 0.95 });
  const matDourado = new MeshStandardMaterial({
    color: new Color('#c9973f'), roughness: 0.4, metalness: 0.7,
    emissive: new Color('#7a5a1c'), emissiveIntensity: 0.8,
  });

  const torre = new Mesh(new BoxGeometry(11, 62, 11), matPedra);
  torre.position.y = 31;
  g.add(torre);
  const relogioBase = new Mesh(new BoxGeometry(12.4, 12, 12.4), matPedra);
  relogioBase.position.y = 66;
  g.add(relogioBase);

  // os quatro relógios acesos
  for (let i = 0; i < 4; i++) {
    const face = new Mesh(
      new CircleGeometry(4.4, 24),
      new MeshStandardMaterial({
        color: new Color('#f3e2b4'), emissive: new Color('#ffd98a'),
        emissiveIntensity: 2.6, roughness: 1,
      })
    );
    face.position.y = 66;
    const ang = (i / 4) * TAU;
    face.position.x = Math.sin(ang) * 6.3;
    face.position.z = Math.cos(ang) * 6.3;
    face.rotation.y = ang;
    g.add(face);
  }

  const belfry = new Mesh(new BoxGeometry(11.5, 9, 11.5), matPedra);
  belfry.position.y = 77;
  g.add(belfry);
  const pyramid = new Mesh(new ConeGeometry(8.4, 16, 4), matPedra);
  pyramid.position.y = 89.5;
  pyramid.rotation.y = Math.PI / 4;
  g.add(pyramid);
  const flecha = new Mesh(new ConeGeometry(1.4, 9, 8), matDourado);
  flecha.position.y = 101;
  g.add(flecha);
  return g;
}

function fazParlamento() {
  const g = new Group();
  const matPedra = new MeshStandardMaterial({ color: new Color('#7d7059'), roughness: 0.95 });
  const corpo = new Mesh(new BoxGeometry(150, 26, 22), matPedra);
  corpo.position.y = 13;
  g.add(corpo);
  const r = sorteio(4242);
  for (let i = 0; i < 26; i++) {
    const t = new Mesh(new BoxGeometry(3, r.entre(6, 11), 3), matPedra);
    t.position.set(-72 + i * 5.8, 26 + t.geometry.parameters.height / 2, 0);
    g.add(t);
    const p = new Mesh(new ConeGeometry(2.2, 5, 4), matPedra);
    p.position.set(t.position.x, t.position.y + t.geometry.parameters.height / 2 + 2.5, 0);
    p.rotation.y = Math.PI / 4;
    g.add(p);
  }
  const torreVitoria = new Mesh(new BoxGeometry(17, 58, 17), matPedra);
  torreVitoria.position.set(-84, 29, 0);
  g.add(torreVitoria);
  return g;
}

function fazRodaGigante() {
  const g = new Group();
  const matAco = new MeshStandardMaterial({ color: new Color('#5c6773'), roughness: 0.5, metalness: 0.6 });
  const matLuz = new MeshStandardMaterial({
    color: new Color('#8fd4ff'), emissive: new Color('#5fc0ff'),
    emissiveIntensity: 2.4, roughness: 1,
  });
  const aro = new Mesh(new TorusGeometry(30, 0.7, 8, 60), matAco);
  aro.position.y = 33;
  g.add(aro);
  const aro2 = new Mesh(new TorusGeometry(30, 0.28, 6, 60), matLuz);
  aro2.position.y = 33;
  aro2.position.z = 1;
  g.add(aro2);
  for (let i = 0; i < 24; i++) {
    const ang = (i / 24) * TAU;
    const raio = new Mesh(new CylinderGeometry(0.12, 0.12, 30, 5), matAco);
    raio.position.set(Math.cos(ang) * 15, 33 + Math.sin(ang) * 15, 0);
    raio.rotation.z = -ang + Math.PI / 2;
    g.add(raio);
    const capsula = new Mesh(new SphereGeometry(1.1, 8, 6), matLuz);
    capsula.position.set(Math.cos(ang) * 30, 33 + Math.sin(ang) * 30, 0);
    g.add(capsula);
  }
  for (const x of [-9, 9]) {
    const perna = new Mesh(new CylinderGeometry(0.8, 1.2, 34, 8), matAco);
    perna.position.set(x, 17, 6);
    perna.rotation.x = -0.25;
    g.add(perna);
  }
  return g;
}

/* ── a agência, no fim da cena 3 ───────────────────────────────────────── */

/**
 * A fachada tem que ser reconhecível como a mesma do site das cartas: toldo
 * listrado vermelho e creme, letreiro dourado, luz quente saindo pelo vidro.
 * Quando o jogo funde para preto e o site assume, a leitura é de um corte só.
 */
export function criarAgencia() {
  const g = new Group();
  const VERMELHO = '#9c2233';
  const CREME = '#f8eeda';
  const LATAO = '#c9973f';

  const matParede = new MeshStandardMaterial({ color: new Color('#6d4a44'), roughness: 0.9 });
  const parede = new Mesh(new BoxGeometry(14, 11, 1.2), matParede);
  parede.position.y = 5.5;
  parede.castShadow = true;
  parede.receiveShadow = true;
  g.add(parede);

  // vitrine acesa dos dois lados da porta
  const matVitrine = new MeshStandardMaterial({
    color: new Color('#ffcf8f'), emissive: new Color('#ffb765'),
    emissiveIntensity: 2.2, roughness: 1,
  });
  for (const x of [-3.7, 3.7]) {
    const v = new Mesh(new BoxGeometry(3.4, 2.6, 0.14), matVitrine);
    v.position.set(x, 2.4, -0.62);
    g.add(v);
    const cx = new Mesh(new BoxGeometry(3.7, 2.9, 0.1), new MeshStandardMaterial({
      color: new Color('#3a1b1f'), roughness: 0.7,
    }));
    cx.position.set(x, 2.4, -0.55);
    g.add(cx);
  }

  // vão da porta, com o interior quente aparecendo
  const vao = new Mesh(new BoxGeometry(2.4, 4, 0.9), new MeshStandardMaterial({
    color: new Color('#2a1416'), roughness: 0.9,
  }));
  vao.position.set(0, 2, -0.2);
  g.add(vao);
  const luzInterna = new Mesh(new PlaneGeometry(2.2, 3.7), new MeshStandardMaterial({
    color: new Color('#ffd39a'), emissive: new Color('#ffbb6e'),
    emissiveIntensity: 3.4, roughness: 1, side: DoubleSide,
  }));
  luzInterna.position.set(0, 1.95, -0.55);
  g.add(luzInterna);

  const portaLuz = new PointLight(new Color('#ffbb70'), 26, 22, 2);
  portaLuz.position.set(0, 2.6, 1.6);
  g.add(portaLuz);

  // toldo listrado, igual ao do CSS
  const toldo = new Group();
  for (let i = 0; i < 12; i++) {
    const faixa = new Mesh(new BoxGeometry(0.78, 0.12, 2.6),
      new MeshStandardMaterial({ color: new Color(i % 2 ? CREME : VERMELHO), roughness: 0.75 }));
    faixa.position.set(-4.3 + i * 0.78, 0, 0);
    faixa.castShadow = true;
    toldo.add(faixa);
  }
  toldo.position.set(0, 5.2, 1.3);
  toldo.rotation.x = 0.4;
  g.add(toldo);

  // letreiro
  const placa = new Mesh(new BoxGeometry(9.5, 1.7, 0.3), new MeshStandardMaterial({
    color: new Color('#4a1219'), roughness: 0.6,
  }));
  placa.position.set(0, 7.1, 0.65);
  g.add(placa);
  const letras = new Mesh(new BoxGeometry(8.6, 0.9, 0.12), new MeshStandardMaterial({
    color: new Color(LATAO), emissive: new Color(LATAO),
    emissiveIntensity: 2.8, roughness: 0.4, metalness: 0.6,
  }));
  letras.position.set(0, 7.1, 0.83);
  g.add(letras);

  const coracao = new Mesh(new SphereGeometry(0.36, 12, 10), new MeshStandardMaterial({
    color: new Color('#ff7a8c'), emissive: new Color('#ff3d5a'),
    emissiveIntensity: 4, roughness: 1,
  }));
  coracao.position.set(0, 8.4, 0.8);
  g.add(coracao);

  return { grupo: g, luz: portaLuz, coracao };
}

/* ── chuva ─────────────────────────────────────────────────────────────── */

function criarChuva(quantidade, cor, vento) {
  if (quantidade <= 0) return null;
  const CAIXA = new Vector3(70, 26, 90);
  const pos = new Float32Array(quantidade * 2 * 3);
  const lado = new Float32Array(quantidade * 2);
  const veloc = new Float32Array(quantidade * 2);
  const r = sorteio(9182);

  for (let i = 0; i < quantidade; i++) {
    const x = r.entre(-CAIXA.x / 2, CAIXA.x / 2);
    const y = r.entre(0, CAIXA.y);
    const z = r.entre(-CAIXA.z / 2, CAIXA.z / 2);
    const v = r.entre(0.75, 1.35);
    for (let k = 0; k < 2; k++) {
      pos[(i * 2 + k) * 3] = x;
      pos[(i * 2 + k) * 3 + 1] = y;
      pos[(i * 2 + k) * 3 + 2] = z;
      lado[i * 2 + k] = k;
      veloc[i * 2 + k] = v;
    }
  }

  const geometria = new BufferGeometry();
  geometria.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geometria.setAttribute('lado', new Float32BufferAttribute(lado, 1));
  geometria.setAttribute('veloc', new Float32BufferAttribute(veloc, 1));

  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    // mistura normal, não aditiva: sobre céu claro a chuva aditiva soma para
    // branco e vira risco na tela em vez de gota
    blending: NormalBlending,
    uniforms: {
      tempo: { value: 0 },
      camPos: { value: new Vector3() },
      caixa: { value: CAIXA },
      cor: { value: new Color(cor) },
      vento: { value: new Vector3(vento[0], 0, vento[1]) },
      comprimento: { value: 0.55 },
      opacidade: { value: 0.13 },
    },
    vertexShader: `
      attribute float lado;
      attribute float veloc;
      uniform float tempo, comprimento;
      uniform vec3 camPos, caixa, vento;
      varying float vFade;
      void main(){
        vec3 p = position;
        // cai e reaparece no topo
        p.y = mod(p.y - tempo * 22.0 * veloc, caixa.y);
        // a caixa de chuva acompanha a câmera, enrolando nas bordas
        p.x = mod(p.x - camPos.x + caixa.x * 0.5, caixa.x) - caixa.x * 0.5 + camPos.x;
        p.z = mod(p.z - camPos.z + caixa.z * 0.5, caixa.z) - caixa.z * 0.5 + camPos.z;
        // o segundo vértice do risco fica acima e atrás, dando o rastro
        p += lado * (vec3(0.0, comprimento, 0.0) * veloc - vento * 0.1);
        vFade = 1.0 - lado * 0.55;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 cor; uniform float opacidade;
      varying float vFade;
      void main(){ gl_FragColor = vec4(cor, opacidade * vFade); }`,
  });

  const linhas = new LineSegments(geometria, material);
  linhas.frustumCulled = false;
  return { objeto: linhas, material };
}

/* ═══════════════ montagem ═══════════════ */

export function criarMundo(cena, renderer, fase, preset) {
  const grupo = new Group();
  cena.add(grupo);

  const ceu = Mat.criarCeu(renderer, fase.paleta);
  ceu.malha.scale.setScalar(1);
  cena.add(ceu.malha);
  cena.environment = ceu.ambiente;

  /* luzes */
  const sol = new DirectionalLight(new Color(fase.corSol), fase.forcaLuzSol);
  sol.position.set(fase.dirLuz[0], fase.dirLuz[1], fase.dirLuz[2]).multiplyScalar(60);
  sol.castShadow = true;
  sol.shadow.mapSize.set(preset.sombra, preset.sombra);
  sol.shadow.camera.near = 1;
  sol.shadow.camera.far = 160;
  const ext = 34;
  sol.shadow.camera.left = -ext;
  sol.shadow.camera.right = ext;
  sol.shadow.camera.top = ext;
  sol.shadow.camera.bottom = -ext;
  sol.shadow.bias = -0.0012;
  sol.shadow.normalBias = 0.03;
  // sombra como sugestão, não como mancha preta: é o que dá o ar de desenho
  if ('intensity' in sol.shadow) sol.shadow.intensity = fase.sombra ?? 0.35;
  cena.add(sol);
  cena.add(sol.target);

  const ceuLuz = new HemisphereLight(new Color(fase.corCeuLuz), new Color(fase.corChaoLuz), fase.forcaHemisferio);
  cena.add(ceuLuz);

  // três lanternas de verdade que perseguem os postes mais próximos:
  // ilumina onde importa sem pagar por cinquenta luzes
  const lanternas = [];
  const quantasLanternas = preset.sombra >= 1024 ? 3 : 2;
  for (let i = 0; i < quantasLanternas; i++) {
    const l = new PointLight(new Color(fase.corPoste), fase.forcaPoste, 26, 2);
    l.visible = false;
    cena.add(l);
    lanternas.push(l);
  }

  /* chão contínuo, recolocado à frente conforme ela avança */
  const COMPRIMENTO_CHAO = 260;
  const chao = criarChao(fase, COMPRIMENTO_CHAO);
  grupo.add(chao);

  /* fachadas e blocos */
  const fachadas = fase.tipo === 'parque' ? [] : prepararFachadas(fase, preset);
  const blocos = [];
  const QUANTOS_BLOCOS = Math.ceil(preset.distancia / BLOCO) + 2;

  function montarBloco(g, indice, registro) {
    while (g.children.length) g.remove(g.children[0]);
    registro.postes.length = 0;
    const r = sorteio(fase.semente * 7717 + indice * 131);
    const z0 = indice * BLOCO;
    g.position.z = z0;

    if (fase.tipo === 'parque') {
      const cores = fase.coresFolhagem;
      const quantas = Math.round(r.inteiro(4, 7) * preset.arvores);
      for (let i = 0; i < quantas; i++) {
        const lado = r.chance(0.5) ? -1 : 1;
        const a = fazArvore(r, cores);
        a.position.set(lado * r.entre(7, 20), 0, r.entre(0, BLOCO));
        a.scale.setScalar(r.entre(0.85, 1.3));
        g.add(a);
      }
      // bancos do parque e postes baixos, sempre fora das faixas
      if (r.chance(0.55)) {
        const b = new Mesh(new BoxGeometry(1.6, 0.1, 0.5),
          new MeshStandardMaterial({ color: new Color('#5c3a24'), roughness: 0.9 }));
        b.position.set(r.chance(0.5) ? -6 : 6, 0.5, r.entre(2, BLOCO - 2));
        b.castShadow = true;
        g.add(b);
      }
    } else {
      // cada lado tem seu próprio cursor: as casas ficam encostadas umas nas
      // outras formando a fileira, com larguras diferentes de cada lado
      for (const lado of [-1, 1]) {
        let z = 0;
        while (z < BLOCO) {
          const p = predio(r, fachadas, lado);
          p.grupo.position.z = z + p.largura / 2;
          g.add(p.grupo);
          z += p.largura;
        }
      }
      // adereços, encostados no meio-fio e não na parede — assim ficam
      // legíveis como objetos na calçada em vez de manchas na fachada
      if (r.chance(0.45)) {
        const c = prop('cabine', fazCabineTelefonica);
        c.position.set((r.chance(0.5) ? -1 : 1) * r.entre(5.6, 6.4), 0.16, r.entre(2, BLOCO - 2));
        c.rotation.y = r.entre(-0.35, 0.35);
        g.add(c);
      }
      if (r.chance(0.4)) {
        const cx = prop('correio', fazCaixaCorreio);
        cx.position.set((r.chance(0.5) ? -1 : 1) * r.entre(5.5, 6.1), 0.16, r.entre(2, BLOCO - 2));
        g.add(cx);
      }

      // carrinhos estacionados: dão cor e escala à rua sem entrar nas faixas
      const CORES_CARRO = ['#c02a3e', '#4f7fb8', '#e0b24a', '#5d9e86', '#d98a68', '#f0f0e8'];
      const quantosCarros = r.inteiro(1, 2);
      for (let i = 0; i < quantosCarros; i++) {
        const lado = r.chance(0.5) ? -1 : 1;
        const cor = CORES_CARRO[r.inteiro(0, CORES_CARRO.length - 1)];
        const carro = prop('carro' + cor, () => fazCarrinho(cor));
        carro.position.set(lado * r.entre(FAIXA_CARRO - 0.2, FAIXA_CARRO + 0.2), 0, r.entre(1, BLOCO - 3));
        carro.rotation.y = lado > 0 ? 0.04 : Math.PI - 0.04;
        g.add(carro);
      }
    }

    // postes: sempre, os dois cenários têm
    for (let i = 0; i < 2; i++) {
      const lado = (indice + i) % 2 === 0 ? -1 : 1;
      const p = prop('poste' + fase.corPoste, () => fazPoste(fase.corPoste, fase.forcaHalo ?? 0.02));
      const pz = z0 + i * (BLOCO / 2) + 4;
      p.position.set(lado * (fase.tipo === 'parque' ? 5.6 : 5.7), fase.tipo === 'parque' ? 0 : 0.16, i * (BLOCO / 2) + 4);
      p.rotation.y = lado > 0 ? Math.PI : 0;
      g.add(p);
      registro.postes.push({ x: lado * 5.7, z: pz });
    }
  }

  for (let i = 0; i < QUANTOS_BLOCOS; i++) {
    const g = new Group();
    grupo.add(g);
    const registro = { grupo: g, indice: i, postes: [] };
    montarBloco(g, i, registro);
    blocos.push(registro);
  }

  /* marcos distantes */
  const marcos = new Group();
  cena.add(marcos);
  const marcosDef = [];
  if (fase.marcos) {
    for (const m of fase.marcos) {
      let obj = null;
      if (m.tipo === 'bigben') obj = fazBigBen();
      else if (m.tipo === 'parlamento') obj = fazParlamento();
      else if (m.tipo === 'roda') obj = fazRodaGigante();
      if (!obj) continue;
      obj.position.set(m.x, m.y || 0, 0);
      if (m.rot) obj.rotation.y = m.rot;
      if (m.escala) obj.scale.setScalar(m.escala);
      marcos.add(obj);
      marcosDef.push({ obj, distancia: m.distancia });
    }
  }

  /* chuva */
  const chuva = fase.chuva > 0
    ? criarChuva(Math.round(preset.chuva * fase.chuva), fase.corChuva || '#c9d8e8', fase.vento || [0, 0])
    : null;
  if (chuva) cena.add(chuva.objeto);

  /* névoa: casada com a cor do horizonte, senão o fundo "descola" do céu */
  cena.fog = new FogExp2(new Color(fase.paleta.ceuHorizonte), fase.neblina);

  let tempo = 0;

  function atualizar(dt, zJogador, camPos) {
    tempo += dt;

    // recicla os blocos que ficaram para trás
    const primeiroVisivel = Math.floor((zJogador - BLOCO) / BLOCO);
    for (const b of blocos) {
      if (b.indice < primeiroVisivel) {
        const novo = b.indice + blocos.length;
        b.indice = novo;
        montarBloco(b.grupo, novo, b);
      }
    }

    // o chão só é reposicionado em passos, evitando tremer a textura
    chao.position.z = Math.floor(zJogador / 40) * 40 + COMPRIMENTO_CHAO / 2 - 60;

    // sombra e sol acompanham a menina
    sol.position.set(
      fase.dirLuz[0] * 60,
      fase.dirLuz[1] * 60,
      fase.dirLuz[2] * 60 + zJogador
    );
    sol.target.position.set(0, 0, zJogador + 6);
    sol.target.updateMatrixWorld();

    // as lanternas vão para os postes mais próximos à frente
    const candidatos = [];
    for (const b of blocos) {
      for (const p of b.postes) {
        if (p.z > zJogador - 6 && p.z < zJogador + 34) candidatos.push(p);
      }
    }
    candidatos.sort((a, b) => Math.abs(a.z - zJogador - 10) - Math.abs(b.z - zJogador - 10));
    lanternas.forEach((l, i) => {
      const p = candidatos[i];
      if (p) {
        l.visible = true;
        l.position.set(p.x + (p.x > 0 ? -0.5 : 0.5), 5, p.z);
      } else {
        l.visible = false;
      }
    });

    // os marcos mantêm distância fixa: nunca chegam mais perto
    for (const m of marcosDef) m.obj.position.z = zJogador + m.distancia;

    if (chuva) {
      chuva.material.uniforms.tempo.value = tempo;
      chuva.material.uniforms.camPos.value.copy(camPos);
    }

    if (ceu.malha) ceu.malha.position.copy(camPos);
  }

  function dispose() {
    cena.remove(grupo, ceu.malha, sol, sol.target, ceuLuz, marcos);
    lanternas.forEach((l) => cena.remove(l));
    if (chuva) {
      cena.remove(chuva.objeto);
      chuva.objeto.geometry.dispose();
      chuva.material.dispose();
    }
    if (ceu.alvo) ceu.alvo.dispose();
    ceu.malha.geometry.dispose();
    ceu.malha.material.dispose();

    /* Cuidado que já custou um bug: os adereços são clones de protótipos
       guardados em cacheProps e compartilham geometria com eles. Sair
       descartando tudo que está no grupo destruía essa geometria e a fase
       seguinte recebia protótipo furado. Então aqui só descartamos o que foi
       criado exclusivamente para esta fase, e o cache é limpo junto. */
    chao.traverse((o) => {
      if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); }
    });
    fachadas.forEach((f) => f.material.dispose());
    limparProps();

    marcos.traverse((o) => {
      if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); }
    });
    cena.environment = null;
  }

  return { grupo, atualizar, dispose, sol, ceu, blocos, chuva };
}
