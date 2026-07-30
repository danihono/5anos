/* ═══════════════ o mundo ═══════════════
   A pista é construída em blocos de 24 m que se reciclam: quando a menina
   passa de um bloco, ele é remontado lá na frente. Como as geometrias e os
   materiais são compartilhados, remontar custa quase nada.

   Marcos de Londres em dois papéis. Os "pontos" ficam parados num z do
   trajeto e ela passa por eles de verdade: a praça de Westminster com o
   Parlamento e o Big Ben, a roda-gigante sobre o lago, e a travessia da Tower
   Bridge com o Tâmisa dos dois lados. Já os "marcos" mantêm distância fixa da
   câmera e nunca são alcançados — pano de fundo, como cenário de teatro.
   ═════════════════════════════════════════ */

import { Group, Mesh, MeshStandardMaterial, MeshPhysicalMaterial, BoxGeometry, PlaneGeometry,
         CylinderGeometry, SphereGeometry, ConeGeometry, TorusGeometry, CircleGeometry,
         CapsuleGeometry,
         DirectionalLight, HemisphereLight, PointLight, SpotLight, Color, DoubleSide, FogExp2,
         BufferGeometry, Float32BufferAttribute, ShaderMaterial, LineSegments, AdditiveBlending,
         NormalBlending,
         Vector3 } from 'three';
import { TAU, mistura, limita, sorteio } from './util.js';
import * as Mat from './materiais.js';
// o ônibus vermelho de dois andares e o pedestre já existem como obstáculos;
// aqui eles entram parados na calçada, só de enfeite, para a rua ter gente
import { CONSTRUTORES } from './obstaculos.js';

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

    /* A grama vem em duas faixas que NÃO passam por cima do lago. Antes era um
       plano único de 120 m e o lago ficava 10 cm abaixo dele: nessa distância,
       em ângulo rasante, os dois planos brigavam por precisão de profundidade
       e a água simplesmente não aparecia. Recortar é mais barato que empilhar. */
    /* A margem tem que ficar PERTO do caminho. Com o lago começando em x=-15,
       ele caía fora do quadro: a 20 m à frente a borda da tela só alcança
       x≈-18, então sobrava um fiapo de água escondido pelas árvores. */
    const LAGO_DE = -58, LAGO_ATE = -11;
    for (const [de, ate] of [[LAGO_ATE, 60], [-120, LAGO_DE]]) {
      const larg = ate - de;
      const grama = new Mesh(
        new PlaneGeometry(larg, comprimento),
        materialChao(gramaTex, [larg / 3, comprimento / 3])
      );
      grama.rotation.x = -Math.PI / 2;
      grama.position.set((de + ate) / 2, -0.04, 0);
      grama.receiveShadow = true;
      g.add(grama);
    }

    const caminho = new Mesh(
      new PlaneGeometry(larguraVia, comprimento),
      materialChao(caminhoTex, [3, comprimento / 3], '#d9c49b')
    );
    caminho.rotation.x = -Math.PI / 2;
    caminho.receiveShadow = true;
    g.add(caminho);

    // o lago, do lado esquerdo
    const lago = new Mesh(
      new PlaneGeometry(LAGO_ATE - LAGO_DE, comprimento),
      /* Sem verniz e sem metal: em ângulo rasante o Fresnel do clearcoat
         chega perto de 100% e a água virava um espelho branco do céu dourado.
         Fisicamente correto, visualmente errado aqui — num mundo de desenho a
         cor própria tem que ganhar. */
      new MeshStandardMaterial({
        color: new Color(fase.corAgua || '#2e6b7d'),
        roughness: 0.45, metalness: 0,
      })
    );
    lago.rotation.x = -Math.PI / 2;
    lago.position.set((LAGO_DE + LAGO_ATE) / 2, -0.12, 0);
    g.add(lago);
    // o anoitecer escurece a água junto com o céu
    g.userData.agua = lago.material;

    // mureta de pedra na margem
    const margem = new Mesh(
      new BoxGeometry(0.5, 0.5, comprimento),
      new MeshStandardMaterial({ color: new Color('#cbc0a8'), roughness: 0.85 })
    );
    margem.position.set(LAGO_ATE, 0.1, 0);
    margem.receiveShadow = true;
    g.add(margem);
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

/* Materiais de árvore guardados por cor. Cada quarteirão é remontado ao ser
   reciclado, e o parque passou a ter três vezes mais árvores — sem este cache
   era um material novo por tronco e por copa, centenas deles nascendo e
   morrendo enquanto ela corre. */
const MAT_ARVORE = new Map();
function matArvore(cor, aspereza = 0.9) {
  let m = MAT_ARVORE.get(cor);
  if (!m) {
    m = new MeshStandardMaterial({ color: new Color(cor), roughness: aspereza });
    MAT_ARVORE.set(cor, m);
  }
  return m;
}

