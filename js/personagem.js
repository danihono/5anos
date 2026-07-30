/* ═══════════════ a menina ═══════════════
   Sem modelo 3D pronto: o corpo é montado com primitivas em grupos aninhados
   e animado por senoides nas juntas. A câmera fica atrás do ombro, então o
   que precisa ler bem é a silhueta.

   Tudo em BLOCOS facetados, copiado da imagem que o Daniel desenhou. A versão
   anterior era feita de cápsulas e esferas, e ao lado do resto do jogo ela era
   a parte fraca — "olha tudo o que fez até agora, isso aí é mole", nas palavras
   dele. Bloco com `flatShading` pega a luz em faces chapadas e fica nítido e
   proposital, em vez de um boneco de massinha derretido.

   O esqueleto de grupos (quadril → tronco → pescoço → cabeça, e os membros com
   joelho e cotovelo) é o mesmo de antes de propósito: toda a animação depende
   dele e o ciclo de corrida acabou de ser acertado.
   ═════════════════════════════════════════ */

import { Group, Mesh, MeshStandardMaterial, BoxGeometry, Color } from 'three';
import { TAU, limita, mistura, amortece } from './util.js';

/* Da imagem do Daniel: cabelo castanho comprido em mechas, blusa creme de manga
   comprida, mochila escura com fivela clara, saia escura com pregas, meias creme
   até a canela e sapato escuro. */
export const APARENCIA = {
  blusa: '#f2e8d5',
  blusaSombra: '#ddd0b8',
  saia: '#26242e',
  saiaPrega: '#191821',
  mochila: '#3c434e',
  mochilaAlca: '#2b313a',
  fivela: '#d9d5c8',
  cabelo: '#6b4226',
  cabeloClaro: '#8a5a33',
  cabeloEscuro: '#4e2f1a',
  pele: '#f2d3b3',
  meia: '#f4ece0',
  sapato: '#3d2b20',
};

function material(cor, opcoes = {}) {
  return new MeshStandardMaterial({
    color: new Color(cor), roughness: 0.62, metalness: 0, flatShading: true, ...opcoes,
  });
}

/** Caixa: é a única primitiva do corpo dela agora. */
function bloco(l, a, p) {
  return new BoxGeometry(l, a, p);
}

function malha(geo, mat, pai, x = 0, y = 0, z = 0) {
  const m = new Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = false;
  pai.add(m);
  return m;
}

