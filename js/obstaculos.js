/* ═══════════════ obstáculos e coletáveis ═══════════════
   A colisão é puramente geométrica: cada obstáculo é uma caixa com altura de
   início e de fim. Coisa baixa ocupa de 0 até a sua altura, então pular passa
   por cima sozinho; coisa suspensa ocupa de 1,05 m para cima, então agachar
   passa por baixo sozinho. Nenhum caso especial no código de colisão.
   ═══════════════════════════════════════════════════════ */

import { Group, Mesh, MeshStandardMaterial, MeshPhysicalMaterial, BoxGeometry, ConeGeometry,
         CylinderGeometry, SphereGeometry, CircleGeometry, TorusGeometry, Color, DoubleSide } from 'three';
import { TAU, mistura, sorteio } from './util.js';
import * as Mat from './materiais.js';

const geos = {};
const mats = {};

function geo(chave, faz) {
  if (!geos[chave]) geos[chave] = faz();
  return geos[chave];
}
function mat(chave, faz) {
  if (!mats[chave]) mats[chave] = faz();
  return mats[chave];
}

function padrao(cor, opcoes = {}) {
  return new MeshStandardMaterial({ color: new Color(cor), roughness: 0.8, metalness: 0.05, ...opcoes });
}

export function liberarRecursos() {
  Object.values(geos).forEach((g) => g.dispose());
  Object.values(mats).forEach((m) => m.dispose());
  for (const k in geos) delete geos[k];
  for (const k in mats) delete mats[k];
}

/* ── construtores de cada peça ─────────────────────────────────────────── */

function cone() {
  const g = new Group();
  const corpo = new Mesh(geo('cone', () => new ConeGeometry(0.21, 0.58, 12)),
    mat('laranja', () => padrao('#d4551f', { roughness: 0.6 })));
  corpo.position.y = 0.29;
  g.add(corpo);
  const faixa = new Mesh(geo('coneFaixa', () => new CylinderGeometry(0.135, 0.16, 0.09, 12)),
    mat('branco', () => padrao('#e8e4dc', { roughness: 0.5 })));
  faixa.position.y = 0.33;
  g.add(faixa);
  const base = new Mesh(geo('coneBase', () => new BoxGeometry(0.38, 0.045, 0.38)),
    mat('preto', () => padrao('#1b1a1c', { roughness: 0.7 })));
  base.position.y = 0.022;
  g.add(base);
  return { objeto: g, ml: 0.24, mp: 0.24, y0: 0, y1: 0.6 };
}

function caixote() {
  const g = new Group();
  const c = new Mesh(geo('caixote', () => new BoxGeometry(0.7, 0.7, 0.7)),
    mat('madeira', () => padrao('#6b4a2c', { roughness: 0.88 })));
  c.position.y = 0.35;
  g.add(c);
  for (const y of [0.12, 0.58]) {
    const ripa = new Mesh(geo('ripa', () => new BoxGeometry(0.73, 0.07, 0.73)),
      mat('madeiraClara', () => padrao('#8a6540', { roughness: 0.85 })));
    ripa.position.y = y;
    g.add(ripa);
  }
  return { objeto: g, ml: 0.36, mp: 0.36, y0: 0, y1: 0.72 };
}

function lixeira() {
  const g = new Group();
  const c = new Mesh(geo('lixeira', () => new CylinderGeometry(0.26, 0.22, 0.78, 14)),
    mat('metalEscuro', () => padrao('#2c3138', { roughness: 0.42, metalness: 0.6 })));
  c.position.y = 0.39;
  g.add(c);
  const tampa = new Mesh(geo('lixeiraTampa', () => new CylinderGeometry(0.29, 0.29, 0.06, 14)),
    mat('metalClaro', () => padrao('#3f4650', { roughness: 0.35, metalness: 0.7 })));
  tampa.position.y = 0.79;
  g.add(tampa);
  return { objeto: g, ml: 0.29, mp: 0.29, y0: 0, y1: 0.82 };
}