function fazArvore(r, cores) {
  const g = new Group();
  const alturaTronco = r.entre(2.2, 3.4);
  const tronco = new Mesh(
    new CylinderGeometry(0.18, 0.32, alturaTronco, 8),
    matArvore('#7d5c3c')
  );
  tronco.position.y = alturaTronco / 2;
  tronco.castShadow = true;
  g.add(tronco);

  const matCopa = matArvore(cores[Math.floor(r() * cores.length)]);
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

/* ── pontos do trajeto: marcos por onde ela passa de verdade ────────────
   Diferente dos "marcos", que ficam a uma distância fixa da câmera e nunca
   são alcançados, estes ficam parados num z do trajeto. Para eles caberem,
   a fileira de casas abre uma clareira — e a clareira precisa de chão, senão
   sobra o vazio embaixo do horizonte.
   ─────────────────────────────────────────────────────────────────────── */

function fazPisoDaClareira(p, fase) {
  const g = new Group();
  const comp = p.claro + 30;

  if (p.piso === 'agua') {
    // o Tâmisa dos dois lados da ponte, abaixo do nível do tabuleiro
    // mesma razão do lago: verniz em ângulo rasante estoura para branco
    const matAgua = new MeshStandardMaterial({
      color: new Color(fase.corRio || '#3f6f80'),
      roughness: 0.42, metalness: 0,
    });
    for (const lado of [-1, 1]) {
      const agua = new Mesh(new PlaneGeometry(80, comp), matAgua);
      agua.rotation.x = -Math.PI / 2;
      agua.position.set(lado * (FRENTE_PREDIO + 40), -1.3, p.z);
      g.add(agua);
    }
    // muro de arrimo escondendo a borda do tabuleiro
    const matMuro = new MeshStandardMaterial({ color: new Color('#c3b9a4'), roughness: 0.85 });
    for (const lado of [-1, 1]) {
      // parapeito rente ao tabuleiro: mais alto que isso e ele tapava o rio
      const muro = new Mesh(new BoxGeometry(0.6, 2.4, comp), matMuro);
      muro.position.set(lado * (FRENTE_PREDIO + 0.3), -1, p.z);
      muro.receiveShadow = true;
      g.add(muro);
    }
    return g;
  }

  if (p.piso !== 'praca') return g;

  /* A praça não pode ir até o horizonte: 80 m de calçada lisa viravam um pátio
     vazio enorme do lado do Big Ben. Ela tem uma largura, e depois dela vem o
     Tâmisa — que é onde Westminster fica de verdade, e é o fundo escuro contra
     o qual a torre acesa aparece. */
  const larg = p.larguraPiso ?? 80;
  const tex = Mat.calcada(fase.molhado, fase.semente + 21);
  for (const lado of (p.lado ? [p.lado] : [-1, 1])) {
    const m = new Mesh(new PlaneGeometry(larg, comp), materialChao(tex, [larg / 4, comp / 4]));
    m.rotation.x = -Math.PI / 2;
    m.position.set(lado * (FRENTE_PREDIO + larg / 2), 0.16, p.z);
    m.receiveShadow = true;
    g.add(m);

    const bal = fazBalaustrada(comp, lado);
    bal.position.y = 0.16;
    bal.position.z = p.z;
    g.add(bal);

    if (!p.rio) continue;
    // o rio começa na borda da praça e some na neblina
    const agua = new Mesh(new PlaneGeometry(220, comp + 60), new MeshStandardMaterial({
      color: new Color(fase.corRio || '#3f6f80'), roughness: 0.45, metalness: 0,
    }));
    agua.rotation.x = -Math.PI / 2;
    agua.position.set(lado * (FRENTE_PREDIO + larg + 110), -1.4, p.z);
    g.add(agua);

    // parapeito na borda da praça, escondendo o degrau até a água
    const cais = new Mesh(new BoxGeometry(1.2, 3.4, comp),
      new MeshStandardMaterial({ color: new Color('#c9bfa8'), roughness: 0.88 }));
    cais.position.set(lado * (FRENTE_PREDIO + larg), 0.3, p.z);
    cais.receiveShadow = true;
    g.add(cais);

    const grade = fazBalaustrada(comp, lado);
    grade.position.set(lado * (FRENTE_PREDIO + larg - 1), 0.16, p.z);
    g.add(grade);
  }
  return g;
}

function criarPontos(fase, alvo, preset, telas = [], acendiveis = []) {
  const lista = [];
  for (const p of (fase.pontos || [])) {
    let obj = null;
    if (p.tipo === 'bigben') obj = fazBigBen({ noturno: p.noturno, preset });
    else if (p.tipo === 'parlamento') obj = fazParlamento({ noturno: p.noturno });
    else if (p.tipo === 'roda') obj = fazRodaGigante();
    else if (p.tipo === 'ponte') obj = fazTowerBridge();
    else if (p.tipo === 'piccadilly') obj = fazPiccadilly(fase);
    if (!obj) continue;
    if (obj.userData.painel) telas.push(...obj.userData.painel);
    if (obj.userData.acender) acendiveis.push(obj.userData.acender);

    obj.position.set(p.x || 0, p.y || 0, p.z);
    if (p.rot) obj.rotation.y = p.rot;
    obj.scale.setScalar(p.escala || 1);
    alvo.add(obj);
    alvo.add(fazPisoDaClareira(p, fase));

    if (p.legenda || p.olhada) {
      lista.push({
        z: p.z,
        legenda: p.legenda || null,
        nome: p.nome || '',
        aviso: p.aviso ?? 60,
        olhada: p.olhada || null,
        badalada: !!p.badalada,
        mostrada: false,
        soou: false,
      });
    }
  }
  return lista;
}

/* ── marcos ao longe ───────────────────────────────────────────────────── */

/**
 * Torre Elizabeth, o Big Ben. Calcário quente e claro, no tom da paleta —
 * o verde-oliva da primeira versão brigava com o pastel da rua toda.
 *
 * O que faz uma caixa de 62 m parecer uma torre gótica é o ritmo vertical:
 * pilastras subindo de ponta a ponta, cordões horizontais marcando os
 * pavimentos e janelas estreitas e altas entre elas. Sem isso era um paredão.
 *
 * As medidas e as cores são as de verdade, conferidas (ver LEIA-ME):
 *   96,3 m de altura, base de 12 m de lado, alvenaria de pedra de Anston até
 *   61 m e daí para cima uma flecha de ferro fundido; quatro mostradores de
 *   6,9 m de diâmetro a 54,9 m do chão, com 324 peças de vidro opala leitoso;
 *   ponteiros, algarismos e a treliça de ferro em AZUL DA PRÚSSIA, aro e
 *   folhas de ouro, cantos em azul cobalto. À noite os mostradores são
 *   iluminados por trás (desde 1859; hoje LED) com um amarelo quente, e a
 *   pedra recebe refletores dourados de baixo para cima. Em cima do
 *   campanário fica a Luz de Ayrton, acesa quando o Parlamento está reunido.
 *
 * A escala em `fases.js` é 0.92, então aqui tudo é medida real ÷ 0.92.
 */
function fazBigBen({ noturno = false, preset = null } = {}) {
  const g = new Group();
  const matPedra = new MeshStandardMaterial({ color: new Color('#dcc9a2'), roughness: 0.88 });
  const matSombra = new MeshStandardMaterial({ color: new Color('#b9a37c'), roughness: 0.9 });
  const matVitral = new MeshStandardMaterial({
    color: new Color('#7f97b0'), roughness: 0.3, metalness: 0.1,
    emissive: new Color('#38485c'), emissiveIntensity: 0.45,
  });
  const matDourado = new MeshStandardMaterial({
    color: new Color('#e0b055'), roughness: 0.35, metalness: 0.75,
    emissive: new Color('#7a5a1c'), emissiveIntensity: 0.9,
  });
  /* Azul da Prússia: a cor que apareceu debaixo de camadas de fuligem e tinta
     preta no restauro de 2017-2022 e voltou a ser a original de Barry. É ela
     que desenha o relógio — contra o vidro aceso, ponteiros e algarismos são
     silhuetas escuras, e é assim que o olho reconhece o Big Ben. */
  const matPrussia = new MeshStandardMaterial({ color: new Color('#0b2f4f'), roughness: 0.55 });
  const matCobalto = new MeshStandardMaterial({ color: new Color('#14428c'), roughness: 0.6 });

  const L = 11;         // lado da torre
  const H = 62;         // altura do fuste

  const torre = new Mesh(new BoxGeometry(L, H, L), matPedra);
  torre.position.y = H / 2;
  torre.castShadow = true;
  torre.receiveShadow = true;
  g.add(torre);

  // embasamento
  const base = new Mesh(new BoxGeometry(L + 1.6, 4, L + 1.6), matSombra);
  base.position.y = 2;
  g.add(base);

  // pilastras nos cantos e no meio de cada face, subindo o fuste inteiro
  for (const [dx, dz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
    const pil = new Mesh(new BoxGeometry(1.7, H - 3, 1.7), matPedra);
    pil.position.set(dx * (L / 2 - 0.2), (H - 3) / 2 + 2, dz * (L / 2 - 0.2));
    pil.castShadow = true;
    g.add(pil);
  }
  for (const [dx, dz] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
    const pil = new Mesh(new BoxGeometry(dx ? 1.1 : 1.5, H - 6, dz ? 1.1 : 1.5), matPedra);
    pil.position.set(dx * (L / 2 + 0.2), (H - 6) / 2 + 3, dz * (L / 2 + 0.2));
    g.add(pil);
  }

  // cordões horizontais e janelas altas entre eles — param antes dos 54 m,
  // onde começa o estágio dos mostradores
  for (let piso = 0; piso < 5; piso++) {
    const y = 5 + piso * 10;
    const cordao = new Mesh(new BoxGeometry(L + 1, 0.9, L + 1), matSombra);
    cordao.position.y = y - 3.4;
    g.add(cordao);

    for (const [dx, dz] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const jan = new Mesh(new BoxGeometry(dz ? 2.6 : 0.4, 6.4, dx ? 2.6 : 0.4), matVitral);
      jan.position.set(dx * (L / 2 + 0.1), y + 1.6, dz * (L / 2 + 0.1));
      g.add(jan);
      const capuz = new Mesh(new ConeGeometry(1.6, 1.9, 3), matPedra);
      capuz.position.set(dx * (L / 2 + 0.1), y + 5.8, dz * (L / 2 + 0.1));
      capuz.rotation.y = dx ? 0 : Math.PI / 2;
      g.add(capuz);
    }
  }

  /* Estágio dos mostradores: os relógios de verdade ficam a 54,9 m, ou seja
     DENTRO da alvenaria e não numa caixa em cima dela — 54.9/0.92 ≈ 60. */
  const Y_RELOGIO = 60;
  const relogioBase = new Mesh(new BoxGeometry(12.4, 13, 12.4), matPedra);
  relogioBase.position.y = Y_RELOGIO;
  relogioBase.castShadow = true;
  g.add(relogioBase);
  // anel dourado sob o estágio do relógio
  const anelOuro = new Mesh(new BoxGeometry(13, 0.7, 13), matDourado);
  anelOuro.position.y = Y_RELOGIO - 6.9;
  g.add(anelOuro);

  /* Os quatro mostradores. De noite eles são o herói do quadro: vidro opala
     iluminado por trás, como os de verdade, com intensidade alta o bastante
     para o bloom abrir halo em volta. Mais o aro dourado, que é o detalhe que
     faz o olho reconhecer o relógio mesmo de longe. */
  const matMostrador = new MeshStandardMaterial({
    // vidro opala leitoso, aceso por trás: branco quente, não âmbar
    color: new Color(noturno ? '#fff6e6' : '#f3e2b4'),
    emissive: new Color(noturno ? '#ffdca4' : '#ffd98a'),
    /* A treliça e os ponteiros escuros comem boa parte do disco, então o vidro
       precisa vir mais forte para o conjunto ainda ler como "aceso": a graça é
       o desenho azul RECORTADO contra a luz, não um disco azul. */
    emissiveIntensity: noturno ? 5.5 : 2.6,
    roughness: 1,
  });
  const matAro = new MeshStandardMaterial({
    color: new Color('#e0b055'), roughness: 0.3, metalness: 0.8,
    emissive: new Color('#8a6520'), emissiveIntensity: noturno ? 1.6 : 0.5,
  });

  const R = 3.75;              // 6,9 m de diâmetro ÷ 0.92, dividido por 2
  for (let i = 0; i < 4; i++) {
    const ang = (i / 4) * TAU;
    const px = Math.sin(ang) * 6.3;
    const pz = Math.cos(ang) * 6.3;
    /* Empilhamento por RAIO absoluto, não por fator. A parede do estágio está
       em 6.2; cada camada tem espessura, e multiplicar a posição por 0.99 não
       garante nada — foi assim que a caixa do painel de trás (0,3 m de fundo)
       ficou com a cara À FRENTE do vidro e apagou o relógio. */
    const emRaio = (r) => [Math.sin(ang) * r, Y_RELOGIO, Math.cos(ang) * r];

    /* Moldura dourada e canto em azul cobalto: o painel quadrado atrás do
       disco, que separa o relógio da pedra. De noite é fundo, não figura. */
    const moldura = new Mesh(new BoxGeometry(10.4, 10.4, 0.18), matDourado);
    moldura.position.set(...emRaio(6.28));
    moldura.rotation.y = ang;
    g.add(moldura);
    const canto = new Mesh(new BoxGeometry(9, 9, 0.16), matCobalto);
    canto.position.set(...emRaio(6.4));
    canto.rotation.y = ang;
    g.add(canto);

    const face = new Mesh(new CircleGeometry(R, 28), matMostrador);
    face.position.set(...emRaio(6.54));
    face.rotation.y = ang;
    g.add(face);

    const aro = new Mesh(new TorusGeometry(R + 0.2, 0.28, 8, 28), matAro);
    aro.position.set(...emRaio(6.58));
    aro.rotation.y = ang;
    g.add(aro);

    /* A treliça de ferro que divide o vidro em painéis, os algarismos em volta
       e os ponteiros — tudo em azul da Prússia. Contra o vidro aceso viram
       silhueta, e é justamente esse desenho escuro sobre o disco claro que faz
       alguém dizer "é o Big Ben" mesmo com o relógio ocupando 30 pixels. */
    const grade = new Group();
    grade.position.set(...emRaio(6.64));
    grade.rotation.y = ang;
    g.add(grade);

    for (let r = 0; r < 4; r++) {                       // raios da treliça
      const raio = new Mesh(new BoxGeometry(0.1, R * 2 - 0.3, 0.1), matPrussia);
      raio.rotation.z = (r / 4) * Math.PI;
      grade.add(raio);
    }
    const anel = new Mesh(new TorusGeometry(R * 0.72, 0.08, 6, 24), matPrussia);
    grade.add(anel);
    for (let n = 0; n < 12; n++) {                      // os doze algarismos
      const a = (n / 12) * TAU;
      const num = new Mesh(new BoxGeometry(0.24, 0.44, 0.1), matPrussia);
      num.position.set(Math.sin(a) * R * 0.87, Math.cos(a) * R * 0.87, 0.03);
      num.rotation.z = -a;
      grade.add(num);
    }

    /* Ponteiros. O pivô tem que ficar no CENTRO do mostrador, então cada um
       é um grupo girado em Z com a haste deslocada para fora — girar a malha
       direto botaria o eixo no meio da haste. */
    const eixo = new Group();
    eixo.position.set(...emRaio(6.7));
    eixo.rotation.y = ang;
    g.add(eixo);
    for (const [comp, larg, giro] of [[R * 0.82, 0.22, -0.9], [R * 0.58, 0.3, 2.1]]) {
      const braco = new Group();
      braco.rotation.z = giro;
      eixo.add(braco);
      const ponteiro = new Mesh(new BoxGeometry(larg, comp, 0.15), matPrussia);
      ponteiro.position.y = comp / 2 - 0.3;
      braco.add(ponteiro);
    }
    const miolo = new Mesh(new CylinderGeometry(0.3, 0.3, 0.14, 10), matDourado);
    miolo.rotation.x = Math.PI / 2;
    miolo.position.set(...emRaio(6.78));
    g.add(miolo);
  }

  /* Do campanário para cima é flecha de ferro fundido, não alvenaria: são
     35 dos 96 m da torre. Antes o fuste ia alto demais e sobrava um bico
     curto em cima — a silhueta ficava atarracada. */
  const Y_SINO = 71;
  const belfry = new Mesh(new BoxGeometry(11.5, 9, 11.5), matPedra);
  belfry.position.y = Y_SINO;
  belfry.castShadow = true;
  g.add(belfry);
  // aberturas do campanário, onde fica o sino que dá nome à torre
  for (const [dx, dz] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
    const abertura = new Mesh(new BoxGeometry(dz ? 6.4 : 0.4, 6, dx ? 6.4 : 0.4),
      new MeshStandardMaterial({ color: new Color('#3d3a33'), roughness: 0.95 }));
    abertura.position.set(dx * 5.8, Y_SINO, dz * 5.8);
    g.add(abertura);
  }

  /* A Luz de Ayrton: a lanterna em cima do campanário, posta em 1885 a pedido
     da rainha Victoria para ela saber do Palácio de Buckingham quando o
     Parlamento estava reunido depois de escurecer. Acesa, é o ponto mais alto
     e mais brilhante da torre. */
  const baseAyrton = new Mesh(new CylinderGeometry(1.5, 1.9, 1.2, 10), matSombra);
  baseAyrton.position.y = Y_SINO + 5.4;
  g.add(baseAyrton);
  const lanterna = new Mesh(new CylinderGeometry(1.25, 1.25, 2.6, 10), new MeshStandardMaterial({
    color: new Color(noturno ? '#fff6e0' : '#cfd6d2'),
    emissive: new Color(noturno ? '#ffe0a8' : '#000000'),
    emissiveIntensity: noturno ? 5 : 0, roughness: 1,
  }));
  lanterna.position.y = Y_SINO + 7.3;
  g.add(lanterna);
  const chapeuAyrton = new Mesh(new ConeGeometry(1.7, 1.4, 10), matDourado);
  chapeuAyrton.position.y = Y_SINO + 9.3;
  g.add(chapeuAyrton);

  const pyramid = new Mesh(new ConeGeometry(8.4, 15, 4), matSombra);
  pyramid.position.y = Y_SINO + 12;
  pyramid.rotation.y = Math.PI / 4;
  pyramid.castShadow = true;
  g.add(pyramid);
  const flecha = new Mesh(new ConeGeometry(1.4, 10, 8), matDourado);
  flecha.position.y = Y_SINO + 24;
  g.add(flecha);

  /* Holofotes lavando a pedra de baixo para cima — é assim que a torre de
     verdade é iluminada, e é o que desenha as pilastras e as janelas em luz e
     sombra em vez de deixar tudo chapado. Sem sombra (custo) e com penumbra
     alta (maciez). O ângulo é estreito para o facho subir os 100 m. */
  if (noturno) {
    const quantos = preset && preset.sombra <= 512 ? 1 : 3;
    const posicoes = [[0, 13], [-11, -7], [11, -7]].slice(0, quantos);
    for (const [lx, lz] of posicoes) {
      const refletor = new SpotLight(new Color('#ffd9a0'), 1500, 190, 0.34, 0.85, 1.4);
      refletor.position.set(lx, 1.2, lz);
      refletor.target.position.set(lx * 0.25, 62, lz * 0.25);
      refletor.castShadow = false;
      g.add(refletor, refletor.target);

      // a luminária no chão, visível e brilhando
      const caixa = new Mesh(new CylinderGeometry(0.7, 0.85, 0.7, 12),
        new MeshStandardMaterial({ color: new Color('#2b2f34'), roughness: 0.5, metalness: 0.6 }));
      caixa.position.set(lx, 0.35, lz);
      g.add(caixa);
      const lente = new Mesh(new CircleGeometry(0.62, 16), new MeshStandardMaterial({
        color: new Color('#fff2d6'), emissive: new Color('#ffd9a0'),
        emissiveIntensity: 6, roughness: 1,
      }));
      lente.position.set(lx, 0.71, lz);
      lente.rotation.x = -Math.PI / 2;
      g.add(lente);
    }

    /* Uma luz solta no estágio do relógio, para o dourado dos mostradores
       escorrer na pedra em volta em vez de ficar preso na face. É o detalhe
       que faz o relógio parecer aceso, e não colado. */
    const brilhoRelogio = new PointLight(new Color('#ffcf82'), 240, 46, 1.8);
    brilhoRelogio.position.set(0, Y_RELOGIO, 0);
    g.add(brilhoRelogio);

    const luzAyrton = new PointLight(new Color('#ffe6b8'), 90, 28, 1.6);
    luzAyrton.position.set(0, Y_SINO + 7.3, 0);
    g.add(luzAyrton);
  }

  return g;
}

/**
 * Palácio de Westminster. A primeira versão era uma caixa lisa de 150 m com
 * pontinhas em cima, e de perto lia como um galpão bege. O que faz o olho
 * dizer "gótico vitoriano" é o ritmo vertical: contraforte, janela ogival,
 * contraforte. É isso que está aqui agora.
 */
function fazParlamento({ noturno = false } = {}) {
  const g = new Group();
  const PEDRA = '#d9c9a3';
  /* De noite o Palácio é banhado por holofotes de ponta a ponta. Em vez de
     enfileirar refletores — caros e desnecessários numa fachada plana —
     a própria pedra emite de leve: dá o mesmo mel uniforme por nada. */
  const matPedra = new MeshStandardMaterial({
    color: new Color(PEDRA), roughness: 0.9,
    emissive: new Color(noturno ? '#b98a46' : '#000000'), emissiveIntensity: noturno ? 1.15 : 0,
  });
  const matSombra = new MeshStandardMaterial({
    color: new Color('#b8a480'), roughness: 0.92,
    emissive: new Color(noturno ? '#7d5c2e' : '#000000'), emissiveIntensity: noturno ? 1.15 : 0,
  });
  /* De noite, as ogivas acesas por dentro. Sem isso o Palácio ficava um bloco
     cinza morto ao lado da torre iluminada — e chamava mais atenção pelo que
     tinha de errado do que pelo que tinha de certo. */
  const matVitral = new MeshStandardMaterial({
    color: new Color(noturno ? '#ffe3b0' : '#8ea6bd'), roughness: noturno ? 1 : 0.25,
    metalness: noturno ? 0 : 0.1,
    emissive: new Color(noturno ? '#ffbc63' : '#3d4f66'),
    emissiveIntensity: noturno ? 2.4 : 0.5,
  });

  const COMP = 150;
  const ALTO = 26;

  const corpo = new Mesh(new BoxGeometry(COMP, ALTO, 22), matPedra);
  corpo.position.y = ALTO / 2;
  corpo.receiveShadow = true;
  g.add(corpo);

  // embasamento mais escuro, para a fachada não flutuar
  const base = new Mesh(new BoxGeometry(COMP + 1.4, 3.2, 23.4), matSombra);
  base.position.y = 1.6;
  g.add(base);

  const r = sorteio(4242);
  const VAOS = 25;
  const passo = COMP / VAOS;

  for (let i = 0; i < VAOS; i++) {
    const x = -COMP / 2 + passo * (i + 0.5);

    // contraforte saliente entre os vãos
    const contra = new Mesh(new BoxGeometry(1.5, ALTO - 1, 1.6), matPedra);
    contra.position.set(x - passo / 2, (ALTO - 1) / 2, 11.6);
    contra.castShadow = true;
    g.add(contra);

    // duas fileiras de janelas ogivais: retângulo alto com capuz triangular
    for (const [y, alt] of [[9, 7.5], [19, 6]]) {
      const jan = new Mesh(new BoxGeometry(passo * 0.45, alt, 0.5), matVitral);
      jan.position.set(x, y, 11.2);
      g.add(jan);
      const capuz = new Mesh(new ConeGeometry(passo * 0.3, 1.8, 3), matPedra);
      capuz.position.set(x, y + alt / 2 + 0.8, 11.2);
      capuz.rotation.y = Math.PI / 2;
      g.add(capuz);
    }

    // pináculo no coroamento
    const t = new Mesh(new BoxGeometry(1.9, r.entre(5, 8.5), 1.9), matPedra);
    t.position.set(x - passo / 2, ALTO + t.geometry.parameters.height / 2, 8);
    t.castShadow = true;
    g.add(t);
    const p = new Mesh(new ConeGeometry(1.5, 4, 4), matPedra);
    p.position.set(t.position.x, t.position.y + t.geometry.parameters.height / 2 + 2, 8);
    p.rotation.y = Math.PI / 4;
    g.add(p);
  }

  // parapeito vazado correndo o topo
  const parapeito = new Mesh(new BoxGeometry(COMP, 1.6, 1), matPedra);
  parapeito.position.set(0, ALTO + 0.8, 10.6);
  g.add(parapeito);

  // Torre Victoria, na ponta sul
  const torre = new Mesh(new BoxGeometry(17, 58, 17), matPedra);
  torre.position.set(-COMP / 2 - 3, 29, 2);
  torre.castShadow = true;
  g.add(torre);
  for (let i = 0; i < 3; i++) {
    const faixa = new Mesh(new BoxGeometry(17.6, 1, 17.6), matSombra);
    faixa.position.set(-COMP / 2 - 3, 16 + i * 14, 2);
    g.add(faixa);
  }
  const coroaTorre = new Mesh(new ConeGeometry(11, 12, 4), matPedra);
  coroaTorre.position.set(-COMP / 2 - 3, 64, 2);
  coroaTorre.rotation.y = Math.PI / 4;
  g.add(coroaTorre);

  return g;
}

/**
 * Balaustrada de pedra fechando a praça. Sem ela o calçamento da clareira
 * escapa até o horizonte e a praça vira uma mancha branca sem fim.
 */
function fazBalaustrada(comprimento, lado) {
  const g = new Group();
  const matPedra = new MeshStandardMaterial({ color: new Color('#d8d0bd'), roughness: 0.88 });
  const base = new Mesh(new BoxGeometry(1.1, 0.5, comprimento), matPedra);
  base.position.y = 0.25;
  g.add(base);
  const capa = new Mesh(new BoxGeometry(1.25, 0.28, comprimento), matPedra);
  capa.position.y = 1.42;
  g.add(capa);
  const quantos = Math.floor(comprimento / 1.1);
  for (let i = 0; i < quantos; i++) {
    const b = new Mesh(new CylinderGeometry(0.17, 0.23, 0.95, 8), matPedra);
    b.position.set(0, 0.95, -comprimento / 2 + 0.55 + i * 1.1);
    g.add(b);
  }
  // pilares de canto a cada 12 m
  for (let z = -comprimento / 2; z <= comprimento / 2; z += 12) {
    const pil = new Mesh(new BoxGeometry(1.5, 2.1, 1.5), matPedra);
    pil.position.set(0, 1.05, z);
    g.add(pil);
    const luminaria = new Mesh(new SphereGeometry(0.34, 12, 10), new MeshStandardMaterial({
      color: new Color('#fff0cf'), emissive: new Color('#ffd79a'),
      emissiveIntensity: 2.6, roughness: 1,
    }));
    luminaria.position.set(0, 2.5, z);
    g.add(luminaria);
  }
  g.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
  /* Rente à calçada, na linha onde a fileira de casas abriu. Lá fora, a 26 m,
     ela cortava a base do Big Ben ao meio; aqui vira a mureta do aterro, com
     as luminárias passando perto da câmera — que é o que dá profundidade ao
     enquadramento da torre. */
  g.position.x = lado * (FRENTE_PREDIO + 1.4);
  return g;
}

/**
 * A London Eye. Trinta e duas cápsulas, como a de verdade, e a roda em
 * balanço sobre a água — que é a assinatura dela: o A de sustentação fica em
 * terra e o aro avança por cima do rio.
 *
 * O aço é prateado-azulado e não branco. A roda real é branca, mas a cena 2 é
 * uma tarde dourada com o céu lavado em creme, e branco sobre creme não tem
 * silhueta nenhuma — some, exatamente como o Big Ben sumia na cena 1. O tom
 * frio lê como "aço branco na sombra" e devolve o desenho da estrutura.
 */
function fazRodaGigante() {
  const g = new Group();
  /* O aço ganha um emissivo azul que só acende à noite. A roda de verdade é
     banhada por refletores azuis, e sem isso a estrutura virava um vulto preto
     contra o céu escuro — as luzes das cápsulas flutuavam soltas, sem roda. */
  const matAco = new MeshStandardMaterial({
    color: new Color('#7d94a8'), roughness: 0.4, metalness: 0.45,
    emissive: new Color('#2f6fa8'), emissiveIntensity: 0,
  });
  const matAcoClaro = new MeshStandardMaterial({
    color: new Color('#93a9bb'), roughness: 0.42, metalness: 0.4,
    emissive: new Color('#3d81bd'), emissiveIntensity: 0,
  });
  const matLuz = new MeshStandardMaterial({
    color: new Color('#1b2d3a'), emissive: new Color('#6ec6ff'),
    emissiveIntensity: 1.2, roughness: 1,
  });
  const CAPSULAS = 32;
  const luzes = [];

  /* Bitolas grossas de propósito. A menina vê a roda de 60 a 140 m, e nessa
     faixa o tubo de 0,7 (0,84 depois da escala) dá 1,5 pixel: linha mais fina
     que um pixel não desenha, só acinzenta. É a mesma armadilha da treliça do
     relógio do Big Ben — a roda lia bem de perto e lavava a 87 m. */
  const aro = new Mesh(new TorusGeometry(30, 1.3, 8, 60), matAco);
  aro.position.y = 33;
  g.add(aro);
  // aro interno, onde os cabos se prendem
  const aroInterno = new Mesh(new TorusGeometry(27.6, 0.6, 6, 48), matAcoClaro);
  aroInterno.position.y = 33;
  g.add(aroInterno);
  const aro2 = new Mesh(new TorusGeometry(30, 0.28, 6, 60), matLuz);
  aro2.position.y = 33;
  aro2.position.z = 1;
  g.add(aro2);

  // cubo central
  const cubo = new Mesh(new CylinderGeometry(1.9, 1.9, 5.4, 12), matAco);
  cubo.rotation.x = Math.PI / 2;
  cubo.position.y = 33;
  g.add(cubo);

  for (let i = 0; i < CAPSULAS; i++) {
    const ang = (i / CAPSULAS) * TAU;
    // cabos radiais finos, do cubo ao aro, como os raios de uma bicicleta
    const raio = new Mesh(new CylinderGeometry(0.16, 0.16, 28, 4), matAcoClaro);
    raio.position.set(Math.cos(ang) * 15, 33 + Math.sin(ang) * 15, 0);
    raio.rotation.z = -ang + Math.PI / 2;
    g.add(raio);

    // cápsula de vidro: ovoide achatado, pendurada no lado de fora do aro
    /* Cada cápsula com material próprio: é o que permite a cor correr pela
       roda à noite, como a de verdade faz. De dia elas ficam apagadas — uma
       roda acesa às três da tarde parece brinquedo de parque. */
    /* Base ESCURA e da própria cor, não o branco-azulado de antes. O material
       soma difuso + emissivo, e depois vem exposição, bloom e ACES: uma cápsula
       de albedo quase branco entrava no tonemap já perto do topo e saía branca,
       por mais colorido que fosse o emissivo. Escurecendo a base, quem manda na
       cor é só o emissivo — que é o que se quer numa lâmpada. */
    const corCap = new Color().setHSL(i / CAPSULAS, 0.95, 0.5);
    const matCap = new MeshStandardMaterial({
      color: new Color().setHSL(i / CAPSULAS, 0.6, 0.12),
      emissive: corCap, emissiveIntensity: 0, roughness: 1,
    });
    /* Raio 32.4, não 31.3: o aro tem tubo de 1.3, então sua borda externa está
       justamente em 31.3 e as cápsulas ficavam meio enterradas nele — de um
       lado da roda a perspectiva escondia metade de cada luz. */
    const capsula = new Mesh(new SphereGeometry(1.15, 10, 7), matCap);
    capsula.scale.set(1, 0.78, 0.86);
    capsula.position.set(Math.cos(ang) * 32.4, 33 + Math.sin(ang) * 32.4, 0);
    g.add(capsula);
    luzes.push({ malha: capsula, matiz: i / CAPSULAS });
  }

  /* Plataforma na margem. A roda de verdade se apoia numa base de concreto na
     beira d'água; sem ela as pernas ficavam plantadas dentro do lago. */
  const plataforma = new Mesh(new BoxGeometry(30, 1.6, 20),
    new MeshStandardMaterial({ color: new Color('#cbc0a8'), roughness: 0.85 }));
  plataforma.position.set(0, 0.4, 5);
  plataforma.receiveShadow = true;
  g.add(plataforma);

  for (const x of [-9, 9]) {
    const perna = new Mesh(new CylinderGeometry(0.8, 1.2, 34, 8), matAco);
    perna.position.set(x, 17, 6);
    perna.rotation.x = -0.25;
    g.add(perna);
  }

  /* Acender: `t` vai de 0 (dia) a 1 (noite) e `tempo` faz a cor correr pelo
     aro. A London Eye de verdade muda de cor lentamente; aqui cada cápsula
     ganha um matiz deslocado da vizinha e o conjunto gira devagar. */
  /* Intensidade baixa de propósito. O limiar do bloom é 1.35 (`js/pos.js`) e
     depois dele vem o ACES, que dessatura tudo o que passa de ~2: a 4.6 a
     cápsula vermelha chegava no tonemap como (4.2, 1.1, 1.1) e saía rosa-claro,
     e o halo do bloom terminava de lavar. A 2.0 o canal forte fica em 1.95 —
     acima do limiar, então ainda sangra — e os fracos em 0.05. Aí é vermelho. */
  const corViva = new Color();
  g.userData.acender = (t, tempo) => {
    corViva.setHSL((tempo * 0.03) % 1, 0.9, 0.5);
    aro2.material.emissive.copy(corViva);
    aro2.material.emissiveIntensity = t * 2.1;
    matAco.emissiveIntensity = t * 0.55;
    matAcoClaro.emissiveIntensity = t * 0.35;
    for (const l of luzes) {
      l.malha.material.emissive.setHSL((l.matiz + tempo * 0.045) % 1, 0.95, 0.5);
      l.malha.material.emissiveIntensity = t * 2.0;
    }
  };
  return g;
}

/**
 * Tower Bridge. As duas torres flanqueiam a via, então ela atravessa por
 * dentro — que é exatamente como a ponte de verdade funciona: o tabuleiro
 * passa entre as torres, e as passarelas altas ligam uma à outra por cima.
 *
 * Cor de pedra clara e azul de aço, como a ponte é pintada desde 1977.
 */
/**
 * Piccadilly Circus. O que faz alguém reconhecer o lugar é uma coisa só: o
 * paredão curvo de telões acesos na esquina. Tudo o mais aqui é moldura para
 * ele — o prédio que o segura, a fonte do Eros embaixo, os ônibus vermelhos.
 *
 * Os painéis são blocos de cor grandes e chapados, de propósito. A lição que
 * já custou caro duas vezes nesta cena (a treliça do relógio do Big Ben, o aro
 * da London Eye): a 100 m, detalhe mais fino que um pixel não desenha, só
 * acinzenta. Telão de verdade tem imagem; este tem faixas de cor enormes, que
 * é o que sobrevive à distância e ainda lê como "telão".
 */
function fazPiccadilly(fase) {
  const g = new Group();
  const matPedra = new MeshStandardMaterial({ color: new Color('#c9bfae'), roughness: 0.9 });
  const matEscuro = new MeshStandardMaterial({ color: new Color('#26252b'), roughness: 0.8 });
  const matVitrine = new MeshStandardMaterial({
    color: new Color('#ffe7bd'), emissive: new Color('#ffca7a'),
    emissiveIntensity: 1.7, roughness: 1,
  });

  // o asfalto largo do cruzamento
  const chao = new Mesh(new PlaneGeometry(76, 128),
    materialChao(Mat.asfalto(fase.molhado, fase.semente + 77), [12, 20], '#7c8087'));
  chao.rotation.x = -Math.PI / 2;
  chao.position.set(36, 0.15, 0);
  chao.receiveShadow = true;
  g.add(chao);

  /* A FACHADA. Uma só, girada para olhar para dentro do cruzamento e não para
     quem vem pela rua — era essa a queixa do Daniel sobre a primeira versão,
     que eram sete torres separadas todas apontadas para a frente. */
  const fachada = new Group();
  fachada.position.set(26, 0, 32);
  fachada.rotation.y = Math.PI + 0.62;
  g.add(fachada);

  const LARG = 34, ALT = 26;
  const predio = new Mesh(new BoxGeometry(LARG, ALT + 8, 14), matPedra);
  predio.position.set(0, (ALT + 8) / 2, -7.4);
  predio.castShadow = true;
  fachada.add(predio);
  // o painel preto onde os telões são montados
  const fundo = new Mesh(new BoxGeometry(LARG - 1, ALT - 4, 0.6), matEscuro);
  fundo.position.set(0, 6 + (ALT - 4) / 2, -0.3);
  fachada.add(fundo);

  /* O mosaico. É a IRREGULARIDADE que faz reconhecer o Piccadilly: um painel
     enorme, um alto e estreito ao lado, outro grande do outro lado e uma
     fileira de menores embaixo. Três faixas iguais nunca iam ler como o lugar.
     Cada linha é [x, y, largura, altura] em fração da parede. */
  const MOSAICO = [
    [0.02, 0.52, 0.42, 0.44, '#1f4fd8'],
    [0.46, 0.74, 0.20, 0.22, '#e8b33a'],
    [0.46, 0.52, 0.20, 0.20, '#d9d4c8'],
    [0.68, 0.52, 0.30, 0.44, '#e01b2e'],
    [0.02, 0.28, 0.30, 0.22, '#20c0d8'],
    [0.34, 0.28, 0.30, 0.22, '#7c5cff'],
    [0.66, 0.28, 0.32, 0.22, '#2f9ee0'],
    [0.02, 0.06, 0.22, 0.20, '#ff7a1a'],
    [0.26, 0.06, 0.30, 0.20, '#2fe08a'],
    [0.58, 0.06, 0.18, 0.20, '#ff2f6d'],
    [0.78, 0.06, 0.20, 0.20, '#ffd23f'],
  ];
  const painel = [];
  const BASE = 6;                      // os telões começam acima das lojas
  const ALTURA_TELA = ALT - 5;
  for (const [fx, fy, fw, fh, cor] of MOSAICO) {
    const w = fw * (LARG - 2), h = fh * ALTURA_TELA;
    const px = (fx + fw / 2) * (LARG - 2) - (LARG - 2) / 2;
    const py = BASE + fy * ALTURA_TELA + h / 2 - ALTURA_TELA * 0.03;
    const tela = new Mesh(new BoxGeometry(w - 0.35, h - 0.35, 0.35), new MeshStandardMaterial({
      color: new Color(cor), emissive: new Color(cor), emissiveIntensity: 2.4, roughness: 1,
    }));
    tela.position.set(px, py, 0.25);
    fachada.add(tela);
    painel.push(tela);
  }

  // térreo: marquise e vitrines acesas, como na foto
  const marquise = new Mesh(new BoxGeometry(LARG - 1, 0.6, 3), matEscuro);
  marquise.position.set(0, 5.4, 1.4);
  fachada.add(marquise);
  for (let i = 0; i < 6; i++) {
    const v = new Mesh(new BoxGeometry(4, 3.4, 0.3), matVitrine);
    v.position.set(-LARG / 2 + 3.4 + i * 5.6, 2.6, 0.3);
    fachada.add(v);
  }

  // a luz que os telões jogam no cruzamento: é o que prova que estão acesos
  for (const [dx, cor] of [[-10, '#2f6ad8'], [10, '#e01b2e']]) {
    const brilho = new PointLight(new Color(cor), 130, 58, 1.7);
    brilho.position.set(30 + dx, 15, 22);
    g.add(brilho);
  }

  /* A fonte do Eros, numa ilha à frente da fachada — na foto ela fica solta no
     meio do cruzamento, não encostada no prédio. */
  const fonte = new Group();
  fonte.position.set(23, 0.15, -16);
  g.add(fonte);
  const ilha = new Mesh(new CylinderGeometry(7.5, 7.8, 0.35, 20), matPedra);
  ilha.receiveShadow = true;
  fonte.add(ilha);
  for (let i = 0; i < 3; i++) {
    const deg = new Mesh(new CylinderGeometry(4.6 - i * 1.1, 5 - i * 1.1, 0.42, 18), matPedra);
    deg.position.y = 0.38 + i * 0.42;
    fonte.add(deg);
  }
  const taca = new Mesh(new CylinderGeometry(2.2, 1, 1.4, 16), matPedra);
  taca.position.y = 2.3;
  fonte.add(taca);
  const pedestal = new Mesh(new CylinderGeometry(0.7, 1.1, 3.6, 12), matPedra);
  pedestal.position.y = 4.4;
  fonte.add(pedestal);
  const matBronze = new MeshStandardMaterial({
    color: new Color('#8fa89b'), roughness: 0.4, metalness: 0.7,
  });
  const eros = new Mesh(new CapsuleGeometry(0.45, 1.2, 5, 12), matBronze);
  eros.position.y = 7;
  eros.castShadow = true;
  fonte.add(eros);
  for (const lado of [-1, 1]) {
    const asa = new Mesh(new BoxGeometry(0.16, 2.2, 1), matBronze);
    asa.position.set(lado * 0.45, 7.7, -0.3);
    asa.rotation.z = lado * 0.35;
    fonte.add(asa);
  }

  /* Ônibus atravessando o cruzamento e gente na calçada, reaproveitando o que
     já existe em obstaculos.js. Sem isto a praça fica um pátio vazio, que era
     a outra metade do problema. */
  const r = sorteio(fase.semente + 909);
  for (const [bx, bz, giro] of [[18, 20, 1.35], [30, -6, -0.5], [44, 12, 2.5]]) {
    const bus = CONSTRUTORES.onibus().objeto;
    bus.position.set(bx, 0, bz);
    bus.rotation.y = giro;
    g.add(bus);
  }
  for (let i = 0; i < 16; i++) {
    const ped = CONSTRUTORES.pedestre(r).objeto;
    const a = r.entre(0, TAU);
    ped.position.set(24 + Math.cos(a) * r.entre(9, 24), 0.16, Math.sin(a) * r.entre(9, 30));
    ped.rotation.y = r.entre(0, TAU);
    g.add(ped);
  }

  // as faixas ficam guardadas no grupo: quem anima é o laço do mundo
  g.userData.painel = painel;
  return g;
}

function fazTowerBridge() {
  const g = new Group();
  const PEDRA = '#e0d6bd';
  const AZUL = '#4b7fb4';
  const matPedra = new MeshStandardMaterial({ color: new Color(PEDRA), roughness: 0.82 });
  const matAzul = new MeshStandardMaterial({ color: new Color(AZUL), roughness: 0.45, metalness: 0.35 });
  const matAzulClaro = new MeshStandardMaterial({ color: new Color('#6d9ecb'), roughness: 0.5, metalness: 0.3 });
  const matPedraFunda = new MeshStandardMaterial({ color: new Color('#bdb094'), roughness: 0.88 });

  const VAO = 11.5;      // meio-afastamento das torres
  const ALTURA = 30;     // altura do corpo da torre

  function torre(lado) {
    const t = new Group();
    t.position.x = lado * VAO;

    // pier de pedra na base
    const pier = new Mesh(Mat.caixaArredondada(10, 2.4, 12, 0.3, 2), matPedra);
    pier.position.y = 1.2;
    t.add(pier);

    // corpo, em dois blocos que afinam
    const baixo = new Mesh(Mat.caixaArredondada(7.6, ALTURA * 0.62, 9, 0.25, 2), matPedra);
    baixo.position.y = 2.4 + ALTURA * 0.31;
    t.add(baixo);
    const alto = new Mesh(Mat.caixaArredondada(6.8, ALTURA * 0.38, 8.2, 0.25, 2), matPedra);
    alto.position.y = 2.4 + ALTURA * 0.62 + ALTURA * 0.19;
    t.add(alto);

    /* Janelas ogivais azuis e cordões — o detalhe que faz ler "gótico
       vitoriano". Precisam estar TAMBÉM nas faces viradas para a rua (±z),
       porque é essa a face que ela vê durante toda a aproximação; só nas
       faces laterais, a torre virava um paredão claro sem informação. */
    for (const sz of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const jan = new Mesh(new BoxGeometry(1.5, 3.4, 0.14), matAzul);
        jan.position.set(0, 8 + i * 6.2, sz * 4.6);
        t.add(jan);
        for (const sx of [-1, 1]) {
          const j2 = new Mesh(new BoxGeometry(1.1, 3, 0.14), matAzul);
          j2.position.set(sx * 2.5, 8 + i * 6.2, sz * 4.6);
          t.add(j2);
        }
      }
    }
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const jan = new Mesh(new BoxGeometry(0.14, 3.4, 1.5), matAzul);
        jan.position.set(sx * 3.85, 8 + i * 6.2, 0);
        t.add(jan);
      }
    }
    // cordões horizontais em tom mais fundo, marcando os pavimentos
    for (const y of [6, 12.2, 18.4, 24.6]) {
      const cordao = new Mesh(new BoxGeometry(8.2, 0.7, 9.6), matPedraFunda);
      cordao.position.y = y;
      t.add(cordao);
    }

    // quatro torreões com capuz cônico
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const tur = new Mesh(new CylinderGeometry(1.15, 1.3, 8, 12), matPedra);
        tur.position.set(sx * 3.3, ALTURA + 1.5, sz * 3.9);
        t.add(tur);
        const capuz = new Mesh(new ConeGeometry(1.5, 4.2, 12), matPedra);
        capuz.position.set(sx * 3.3, ALTURA + 7.6, sz * 3.9);
        t.add(capuz);
        const pinaculo = new Mesh(new SphereGeometry(0.3, 10, 8), new MeshStandardMaterial({
          color: new Color('#d8ab4e'), roughness: 0.35, metalness: 0.7,
          emissive: new Color('#6b4d16'), emissiveIntensity: 0.6,
        }));
        pinaculo.position.set(sx * 3.3, ALTURA + 10, sz * 3.9);
        t.add(pinaculo);
      }
    }

    // telhado central e agulha
    const telhado = new Mesh(new ConeGeometry(4.6, 7, 4), matPedra);
    telhado.position.y = ALTURA + 5.4;
    telhado.rotation.y = Math.PI / 4;
    t.add(telhado);
    const agulha = new Mesh(new ConeGeometry(0.55, 5, 8), matPedra);
    agulha.position.y = ALTURA + 11;
    t.add(agulha);

    t.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return t;
  }

  g.add(torre(-1), torre(1));

  // as duas passarelas altas ligando as torres
  for (const [y, alt] of [[24.5, 1.1], [28.6, 1.4]]) {
    const p = new Mesh(Mat.caixaArredondada(VAO * 2 - 6, alt, 4.2, 0.16, 2), matAzulClaro);
    p.position.y = y;
    p.castShadow = true;
    g.add(p);
  }
  // treliça diagonal entre as passarelas
  for (let i = 0; i < 7; i++) {
    const x = -VAO + 4 + i * ((VAO * 2 - 8) / 6);
    const d = new Mesh(new CylinderGeometry(0.16, 0.16, 4.6, 6), matAzul);
    d.position.set(x, 26.6, 0);
    d.rotation.z = i % 2 === 0 ? 0.72 : -0.72;
    g.add(d);
  }

  /* Correntes de suspensão: a curva é aproximada por segmentos retos que
     descem da torre até o tabuleiro. Três segmentos já leem como catenária. */
  for (const lado of [-1, 1]) {
    for (const z of [-4.4, 4.4]) {
      let x0 = lado * (VAO - 3.4);
      let y0 = ALTURA - 1;
      const passos = [[6.5, -9], [7, -7], [7.5, -5.5]];
      for (const [dx, dy] of passos) {
        const x1 = x0 + lado * dx;
        const y1 = y0 + dy;
        const comp = Math.hypot(x1 - x0, y1 - y0);
        const corrente = new Mesh(new CylinderGeometry(0.17, 0.17, comp, 6), matAzul);
        corrente.position.set((x0 + x1) / 2, (y0 + y1) / 2, z);
        corrente.rotation.z = Math.atan2(x1 - x0, -(y1 - y0));
        g.add(corrente);
        // pendural até o tabuleiro
        const pend = new Mesh(new CylinderGeometry(0.07, 0.07, y1 - 1.2, 5), matAzul);
        pend.position.set(x1, (y1 + 1.2) / 2, z);
        g.add(pend);
        x0 = x1; y0 = y1;
      }
    }
  }

  // Guarda-corpo na borda externa da calçada, sobre a água — é ali que fica
  // na ponte de verdade, e não no meio-fio.
  const COMP_GUARDA = 104;
  for (const lado of [-1, 1]) {
    const corrimao = new Mesh(new CylinderGeometry(0.1, 0.1, COMP_GUARDA, 8), matAzul);
    corrimao.rotation.x = Math.PI / 2;
    corrimao.position.set(lado * 9.1, 1.35, 0);
    g.add(corrimao);
    const meio = new Mesh(new CylinderGeometry(0.06, 0.06, COMP_GUARDA, 6), matAzul);
    meio.rotation.x = Math.PI / 2;
    meio.position.set(lado * 9.1, 0.78, 0);
    g.add(meio);
    for (let i = 0; i <= 34; i++) {
      const balaustre = new Mesh(new BoxGeometry(0.11, 1.35, 0.11), matAzul);
      balaustre.position.set(lado * 9.1, 0.68, -COMP_GUARDA / 2 + i * (COMP_GUARDA / 34));
      g.add(balaustre);
    }
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
  /* Atenção à orientação: ela corre no sentido +Z e chega pela face -Z, então
     TODO detalhe de frente (vitrine, porta, toldo, letreiro, coração) vive em z
     negativo. Na primeira versão o toldo e o letreiro estavam em z positivo e
     ficavam escondidos atrás do prédio na cutscene. */
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
  portaLuz.position.set(0, 2.6, -1.6);
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
  toldo.position.set(0, 4.6, -1.5);
  toldo.rotation.x = -0.42;
  g.add(toldo);

  // letreiro com o nome escrito — é o que faz a chegada valer
  const textoPlaca = Mat.placaTexto(['AGÊNCIA Nº ♥', 'CORREIO DOS APAIXONADOS'], {
    corTexto: LATAO, corFundo: '#4a1219',
  });
  const placa = new Mesh(new BoxGeometry(9.6, 2.4, 0.3), new MeshStandardMaterial({
    map: textoPlaca.map,
    emissiveMap: textoPlaca.map,
    emissive: new Color('#ffffff'),
    emissiveIntensity: 0.55,
    roughness: 0.6,
  }));
  placa.position.set(0, 6.6, -0.72);
  g.add(placa);

  // dizeres do toldo, os mesmos do CSS
  const textoToldo = Mat.placaTexto(['DESDE 2021 ✦ ENTREGAS AO CORAÇÃO'], {
    largura: 1024, altura: 128, corTexto: CREME, corFundo: VERMELHO,
  });
  const faixaToldo = new Mesh(new BoxGeometry(9.4, 0.62, 0.08), new MeshStandardMaterial({
    map: textoToldo.map, roughness: 0.7,
  }));
  faixaToldo.position.set(0, 3.98, -2.42);
  g.add(faixaToldo);

  const coracao = new Mesh(new SphereGeometry(0.36, 12, 10), new MeshStandardMaterial({
    color: new Color('#ff7a8c'), emissive: new Color('#ff3d5a'),
    emissiveIntensity: 4, roughness: 1,
  }));
  coracao.position.set(0, 8.1, -0.8);
  g.add(coracao);

  // janelas acesas em cima: a parede de 11 m ficava uma laje vermelha chapada
  const matJanela = new MeshStandardMaterial({
    color: new Color('#ffd9a0'), emissive: new Color('#ffc470'),
    emissiveIntensity: 1.7, roughness: 0.8,
  });
  const matCaixilho = new MeshStandardMaterial({ color: new Color(CREME), roughness: 0.7 });
  for (const y of [8.1, 10.1]) {
    for (const x of [-4.4, 4.4]) {
      const cx = new Mesh(new BoxGeometry(1.9, 1.5, 0.1), matCaixilho);
      cx.position.set(x, y, -0.63);
      g.add(cx);
      const j = new Mesh(new BoxGeometry(1.55, 1.15, 0.12), matJanela);
      j.position.set(x, y, -0.66);
      g.add(j);
    }
  }
  // cornija coroando a fachada
  const cornija = new Mesh(new BoxGeometry(14.8, 0.5, 2), matCaixilho);
  cornija.position.set(0, 11.2, -0.4);
  g.add(cornija);

  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });

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
  // raio grande: dentro do plano distante (600) e imune ao atraso de um quadro
  // no acompanhamento da câmera
  ceu.malha.scale.setScalar(450);
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

  /* Clareiras: trechos onde a fileira de casas abre para o marco caber.
     `lado` 0 abre nos dois lados. */
  const clareiras = (fase.pontos || [])
    .filter((p) => p.claro)
    .map((p) => ({ de: p.z - p.claro / 2, ate: p.z + p.claro / 2, lado: p.lado || 0 }));

  function naClareira(z, lado, meia = 0) {
    for (const c of clareiras) {
      if (c.lado !== 0 && c.lado !== lado) continue;
      if (z + meia > c.de && z - meia < c.ate) return true;
    }
    return false;
  }

  function montarBloco(g, indice, registro) {
    while (g.children.length) g.remove(g.children[0]);
    registro.postes.length = 0;
    const r = sorteio(fase.semente * 7717 + indice * 131);
    const z0 = indice * BLOCO;
    g.position.z = z0;

    if (fase.tipo === 'parque') {
      /* O parque era uma fileira fina de árvores colada no caminho, de um lado
         só, e atrás dela grama vazia até o horizonte — dos dois lados. Agora
         são três faixas: bosque perto do caminho, bosque fundo atrás dele, e
         uma linha de árvores na margem de lá da água. A do lago fica ALÉM do
         lago (que vai de x=-58 a x=-11), então ela emoldura a água em vez de
         tapar a vista, que era o motivo de não haver nada daquele lado. */
      const cores = fase.coresFolhagem;
      /* A primeira faixa começa em 4.5 e não em 7. Num celular em pé a abertura
         horizontal é estreita, e árvore encostada no caminho é a única que
         entra no quadro perto — as de x=7 só apareciam quando já estavam longe
         demais, comidas pela neblina. */
      const faixas = [
        { de: 4.5, ate: 24, quantas: [6, 9], escala: [0.8, 1.25] },
        { de: 24, ate: 60, quantas: [7, 11], escala: [1.0, 1.6] },
        { de: -96, ate: -62, quantas: [4, 7], escala: [0.95, 1.4] },
      ];
      for (const f of faixas) {
        const quantas = Math.round(r.inteiro(f.quantas[0], f.quantas[1]) * preset.arvores);
        for (let i = 0; i < quantas; i++) {
          const a = fazArvore(r, cores);
          a.position.set(r.entre(f.de, f.ate), 0, r.entre(0, BLOCO));
          a.scale.setScalar(r.entre(f.escala[0], f.escala[1]));
          g.add(a);
        }
      }
      // arbustos rentes ao caminho, do lado do lago, para a beirada não ser
      // uma faixa de grama pelada
      if (r.chance(0.7)) {
        const arb = fazArvore(r, cores);
        arb.position.set(r.entre(-10.4, -9.4), -0.9, r.entre(1, BLOCO - 1));
        arb.scale.setScalar(r.entre(0.42, 0.62));
        g.add(arb);
      }
      // bancos do parque e postes baixos, sempre fora das faixas
      if (r.chance(0.6)) {
        const b = prop('bancoParque', () => {
          const bg = new Group();
          const matMad = new MeshStandardMaterial({ color: new Color('#8a5a34'), roughness: 0.85 });
          const assento = new Mesh(Mat.caixaArredondada(1.7, 0.12, 0.5, 0.05, 2), matMad);
          assento.position.y = 0.48;
          bg.add(assento);
          const encosto = new Mesh(Mat.caixaArredondada(1.7, 0.42, 0.1, 0.04, 2), matMad);
          encosto.position.set(0, 0.74, -0.2);
          bg.add(encosto);
          const matFerro = new MeshStandardMaterial({ color: new Color('#3a4a44'), roughness: 0.5, metalness: 0.5 });
          for (const x of [-0.7, 0.7]) {
            const pe = new Mesh(new BoxGeometry(0.08, 0.48, 0.44), matFerro);
            pe.position.set(x, 0.24, 0);
            bg.add(pe);
          }
          bg.traverse((o) => { if (o.isMesh) o.castShadow = true; });
          return bg;
        });
        // do lado do lago, virado para a água
        b.position.set(-7.4, 0, r.entre(2, BLOCO - 2));
        b.rotation.y = -Math.PI / 2;
        g.add(b);
      }
    } else {
      // cada lado tem seu próprio cursor: as casas ficam encostadas umas nas
      // outras formando a fileira, com larguras diferentes de cada lado.
      // Onde há um marco no trajeto, a fileira abre a clareira dele.
      for (const lado of [-1, 1]) {
        let z = 0;
        while (z < BLOCO) {
          const p = predio(r, fachadas, lado);
          const zMundo = z0 + z + p.largura / 2;
          // o prédio é sorteado de qualquer jeito para o sorteio seguir
          // determinístico; só não entra na cena se cair numa clareira
          if (naClareira(zMundo, lado, p.largura / 2)) {
            z += p.largura;
            continue;
          }
          p.grupo.position.z = z + p.largura / 2;
          g.add(p.grupo);
          z += p.largura;
        }
      }
      // adereços, encostados no meio-fio e não na parede — assim ficam
      // legíveis como objetos na calçada em vez de manchas na fachada
      if (r.chance(0.45)) {
        const lado = r.chance(0.5) ? -1 : 1;
        const zl = r.entre(2, BLOCO - 2);
        if (!naClareira(z0 + zl, lado, 1)) {
          const c = prop('cabine', fazCabineTelefonica);
          c.position.set(lado * r.entre(5.6, 6.4), 0.16, zl);
          c.rotation.y = r.entre(-0.35, 0.35);
          g.add(c);
        }
      }
      if (r.chance(0.4)) {
        const lado = r.chance(0.5) ? -1 : 1;
        const zl = r.entre(2, BLOCO - 2);
        if (!naClareira(z0 + zl, lado, 1)) {
          const cx = prop('correio', fazCaixaCorreio);
          cx.position.set(lado * r.entre(5.5, 6.1), 0.16, zl);
          g.add(cx);
        }
      }

      /* Gente na calçada e um ônibus parado. A rua tinha 900 m com uma cabine
         telefônica a cada dois quarteirões e mais nada — "só um branco que
         você corre por muito tempo", nas palavras do Daniel. Nada disto entra
         nas faixas: é tudo cenário, encostado na parede ou no meio-fio. */
      const quantosPed = r.inteiro(2, 4);
      for (let i = 0; i < quantosPed; i++) {
        const lado = r.chance(0.5) ? -1 : 1;
        const zl = r.entre(1, BLOCO - 1);
        if (naClareira(z0 + zl, lado, 1)) continue;
        const ped = CONSTRUTORES.pedestre(r).objeto;
        ped.position.set(lado * r.entre(6.2, 8.4), 0.16, zl);
        ped.rotation.y = r.entre(0, TAU);
        g.add(ped);
      }
      if (r.chance(0.3)) {
        const lado = r.chance(0.5) ? -1 : 1;
        const zl = r.entre(3, BLOCO - 8);
        if (!naClareira(z0 + zl, lado, 6)) {
          const bus = CONSTRUTORES.onibus().objeto;
          bus.position.set(lado * 4.2, 0, zl);
          bus.rotation.y = lado > 0 ? 0 : Math.PI;
          g.add(bus);
        }
      }

      // carrinhos estacionados: dão cor e escala à rua sem entrar nas faixas
      const CORES_CARRO = ['#c02a3e', '#4f7fb8', '#e0b24a', '#5d9e86', '#d98a68', '#f0f0e8'];
      const quantosCarros = r.inteiro(2, 3);
      for (let i = 0; i < quantosCarros; i++) {
        const lado = r.chance(0.5) ? -1 : 1;
        const cor = CORES_CARRO[r.inteiro(0, CORES_CARRO.length - 1)];
        const zl = r.entre(1, BLOCO - 3);
        if (naClareira(z0 + zl, lado, 2)) continue;
        const carro = prop('carro' + cor, () => fazCarrinho(cor));
        carro.position.set(lado * r.entre(FAIXA_CARRO - 0.2, FAIXA_CARRO + 0.2), 0, zl);
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

  /* marcos parados no trajeto, pelos quais ela realmente passa */
  const pontosGrupo = new Group();
  grupo.add(pontosGrupo);
  const telas = [];
  const acendiveis = [];
  const pontos = criarPontos(fase, pontosGrupo, preset, telas, acendiveis);

  /* marcos distantes, de pano de fundo */
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

  /* ── o dia caindo ──────────────────────────────────────────────────────
     Se a fase tem `paletaFim`, tudo o que define a hora do dia é interpolado
     pela distância percorrida: os uniformes do céu, a cor da neblina, o sol, o
     hemisférico e a força dos postes. É o que transforma a tarde do parque em
     hora azul bem quando ela chega na roda-gigante.
     ────────────────────────────────────────────────────────────────────── */
  const A = fase.paletaFim ? new Color() : null;
  const B = fase.paletaFim ? new Color() : null;
  let anoitecer = 0;

  function misturarCor(alvo, de, para, t) {
    A.set(de); B.set(para);
    alvo.copy(A).lerp(B, t);
  }

  function aplicarAnoitecer(zJogador) {
    if (!fase.paletaFim) return;
    const faixa = fase.anoitece || { de: 0.2, ate: 0.9 };
    const bruto = limita(zJogador / fase.comprimento, 0, 1);
    const t = limita((bruto - faixa.de) / (faixa.ate - faixa.de), 0, 1);
    // suaviza as pontas, senão o céu "liga" de repente no começo e no fim
    anoitecer = t * t * (3 - 2 * t);

    /* As luzes correm a cada quadro, o céu só quando muda de verdade.
       Estavam as duas coisas depois da mesma guarda, e aí bastava o anoitecer
       terminar — que é exatamente quando a roda aparece — para as cores
       congelarem no matiz em que estavam. */
    for (const acender of acendiveis) acender(anoitecer, tempo);

    if (Math.abs(anoitecer - aplicarAnoitecer.ultimo) < 0.002) return;
    aplicarAnoitecer.ultimo = anoitecer;

    const u = ceu.malha.material.uniforms;
    const p0 = fase.paleta, p1 = fase.paletaFim;
    misturarCor(u.corAlto.value, p0.ceuAlto, p1.ceuAlto, anoitecer);
    misturarCor(u.corHorizonte.value, p0.ceuHorizonte, p1.ceuHorizonte, anoitecer);
    misturarCor(u.corBaixo.value, p0.ceuBaixo, p1.ceuBaixo, anoitecer);
    misturarCor(u.corSol.value, p0.corSol, p1.corSol, anoitecer);
    u.tamanhoSol.value = mistura(p0.tamanhoSol ?? 160, p1.tamanhoSol ?? 160, anoitecer);
    u.forcaSol.value = mistura(p0.forcaSol ?? 1, p1.forcaSol ?? 1, anoitecer);
    u.neblina.value = mistura(p0.neblinaCeu ?? 0.35, p1.neblinaCeu ?? 0.35, anoitecer);
    u.dirSol.value.fromArray(p1.dirSol).normalize().lerp(
      new Vector3().fromArray(p0.dirSol).normalize(), 1 - anoitecer).normalize();

    misturarCor(cena.fog.color, p0.ceuHorizonte,
      fase.corNeblinaFim ?? p1.ceuHorizonte, anoitecer);
    cena.fog.density = mistura(fase.neblina, fase.neblinaFim ?? fase.neblina, anoitecer);

    misturarCor(sol.color, fase.corSol, fase.corSolFim ?? fase.corSol, anoitecer);
    sol.intensity = mistura(fase.forcaLuzSol, fase.forcaLuzSolFim ?? fase.forcaLuzSol, anoitecer);
    misturarCor(ceuLuz.color, fase.corCeuLuz, fase.corCeuLuzFim ?? fase.corCeuLuz, anoitecer);
    misturarCor(ceuLuz.groundColor, fase.corChaoLuz, fase.corChaoLuzFim ?? fase.corChaoLuz, anoitecer);
    ceuLuz.intensity = mistura(fase.forcaHemisferio, fase.forcaHemisferioFim ?? fase.forcaHemisferio, anoitecer);

    /* O env map é assado uma vez, do céu da tarde, e não reassa nunca — é caro
       demais para refazer correndo. Sem baixar a intensidade dele, o mundo
       inteiro continuava recebendo a luz da tarde depois de escurecer: o céu
       virava noite e a grama seguia verde-claro, a água azul-piscina. */
    cena.environmentIntensity = mistura(1, fase.ambienteFim ?? 0.22, anoitecer);

    if (chao.userData.agua && fase.corAguaFim) {
      misturarCor(chao.userData.agua.color, fase.corAgua, fase.corAguaFim, anoitecer);
    }

    // os postes do parque acendem junto
    const forca = mistura(fase.forcaPoste, fase.forcaPosteFim ?? fase.forcaPoste, anoitecer);
    for (const l of lanternas) l.userData.forca = forca;

    // e a roda-gigante acende com o céu
    for (const acender of acendiveis) acender(anoitecer, tempo);
  }
  aplicarAnoitecer.ultimo = -1;

  function atualizar(dt, zJogador, camPos) {
    tempo += dt;
    aplicarAnoitecer(zJogador);

    /* Os telões do Piccadilly piscam devagar, cada faixa no seu ritmo. É só a
       intensidade que varia — trocar a cor a cada quadro dava um estrobo, e o
       que se quer é a sensação de imagem mudando, não uma discoteca. */
    for (let i = 0; i < telas.length; i++) {
      const m = telas[i].material;
      m.emissiveIntensity = 2.1 + Math.sin(tempo * (0.7 + (i % 5) * 0.23) + i) * 0.9;
    }

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
        // a força vem do anoitecer quando a fase tem pôr do sol
        if (l.userData.forca !== undefined) l.intensity = l.userData.forca;
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
    // os marcos do trajeto têm geometria e material próprios, criados uma vez
    pontosGrupo.traverse((o) => {
      if (o.isMesh) {
        if (o.geometry) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
      }
    });
    limparProps();

    marcos.traverse((o) => {
      if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); }
    });
    cena.environment = null;
  }

  return { grupo, atualizar, dispose, sol, ceu, blocos, chuva, pontos };
}