export function criarMenina(aparencia = APARENCIA) {
  const matBlusa = material(aparencia.blusa);
  const matBlusaSombra = material(aparencia.blusaSombra);
  const matSaia = material(aparencia.saia, { roughness: 0.75 });
  const matPrega = material(aparencia.saiaPrega, { roughness: 0.75 });
  // miolo cheio por dentro, para não se ver o vazio entre as pregas
  const matSaiaFundo = material(aparencia.saiaPrega, { roughness: 0.8 });
  const matMochila = material(aparencia.mochila, { roughness: 0.7 });
  const matAlca = material(aparencia.mochilaAlca, { roughness: 0.7 });
  const matFivela = material(aparencia.fivela, { roughness: 0.5, metalness: 0.3 });
  const matCabelo = material(aparencia.cabelo, { roughness: 0.5 });
  const matCabeloClaro = material(aparencia.cabeloClaro, { roughness: 0.5 });
  const matCabeloEscuro = material(aparencia.cabeloEscuro, { roughness: 0.5 });
  const matPele = material(aparencia.pele, { roughness: 0.66 });
  const matMeia = material(aparencia.meia, { roughness: 0.8 });
  const matSapato = material(aparencia.sapato, { roughness: 0.6 });

  const raiz = new Group();
  const balanco = new Group();
  raiz.add(balanco);

  const quadril = new Group();
  quadril.position.y = 0.92;
  balanco.add(quadril);

  /* ── pernas: coxa nua, meia da canela ao tornozelo, sapato ── */
  function fazPerna(lado) {
    const g = new Group();
    g.position.set(0.1 * lado, -0.02, 0);
    quadril.add(g);
    malha(bloco(0.17, 0.42, 0.17), matPele, g, 0, -0.21, 0);

    const joelho = new Group();
    joelho.position.y = -0.42;
    g.add(joelho);
    malha(bloco(0.15, 0.16, 0.15), matPele, joelho, 0, -0.08, 0);
    malha(bloco(0.155, 0.26, 0.155), matMeia, joelho, 0, -0.29, 0);

    const tornozelo = new Group();
    tornozelo.position.y = -0.42;
    joelho.add(tornozelo);
    malha(bloco(0.17, 0.1, 0.28), matSapato, tornozelo, 0, -0.05, 0.04);
    return { g, joelho, tornozelo };
  }
  const pernaE = fazPerna(-1);
  const pernaD = fazPerna(1);

  /* ── tronco: saia de pregas e blusa creme ── */
  const tronco = new Group();
  quadril.add(tronco);

  // a saia, em pregas alternadas — larguras diferentes é o que faz ler como prega
  const saia = new Group();
  saia.position.y = -0.02;
  tronco.add(saia);
  /* 16 pregas de 0,11 num círculo de 1,26 m de perímetro: somadas dão 1,76, ou
     seja elas se sobrepõem e formam uma saia contínua. Com 10 de 0,1 sobravam
     vãos e a saia virava um cinto de abas soltas. */
  const PREGAS = 16;
  malha(bloco(0.34, 0.28, 0.34), matSaiaFundo, saia, 0, -0.13, 0);
  for (let i = 0; i < PREGAS; i++) {
    const a = (i / PREGAS) * TAU;
    const fundo = i % 2 === 0;
    const pr = malha(bloco(fundo ? 0.115 : 0.1, 0.3, 0.05), fundo ? matSaia : matPrega, saia,
      Math.sin(a) * 0.205, -0.13, Math.cos(a) * 0.205);
    pr.rotation.y = a;
    pr.rotation.x = -0.12;                 // a barra abre um pouco para fora
  }
  malha(bloco(0.34, 0.1, 0.24), matSaia, tronco, 0, 0.03, 0);

  // blusa: torso e a gola
  malha(bloco(0.36, 0.44, 0.25), matBlusa, tronco, 0, 0.3, 0);
  malha(bloco(0.3, 0.06, 0.21), matBlusaSombra, tronco, 0, 0.53, 0);

  /* ── braços: manga comprida creme, mão de pele ── */
  function fazBraco(lado) {
    const g = new Group();
    g.position.set(0.23 * lado, 0.45, 0);
    tronco.add(g);
    malha(bloco(0.12, 0.28, 0.13), matBlusa, g, 0, -0.14, 0);
    const cotovelo = new Group();
    cotovelo.position.y = -0.28;
    g.add(cotovelo);
    malha(bloco(0.11, 0.24, 0.12), matBlusa, cotovelo, 0, -0.12, 0);
    malha(bloco(0.1, 0.11, 0.11), matPele, cotovelo, 0, -0.29, 0);
    return { g, cotovelo };
  }
  const bracoE = fazBraco(-1);
  const bracoD = fazBraco(1);

  /* ── mochila: é onde as cartas vão parar ── */
  const bolsa = new Group();
  // um pouco mais larga que a cortina de cabelo (0,31), senão ela some inteira
  bolsa.position.set(0, 0.28, -0.2);
  tronco.add(bolsa);
  malha(bloco(0.36, 0.38, 0.14), matMochila, bolsa);
  malha(bloco(0.12, 0.1, 0.03), matFivela, bolsa, 0, 0, -0.08);
  malha(bloco(0.26, 0.06, 0.12), matAlca, bolsa, 0, 0.19, 0.01);
  for (const lado of [-1, 1]) {
    const alca = malha(bloco(0.05, 0.36, 0.04), matAlca, tronco, lado * 0.13, 0.36, 0.13);
    alca.rotation.x = -0.12;
  }

  /* ── cabeça ── */
  const pescoco = new Group();
  pescoco.position.y = 0.56;
  tronco.add(pescoco);
  malha(bloco(0.1, 0.07, 0.1), matPele, pescoco, 0, 0.02, 0);

  const cabeca = new Group();
  cabeca.position.y = 0.12;
  pescoco.add(cabeca);
  malha(bloco(0.26, 0.28, 0.25), matPele, cabeca, 0, 0.08, 0);
  // touca de cabelo: topo, nuca e a risca no meio
  malha(bloco(0.285, 0.12, 0.275), matCabelo, cabeca, 0, 0.19, 0);
  malha(bloco(0.285, 0.2, 0.09), matCabelo, cabeca, 0, 0.07, -0.1);
  malha(bloco(0.04, 0.06, 0.09), matCabeloEscuro, cabeca, 0, 0.245, 0.02);
  for (const lado of [-1, 1]) {
    malha(bloco(0.05, 0.22, 0.26), matCabelo, cabeca, lado * 0.135, 0.09, 0);
  }

  /* ── cabelo comprido, em mechas ──
     Cada mecha é uma coluna de blocos pendurados um no outro, perseguindo o de
     cima com atraso. O vão entre blocos tem que ser quase igual à altura do
     bloco: menos e eles se enfiam uns nos outros virando um capacete, mais e
     aparecem as emendas como nós de corda. Isso já custou três tentativas. */
  const cabelo = [];
  /* O tom é por MECHA, constante de cima a baixo. Alternar bloco a bloco fazia
     um xadrez que lia como pele de girafa, não como cabelo. */
  const COSTAS = [
    { x: -0.105, larg: 0.105, comp: 5, mat: matCabeloEscuro },
    { x: -0.035, larg: 0.095, comp: 6, mat: matCabelo },
    { x: 0.035, larg: 0.095, comp: 6, mat: matCabeloClaro },
    { x: 0.105, larg: 0.105, comp: 5, mat: matCabelo },
  ];
  for (const mecha of COSTAS) {
    let pai = cabeca;
    for (let i = 0; i < mecha.comp; i++) {
      const seg = new Group();
      seg.position.set(i === 0 ? mecha.x : 0, i === 0 ? 0.1 : -0.15, i === 0 ? -0.16 : 0);
      pai.add(seg);
      malha(bloco(mecha.larg, 0.16, 0.075), mecha.mat, seg, 0, -0.08, 0);
      cabelo.push(seg);
      pai = seg;
    }
  }
  // duas mechas caindo na frente do ombro
  const mechas = [];
  for (const lado of [-1, 1]) {
    let pai = cabeca;
    for (let i = 0; i < 4; i++) {
      const seg = new Group();
      seg.position.set(i === 0 ? 0.14 * lado : 0, i === 0 ? 0.06 : -0.15, i === 0 ? 0.04 : 0);
      pai.add(seg);
      malha(bloco(0.07, 0.16, 0.075), lado > 0 ? matCabelo : matCabeloClaro, seg, 0, -0.08, 0);
      mechas.push(seg);
      pai = seg;
    }
  }

  // sem esta variável a animação do casaco antigo quebraria; agora é a saia
  const corpoCasaco = saia;

  raiz.traverse((o) => { if (o.isMesh) o.castShadow = true; });

  /* ═══════════ animação ═══════════ */

  let fase = 0;
  let passoAnterior = 0;
  let agachadoSuave = 0;
  let tropecoSuave = 0;
  let inclinacaoLateral = 0;
  let xAnterior = 0;

  const estadoInterno = { aoPassar: null };

  /**
   * @param {number} dt
   * @param {object} e  {velocidade, noChao, agachado, tropeco, x, cutscene}
   */
  function atualizar(dt, e) {
    const vel = e.velocidade || 0;
    const andando = e.noChao;

    /* Um passo a cada ~2,7 m. Estava em 1,65 m, e a 11–16 m/s isso dava 7 a 10
       passos por segundo — o dobro de um corredor de verdade. Ela não corria,
       se debatia. A 2,7 m cai para 4–5 passos/s, que é a cadência certa. */
    if (andando) fase += (vel / 2.7) * TAU * dt;

    agachadoSuave = amortece(agachadoSuave, e.agachado ? 1 : 0, 0.0001, dt);
    tropecoSuave = amortece(tropecoSuave, e.tropeco ? 1 : 0, 0.002, dt);

    // inclinação ao trocar de faixa, calculada pela velocidade lateral real
    const velX = (e.x - xAnterior) / Math.max(dt, 1e-4);
    xAnterior = e.x;
    inclinacaoLateral = amortece(inclinacaoLateral, limita(-velX * 0.055, -0.34, 0.34), 0.0006, dt);

    const s = Math.sin(fase);
    const c = Math.cos(fase);

    if (andando) {
      const amp = mistura(0.55, 1, limita(vel / 12, 0, 1));
      pernaE.g.rotation.x = s * 0.92 * amp;
      pernaD.g.rotation.x = -s * 0.92 * amp;
      pernaE.joelho.rotation.x = Math.max(0, -Math.sin(fase - 0.5)) * 1.35 * amp;
      pernaD.joelho.rotation.x = Math.max(0, Math.sin(fase - 0.5)) * 1.35 * amp;
      pernaE.tornozelo.rotation.x = -pernaE.joelho.rotation.x * 0.35;
      pernaD.tornozelo.rotation.x = -pernaD.joelho.rotation.x * 0.35;

      /* Braços de corredor. Três defeitos consertados aqui de uma vez, e os três
         eram meus:

         - O ângulo LATERAL oscilava (`0.16 + max(0,-s) * 0.24`), então os braços
           abriam e fechavam para os lados a cada passada. Ninguém corre assim:
           o braço fica num plano quase reto e quem gira é o ombro. Agora o Z é
           constante.
         - `Math.max(0, s)` aparecia três vezes e cria um bico na derivada — o
           movimento travava no meio do ciclo e arrancava de novo. Era isso o
           "estranho". Trocado por seno e cosseno puros, que são lisos.
         - A base do cotovelo era multiplicada por `amp`, então em velocidade
           baixa o braço esticava. Quem corre mantém perto de 90° sempre; só a
           variação deve escalar com a velocidade. */
      bracoE.g.rotation.x = -s * 0.62 * amp;
      bracoD.g.rotation.x = s * 0.62 * amp;
      bracoE.cotovelo.rotation.x = 1.25 + s * 0.3 * amp;
      bracoD.cotovelo.rotation.x = 1.25 - s * 0.3 * amp;
      bracoE.g.rotation.z = 0.13;
      bracoD.g.rotation.z = -0.13;
      // o antebraço chega um pouco atrasado, senão o gesto fica de robô
      bracoE.cotovelo.rotation.y = -c * 0.12 * amp;
      bracoD.cotovelo.rotation.y = c * 0.12 * amp;

      /* Voo. O corpo sobe duas vezes por ciclo (uma por passada) e o pico é
         alto o bastante para ler como corrida — 4,5 cm não lia como nada. */
      balanco.position.y = Math.abs(c) * 0.13 * amp;

      /* Contra-rotação: o ombro gira ao contrário do quadril. É o gesto que
         faz o olho dizer "está correndo" em vez de "está deslizando". */
      quadril.rotation.y = s * 0.13 * amp;
      tronco.rotation.y = -s * 0.22 * amp;

      // aviso de passo dado, para o som bater junto com o pé no chão
      const marca = Math.sign(s);
      if (marca !== passoAnterior && marca !== 0) {
        passoAnterior = marca;
        if (estadoInterno.aoPassar) estadoInterno.aoPassar();
      }
    } else {
      // no ar: pernas recolhidas, braços meio abertos
      pernaE.g.rotation.x = mistura(pernaE.g.rotation.x, -0.75, 0.2);
      pernaD.g.rotation.x = mistura(pernaD.g.rotation.x, 0.25, 0.2);
      pernaE.joelho.rotation.x = mistura(pernaE.joelho.rotation.x, 1.25, 0.2);
      pernaD.joelho.rotation.x = mistura(pernaD.joelho.rotation.x, 0.5, 0.2);
      bracoE.g.rotation.x = mistura(bracoE.g.rotation.x, -1.5, 0.16);
      bracoD.g.rotation.x = mistura(bracoD.g.rotation.x, -1.5, 0.16);
      bracoE.cotovelo.rotation.x = mistura(bracoE.cotovelo.rotation.x, 0.5, 0.16);
      bracoD.cotovelo.rotation.x = mistura(bracoD.cotovelo.rotation.x, 0.5, 0.16);
      balanco.position.y = mistura(balanco.position.y, 0, 0.2);
      // no ar o corpo para de torcer, senão a contra-rotação fica travada
      quadril.rotation.y = mistura(quadril.rotation.y, 0, 0.2);
      tronco.rotation.y = mistura(tronco.rotation.y, 0, 0.2);
    }

    // agachar: quadril desce, tronco dobra, joelhos fecham
    quadril.position.y = 0.92 - agachadoSuave * 0.34;
    // e quanto mais rápido, mais o tronco cai para a frente
    const inclinaFrente = 0.14 + limita(vel * 0.011, 0, 0.17);
    tronco.rotation.x = mistura(inclinaFrente, 0.72, agachadoSuave) + tropecoSuave * 0.5;
    pernaE.joelho.rotation.x += agachadoSuave * 1.1;
    pernaD.joelho.rotation.x += agachadoSuave * 1.1;
    pernaE.g.rotation.x -= agachadoSuave * 0.5;
    pernaD.g.rotation.x -= agachadoSuave * 0.5;

    // tropeço: ela cambaleia mas não cai — o jogo nunca trava
    balanco.rotation.z = inclinacaoLateral + Math.sin(fase * 3) * tropecoSuave * 0.16;
    balanco.rotation.x = tropecoSuave * 0.22;
    if (tropecoSuave > 0.01) {
      bracoE.g.rotation.z = 0.1 - tropecoSuave * 0.9;
      bracoD.g.rotation.z = -0.1 + tropecoSuave * 0.9;
    }

    // cabelo com atraso: cada segmento persegue o de cima
    const alvoCabelo = limita(-velX * 0.09, -0.5, 0.5);
    cabelo.forEach((seg, i) => {
      const atraso = 1 - i * 0.15;
      seg.rotation.z = amortece(seg.rotation.z, alvoCabelo * atraso, 0.0009 + i * 0.0007, dt);
      /* Somando a velocidade, não subtraindo: parada ela tem o cabelo caindo
         reto, e correndo ele voa para trás. A fórmula antiga era de rabo de
         cavalo e fazia o contrário — quanto mais rápido, mais o cabelo vinha
         para a frente e enfiava no casaco. */
      seg.rotation.x = amortece(
        seg.rotation.x,
        0.04 + Math.sin(fase * 2 + i * 0.7) * 0.07 * (andando ? 1 : 0.3) + limita(vel * 0.019, 0, 0.5),
        0.0012, dt
      );
    });
    // as mechas do rosto são mais leves e respondem mais rápido
    mechas.forEach((seg, i) => {
      const nivel = i % 3;
      seg.rotation.z = amortece(seg.rotation.z, alvoCabelo * (0.7 - nivel * 0.12), 0.0006, dt);
      seg.rotation.x = amortece(
        seg.rotation.x,
        Math.sin(fase * 2 + nivel) * 0.06 * (andando ? 1 : 0.3) + limita(vel * 0.014, 0, 0.4),
        0.0009, dt
      );
    });

    // as abas da jaqueta abrem um pouco quando ela corre mais rápido
    corpoCasaco.scale.x = corpoCasaco.scale.z = 1 + limita(vel * 0.006, 0, 0.09);

    // a cabeça fica firme: desconta a inclinação e a torção do tronco
    cabeca.rotation.x = -tronco.rotation.x * 0.55 - agachadoSuave * 0.15;
    cabeca.rotation.y = -tronco.rotation.y * 0.6;
  }

  return {
    raiz,
    atualizar,
    bolsa,
    set aoPassar(fn) { estadoInterno.aoPassar = fn; },
    materiais: { matBlusa, matSaia, matCabelo },
  };
}