function banco(corMadeira = '#5c3a24') {
  const g = new Group();
  const assento = new Mesh(geo('bancoAssento', () => new BoxGeometry(1.5, 0.09, 0.44)),
    mat('bancoMad' + corMadeira, () => padrao(corMadeira, { roughness: 0.86 })));
  assento.position.y = 0.46;
  g.add(assento);
  const encosto = new Mesh(geo('bancoEncosto', () => new BoxGeometry(1.5, 0.36, 0.07)),
    mat('bancoMad' + corMadeira, () => padrao(corMadeira, { roughness: 0.86 })));
  encosto.position.set(0, 0.66, -0.19);
  encosto.rotation.x = -0.16;
  g.add(encosto);
  const matFerro = mat('ferro', () => padrao('#20242a', { roughness: 0.5, metalness: 0.55 }));
  for (const x of [-0.62, 0.62]) {
    const pe = new Mesh(geo('bancoPe', () => new BoxGeometry(0.08, 0.46, 0.4)), matFerro);
    pe.position.set(x, 0.23, 0);
    g.add(pe);
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { objeto: g, ml: 0.78, mp: 0.26, y0: 0, y1: 0.78 };
}

/** Poça: não machuca, só molha o sapato e faz barulho. */
function poca() {
  const g = new Group();
  const disco = new Mesh(
    geo('poca', () => new CircleGeometry(0.75, 20)),
    /* Mesma armadilha do envidraçado do ônibus, e pelo mesmo motivo: `#0a0e14`
       com aspereza 0,02 é espelho sobre quase-preto, e espelho só tem a cor do
       que está em volta. Onde há céu em cima ela fica linda; onde não há — na
       cena da noite, embaixo de marquise, encostada num ônibus — ela não tem
       cor NENHUMA para mostrar e vira um buraco recortado no asfalto.

       Continua poça: espelhada o bastante para devolver o poste e a vitrine. O
       que muda é ter chão próprio — uma cor de água escura de verdade e uma
       emissiva mínima — para o pior caso ser "água escura" e não "buraco". */
    mat('agua', () => new MeshPhysicalMaterial({
      color: new Color('#1d2836'), roughness: 0.07, metalness: 0.0,
      transmission: 0, clearcoat: 1, clearcoatRoughness: 0.04, side: DoubleSide,
      emissive: new Color('#141d28'), emissiveIntensity: 0.35,
    }))
  );
  disco.rotation.x = -Math.PI / 2;
  disco.position.y = 0.012;
  disco.scale.set(1, 1.5, 1);
  g.add(disco);
  return { objeto: g, ml: 0.7, mp: 0.9, y0: 0, y1: 0.05, inofensivo: true };
}

/** Galho baixo: ocupa de 1,05 m para cima, então só passa quem se abaixa. */
function galho() {
  const g = new Group();
  const matGalho = mat('galho', () => padrao('#4a3a2a', { roughness: 0.95 }));
  const tronco = new Mesh(geo('galhoTronco', () => new CylinderGeometry(0.09, 0.13, 2.6, 8)), matGalho);
  tronco.rotation.z = Math.PI / 2;
  tronco.position.y = 1.4;
  g.add(tronco);
  const r = sorteio(7);
  const matFolha = mat('folhaOutono', () => padrao('#8d5a22', { roughness: 0.9 }));
  for (let i = 0; i < 10; i++) {
    const f = new Mesh(geo('tufo', () => new SphereGeometry(0.24, 8, 6)), matFolha);
    f.position.set(r.entre(-1.2, 1.2), 1.4 + r.entre(-0.12, 0.3), r.entre(-0.25, 0.25));
    f.scale.set(1, 0.65, 1);
    g.add(f);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { objeto: g, ml: 1.25, mp: 0.35, y0: 1.05, y1: 2.4 };
}

/** Barra de andaime — a versão urbana do galho. */
function barreiraAlta() {
  const g = new Group();
  const matTubo = mat('tubo', () => padrao('#8a8f96', { roughness: 0.4, metalness: 0.75 }));
  const barra = new Mesh(geo('tuboH', () => new CylinderGeometry(0.07, 0.07, 2.4, 10)), matTubo);
  barra.rotation.z = Math.PI / 2;
  barra.position.y = 1.35;
  g.add(barra);
  const fita = new Mesh(geo('fita', () => new BoxGeometry(2.4, 0.13, 0.02)),
    mat('fitaObra', () => padrao('#d8bb2a', { roughness: 0.7, emissive: new Color('#4a3d05') })));
  fita.position.y = 1.18;
  g.add(fita);
  for (const x of [-1.15, 1.15]) {
    const pe = new Mesh(geo('tuboV', () => new CylinderGeometry(0.06, 0.06, 2.6, 10)), matTubo);
    pe.position.set(x, 1.3, 0);
    g.add(pe);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { objeto: g, ml: 1.2, mp: 0.22, y0: 1.02, y1: 2.5 };
}

/** Pedestre com guarda-chuva, andando na direção contrária. */
function pedestre(r) {
  const g = new Group();
  const cores = ['#2b3038', '#3a2f3d', '#243038', '#33302a'];
  const matCasaco = padrao(r ? r.escolhe(cores) : cores[0], { roughness: 0.85 });
  const corpo = new Mesh(geo('pedCorpo', () => new CylinderGeometry(0.17, 0.24, 0.95, 10)), matCasaco);
  corpo.position.y = 0.62;
  g.add(corpo);
  const cabeca = new Mesh(geo('pedCabeca', () => new SphereGeometry(0.1, 10, 8)),
    mat('pelePed', () => padrao('#c69b7b', { roughness: 0.7 })));
  cabeca.position.y = 1.22;
  g.add(cabeca);
  const pernas = new Mesh(geo('pedPernas', () => new BoxGeometry(0.26, 0.42, 0.2)),
    mat('calcaPed', () => padrao('#1e1c22', { roughness: 0.85 })));
  pernas.position.y = 0.21;
  g.add(pernas);

  const guardaChuva = new Group();
  guardaChuva.position.y = 1.5;
  const cupula = new Mesh(geo('cupula', () => new SphereGeometry(0.52, 14, 8, 0, TAU, 0, Math.PI / 2)),
    padrao(r && r.chance(0.3) ? '#7a2230' : '#1d2026', { roughness: 0.6, side: DoubleSide }));
  cupula.scale.y = 0.55;
  guardaChuva.add(cupula);
  const cabo = new Mesh(geo('cabo', () => new CylinderGeometry(0.018, 0.018, 0.6, 6)),
    mat('caboMad', () => padrao('#4a3524', { roughness: 0.8 })));
  cabo.position.y = -0.28;
  guardaChuva.add(cabo);
  g.add(guardaChuva);

  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });

  return {
    objeto: g, ml: 0.34, mp: 0.34, y0: 0, y1: 1.75,
    dados: { velocidade: 1.1 + (r ? r() * 0.7 : 0.3), balanco: r ? r() * TAU : 0, guardaChuva },
    atualizar(dt, o) {
      // ela vem andando na direção contrária, então recua no eixo do trajeto
      o.grupo.position.z -= o.dados.velocidade * dt;
      o.z -= o.dados.velocidade * dt;
      o.dados.balanco += dt * 6;
      o.grupo.rotation.z = Math.sin(o.dados.balanco) * 0.035;
      o.dados.guardaChuva.rotation.z = Math.sin(o.dados.balanco * 0.5) * 0.06;
      o.grupo.rotation.y = Math.PI;
    },
  };
}

/** Cachorro atravessando a alameda do parque. */
function cachorro(r) {
  const g = new Group();
  const matPelo = padrao(r && r.chance(0.5) ? '#6b4a30' : '#2b2622', { roughness: 0.9 });
  const corpo = new Mesh(geo('cachorroCorpo', () => new CapsuleLike()), matPelo);
  corpo.position.y = 0.42;
  corpo.rotation.z = Math.PI / 2;
  g.add(corpo);
  const cabeca = new Mesh(geo('cachorroCabeca', () => new SphereGeometry(0.15, 10, 8)), matPelo);
  cabeca.position.set(0, 0.55, 0.34);
  g.add(cabeca);
  const matPata = matPelo;
  for (const [x, z] of [[-0.1, 0.22], [0.1, 0.22], [-0.1, -0.22], [0.1, -0.22]]) {
    const p = new Mesh(geo('pata', () => new CylinderGeometry(0.045, 0.045, 0.4, 6)), matPata);
    p.position.set(x, 0.2, z);
    g.add(p);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  const direcao = r && r.chance(0.5) ? 1 : -1;
  return {
    objeto: g, ml: 0.3, mp: 0.42, y0: 0, y1: 0.72,
    dados: { dir: direcao, base: 0, t: r ? r() * 10 : 0 },
    atualizar(dt, o) {
      o.dados.t += dt;
      // vai e volta entre as faixas, atravessando a alameda
      const desloca = Math.sin(o.dados.t * 1.1) * 3.4;
      o.grupo.position.x = o.xBase + desloca * o.dados.dir;
      o.x = o.grupo.position.x;
      o.grupo.rotation.y = Math.cos(o.dados.t * 1.1) * o.dados.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      o.grupo.position.y = Math.abs(Math.sin(o.dados.t * 9)) * 0.06;
    },
  };
}

// pequeno atalho: o three só ganhou CapsuleGeometry com esses parâmetros,
// e o corpo do cachorro fica melhor com uma cápsula deitada
function CapsuleLike() {
  return new CylinderGeometry(0.16, 0.16, 0.62, 10, 1, false);
}

/** Ônibus vermelho de dois andares, parado no ponto — bloqueia uma faixa. */
/* O letreiro de destino. Ônibus de Londres mostra o número da linha e para
   onde vai; aqui todos são da linha 1D, e o destino muda.

   Vai na FRENTE e no lado esquerdo local — que é sempre o lado virado para ela,
   porque o ônibus da calçada da direita nasce girado meia-volta. Sem o letreiro
   lateral a piada só existiria para quem viesse de frente, e ela vem por trás.

   Tamanho pensado para ser lido correndo: 2,2 m de painel a uns 8 m de
   distância dão quase 180 px de largura na tela. Menor que isso é a armadilha
   de sempre — letra menor que um pixel não desenha, só acinzenta. */
function painelDeOnibus(linhas, larg, alt, corTexto, corFundo, brilho) {
  /* `aperto: 1.35` porque a fonte pode não ter carregado. O jogo abre em
     `file://` e sem internet; aí "Alfa Slab One" não chega e o texto cai na
     serifa do sistema, que é bem mais estreita — o nome ficava ocupando meio
     painel. Com o aperto ele cresce até bater na largura e para lá (o próprio
     `placaTexto` espreme o que não couber), então enche o painel nos dois
     casos. */
  const tex = Mat.placaTexto(linhas, {
    largura: 1024, altura: 200, corTexto, corFundo,
    fonte: 'Alfa Slab One', filete: false, aperto: 1.35,
  });
  return new Mesh(new BoxGeometry(larg, alt, 0.06), new MeshStandardMaterial({
    map: tex.map, emissiveMap: tex.map,
    emissive: new Color('#ffffff'), emissiveIntensity: brilho, roughness: 0.9,
  }));
}

function letreiro(destino) {
  const g = new Group();
  const nome = painelDeOnibus([destino], 1.62, 0.62, '#ffcf7a', '#0d0d10', 0.9);
  const linha = painelDeOnibus(['1D'], 0.52, 0.62, '#f6f2e6', '#0d0d10', 0.9);
  nome.position.x = -0.29;
  linha.position.x = 0.82;
  g.add(nome, linha);
  return g;
}

function onibus(destino) {
  const g = new Group();
  const matVermelho = mat('onibusVermelho', () => padrao('#9c2233', { roughness: 0.42, metalness: 0.25 }));
  /* O envidraçado do ônibus, e o motivo de ele ter sido refeito.

     A primeira versão era um espelho: `#0e1418` com aspereza 0,08 e verniz 1.
     Espelho não tem cor própria — ele devolve o que está em volta. De dia, com
     o céu inteiro em cima, isso dava o cinza-prata bonito de vidro de ônibus.
     À noite, e em qualquer ângulo que apontasse para o escuro, não havia nada
     para devolver: as duas faixas de janela viravam UM RETÂNGULO PRETO CHAPADO,
     de aresta dura, que a Isadora via como um quadrado preto colado no ônibus.
     E como ônibus só existe nas duas cenas de rua — o parque não tem nenhum —
     o defeito aparecia na primeira e na última cena e não na do meio, que foi
     exatamente o que ela descreveu.

     O conserto é tirar o espelho, não escurecer mais nem clarear: aspereza de
     verdade (0,34), vidro azulado com cor PRÓPRIA e uma emissiva mínima. Assim
     ele continua sendo vidro escuro de dia e vira vidro escuro à noite, em vez
     de virar buraco. */
  const matVidro = mat('vidroOnibus', () => new MeshPhysicalMaterial({
    color: new Color('#28323d'), roughness: 0.34, metalness: 0.1,
    clearcoat: 1, clearcoatRoughness: 0.28,
    emissive: new Color('#212d38'), emissiveIntensity: 0.5,
  }));
  const corpo = new Mesh(geo('onibusCorpo', () => new BoxGeometry(2.5, 4.1, 10.5)), matVermelho);
  corpo.position.y = 2.35;
  g.add(corpo);
  for (const y of [1.85, 3.5]) {
    const janelas = new Mesh(geo('onibusJanela', () => new BoxGeometry(2.54, 0.95, 9.2)), matVidro);
    janelas.position.y = y;
    g.add(janelas);
  }
  const matPneu = mat('pneu', () => padrao('#111', { roughness: 0.9 }));
  for (const z of [-3.4, 3.2]) {
    for (const x of [-1.2, 1.2]) {
      const pneu = new Mesh(geo('pneu', () => new CylinderGeometry(0.52, 0.52, 0.3, 14)), matPneu);
      pneu.rotation.z = Math.PI / 2;
      pneu.position.set(x, 0.52, z);
      g.add(pneu);
    }
  }
  const faixa = new Mesh(geo('onibusFaixa', () => new BoxGeometry(2.56, 0.4, 6)),
    mat('creme', () => padrao('#f8eeda', { roughness: 0.6 })));
  faixa.position.set(0, 2.75, 0.6);
  g.add(faixa);

  /* Sem destino é o ônibus-obstáculo de sempre. Com destino, ele entra na
     linha 1D e ganha duas coisas.

     O letreiro da frente é o correto e o bonito — e é ilegível de onde ela
     corre. Ela vem por trás, então o que ela vê primeiro é a traseira, e o
     letreiro de 1,6 m a 20 m de distância vira uma tarja preta. Medi e é isso.

     Quem carrega o nome é o ANÚNCIO DA LATERAL, embaixo das janelas do andar de
     baixo — onde ônibus de Londres leva publicidade de verdade. Cinco metros e
     meio de painel a oito metros dela: dá quase meia tela, e lê-se correndo,
     que era o critério da coisa toda. */
  if (destino) {
    const frente = letreiro(destino);
    frente.position.set(0, 4.02, 5.29);
    g.add(frente);

    const anuncio = painelDeOnibus([destino], 5.4, 0.92, '#ffd98a', '#1b1016', 0.7);
    anuncio.position.set(-1.28, 0.95, 0.2);
    anuncio.rotation.y = -Math.PI / 2;
    g.add(anuncio);

    const marca = painelDeOnibus(['1D'], 1.15, 0.92, '#1b1016', '#f2e6cd', 0.55);
    marca.position.set(-1.28, 0.95, -3.35);
    marca.rotation.y = -Math.PI / 2;
    g.add(marca);
  }

  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { objeto: g, ml: 1.3, mp: 5.3, y0: 0, y1: 4.4 };
}

/** Bicicleta de entrega encostada. */
function bicicleta() {
  const g = new Group();
  const matQuadro = mat('quadroBike', () => padrao('#1d5c4f', { roughness: 0.4, metalness: 0.5 }));
  const matAro = mat('aro', () => padrao('#15171a', { roughness: 0.6, metalness: 0.3 }));
  for (const z of [-0.52, 0.52]) {
    const roda = new Mesh(geo('roda', () => new TorusGeometry(0.34, 0.045, 8, 20)), matAro);
    roda.position.set(0, 0.36, z);
    roda.rotation.y = Math.PI / 2;
    g.add(roda);
  }
  const quadro = new Mesh(geo('quadroBike', () => new BoxGeometry(0.07, 0.42, 1)), matQuadro);
  quadro.position.y = 0.6;
  g.add(quadro);
  const cesto = new Mesh(geo('cesto', () => new BoxGeometry(0.3, 0.26, 0.34)),
    mat('cestoPalha', () => padrao('#9a7a44', { roughness: 0.95 })));
  cesto.position.set(0, 0.86, 0.48);
  g.add(cesto);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { objeto: g, ml: 0.3, mp: 0.62, y0: 0, y1: 1.05 };
}

/** Monte de folhas — inofensivo, só levanta folhas quando ela passa. */
function folhas() {
  const g = new Group();
  const r = sorteio(31);
  const matF = mat('folhaSeca', () => padrao('#a9651f', { roughness: 0.95 }));
  for (let i = 0; i < 14; i++) {
    const f = new Mesh(geo('folhaPlana', () => new CircleGeometry(0.14, 5)), matF);
    f.rotation.x = -Math.PI / 2 + r.entre(-0.3, 0.3);
    f.rotation.z = r() * TAU;
    f.position.set(r.entre(-0.7, 0.7), 0.02 + r() * 0.1, r.entre(-0.5, 0.5));
    g.add(f);
  }
  return { objeto: g, ml: 0.75, mp: 0.6, y0: 0, y1: 0.16, inofensivo: true };
}

/**
 * Portão de loja que abre e fecha num ciclo. Nunca bloqueia mais de uma faixa,
 * então dá sempre para passar por outro lado mesmo com o tempo errado.
 */
function portao(r) {
  const g = new Group();

  // a caixa da persiana e as guias ficam paradas: são parte da loja
  const moldura = new Mesh(geo('portaoMoldura', () => new BoxGeometry(2.15, 0.3, 0.34)),
    mat('molduraFerro', () => padrao('#c9973f', { roughness: 0.35, metalness: 0.8 })));
  moldura.position.y = 2.78;
  g.add(moldura);
  const matGuia = mat('guiaFerro', () => padrao('#2a2f36', { roughness: 0.45, metalness: 0.7 }));
  for (const x of [-1.03, 1.03]) {
    const guia = new Mesh(geo('portaoGuia', () => new BoxGeometry(0.1, 2.8, 0.2)), matGuia);
    guia.position.set(x, 1.4, 0);
    g.add(guia);
  }

  // só a persiana desliza
  const painel = new Group();
  g.add(painel);
  const matPersiana = mat('persiana', () => padrao('#3c4148', { roughness: 0.5, metalness: 0.6 }));
  const chapa = new Mesh(geo('persianaPainel', () => new BoxGeometry(1.9, 2.6, 0.12)), matPersiana);
  chapa.position.y = 1.3;
  painel.add(chapa);
  for (let i = 0; i < 9; i++) {
    const ripa = new Mesh(geo('persianaRipa', () => new BoxGeometry(1.94, 0.06, 0.16)),
      mat('persianaRipa', () => padrao('#20252b', { roughness: 0.6, metalness: 0.4 })));
    ripa.position.y = 0.2 + i * 0.28;
    painel.add(ripa);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });

  const periodo = 3.4;
  return {
    objeto: g, ml: 0.95, mp: 0.2, y0: 0, y1: 2.6,
    dados: { t: r ? r() * periodo : 0, periodo, painel },
    atualizar(dt, o) {
      o.dados.t += dt;
      const ciclo = (o.dados.t % o.dados.periodo) / o.dados.periodo;
      // fica aberto mais da metade do tempo — a intenção é criar ritmo, não punir
      const fechado = ciclo < 0.42 ? Math.min(1, ciclo / 0.12) : Math.max(0, 1 - (ciclo - 0.42) / 0.12);
      o.dados.painel.position.y = mistura(2.62, 0, fechado);
      o.y1Atual = mistura(0, 2.6, fechado);
    },
    alturaDinamica: true,
  };
}

/* ── coletável: o envelope ─────────────────────────────────────────────── */

function envelope(indiceCarta) {
  const g = new Group();
  const matPapel = mat('papelCarta', () => new MeshStandardMaterial({
    color: new Color('#f8eeda'), roughness: 0.75, metalness: 0,
    emissive: new Color('#c9973f'), emissiveIntensity: 0.45,
  }));
  const corpo = new Mesh(geo('envCorpo', () => new BoxGeometry(0.44, 0.3, 0.03)), matPapel);
  g.add(corpo);
  // a aba, dois triângulos achatados formando o V do envelope
  const aba = new Mesh(geo('envAba', () => new ConeGeometry(0.225, 0.17, 3)),
    mat('papelAba', () => new MeshStandardMaterial({
      color: new Color('#efe0c4'), roughness: 0.8,
      emissive: new Color('#c9973f'), emissiveIntensity: 0.3,
    })));
  aba.rotation.x = Math.PI / 2;
  aba.rotation.y = Math.PI / 2;
  aba.position.set(0, 0.055, 0.022);
  aba.scale.set(1, 1, 0.62);
  g.add(aba);
  const lacre = new Mesh(geo('lacre', () => new CylinderGeometry(0.045, 0.045, 0.016, 10)),
    mat('lacreCera', () => new MeshStandardMaterial({
      color: new Color('#a31f2e'), roughness: 0.45,
      emissive: new Color('#5e0d16'), emissiveIntensity: 0.5,
    })));
  lacre.rotation.x = Math.PI / 2;
  lacre.position.z = 0.026;
  g.add(lacre);

  // halo: um anel emissivo que o bloom transforma em brilho de verdade
  const halo = new Mesh(geo('halo', () => new TorusGeometry(0.4, 0.012, 6, 24)),
    mat('haloDourado', () => new MeshStandardMaterial({
      color: new Color('#ffdf9a'), emissive: new Color('#ffc861'),
      emissiveIntensity: 3.2, roughness: 1,
    })));
  g.add(halo);

  return {
    objeto: g, ml: 0.5, mp: 0.5, y0: 0.75, y1: 1.75,
    coletavel: true,
    dados: { carta: indiceCarta, t: Math.random() * TAU, halo },
    atualizar(dt, o) {
      o.dados.t += dt;
      o.grupo.rotation.y += dt * 1.1;
      o.grupo.position.y = o.yBase + Math.sin(o.dados.t * 1.8) * 0.12;
      o.dados.halo.rotation.x = o.dados.t * 0.7;
      o.dados.halo.rotation.z = o.dados.t * 0.45;
    },
  };
}

/* ── catálogo ──────────────────────────────────────────────────────────── */

export const CONSTRUTORES = {
  cone, caixote, lixeira, poca, galho, barreiraAlta, pedestre, cachorro,
  onibus, bicicleta, folhas, portao, envelope,
  banco: () => banco('#5c3a24'),
  bancoVermelho: () => banco('#7a2230'),
};

/** Como cada obstáculo é vencido — usado pelo validador de fase. */
export const COMO_PASSAR = {
  cone: 'pulo', caixote: 'pulo', lixeira: 'pulo', banco: 'pulo', bancoVermelho: 'pulo',
  bicicleta: 'pulo', galho: 'abaixar', barreiraAlta: 'abaixar', portao: 'desvio',
  onibus: 'desvio', pedestre: 'desvio', cachorro: 'desvio',
  poca: 'livre', folhas: 'livre', envelope: 'livre',
};

/**
 * Monta um obstáculo posicionado. Devolve o registro que o jogo usa para
 * colidir e animar.
 */
export function criarObstaculo(tipo, { x, z, r, carta } = {}) {
  const construtor = CONSTRUTORES[tipo];
  if (!construtor) throw new Error('obstáculo desconhecido: ' + tipo);
  const feito = tipo === 'envelope' ? construtor(carta) : construtor(r);

  const grupo = feito.objeto;
  grupo.position.set(x, 0, z);
  if (tipo === 'envelope') grupo.position.y = 1.15;

  grupo.traverse((o) => { if (o.isMesh) o.castShadow = true; });

  return {
    tipo,
    grupo,
    x, z,
    xBase: x,
    yBase: grupo.position.y,
    ml: feito.ml, mp: feito.mp,
    y0: feito.y0, y1: feito.y1,
    y1Atual: feito.y1,
    inofensivo: !!feito.inofensivo,
    coletavel: !!feito.coletavel,
    alturaDinamica: !!feito.alturaDinamica,
    dados: feito.dados || {},
    atualizar: feito.atualizar || null,
    usado: false,
  };
}
