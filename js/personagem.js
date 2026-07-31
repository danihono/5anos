/* ═══════════════ a menina ═══════════════
   Sem modelo 3D pronto: o corpo é montado com primitivas em grupos aninhados
   e animado por senoides nas juntas. A câmera fica atrás do ombro, então o
   que precisa ler bem é a silhueta.

   Esta versão é a RECRIAÇÃO da imagem que o Daniel fez da menina dele. Antes
   dela eu tentei duas vezes em caixa empilhada e a segunda ele resumiu em duas
   palavras: "tá horrível". Tinha razão — do jeito que estava, de costas ela era
   uma mala com pernas.

   O que a imagem dele ensina, e que é o método deste arquivo inteiro:

     Os painéis compridos de tons diferentes que correm pelo cabelo dela NÃO são
     textura nem material por mecha. São `flatShading` sobre um volume CURVO de
     poucos lados: cada faceta ganha a própria normal e pega a luz num tom
     diferente. Um lathe ou um cilindro de nove lados entrega aquilo de graça,
     numa malha só.

   Daí a regra: nada de caixa. Tudo aqui é volume arredondado de poucas faces —
   domo, cone, cilindro afinado — e a paleta é a mesma de sempre, medida pixel a
   pixel na imagem dele. O que muda é a FORMA.

   O esqueleto de grupos (quadril → tronco → pescoço → cabeça, e os membros com
   joelho e cotovelo) é o mesmo de antes de propósito: toda a animação depende
   dele e o ciclo de corrida está bom.
   ═════════════════════════════════════════ */

import { Group, Mesh, MeshStandardMaterial, Color, DoubleSide,
         CylinderGeometry, SphereGeometry, LatheGeometry, Vector2 } from 'three';
import { TAU, limita, mistura, amortece } from './util.js';
import { caixaArredondada } from './materiais.js';

/* Da imagem do Daniel, amostrada ponto a ponto. Os valores dela vêm banhados na
   luz dourada do parque (manga #eed9a7, meia #d1c1a2, saia #362d1d), então o que
   está aqui é o albedo que, sob aquela luz, dá naquilo — e bate quase inteiro
   com a paleta que o jogo já usava. As duas correções que a imagem pediu: a
   mochila é uma ardósia mais fria, e o sapato tem sola marrom. */
export const APARENCIA = {
  blusa: '#f2e8d5',
  saia: '#26242e',
  /* A mochila é CINZA QUENTE, não azul. Amostrei `#524638` e `#4e4335` na imagem
     dele e mesmo assim escrevi um azul-ardósia aqui — na cena a diferença é
     enorme, porque é a única peça grande de tom médio que ela tem. */
  mochila: '#4b463c',
  mochilaAba: '#403c34',
  mochilaAlca: '#2f2c26',
  fivela: '#d9d5c8',
  cabelo: '#6b4226',
  pele: '#f2d3b3',
  // creme, não branco: na imagem dele nada é branco puro
  meia: '#efe4d0',
  sapato: '#33302c',
  sola: '#6b4a2c',
  olho: '#3a2a1e',
};

function material(cor, opcoes = {}) {
  return new MeshStandardMaterial({
    color: new Color(cor), roughness: 0.62, metalness: 0, flatShading: true, ...opcoes,
  });
}

/** Cilindro afinado de poucos lados: o membro sai daqui. */
function tubo(rCima, rBaixo, altura, lados = 7, aberto = false) {
  return new CylinderGeometry(rCima, rBaixo, altura, lados, 1, aberto);
}

/**
 * Um trecho da coluna de cabelo, em ARCOS.
 *
 * Em `CylinderGeometry` o ângulo zero cai em +Z, que é a frente dela. O cabelo
 * precisa de DOIS vãos ao mesmo tempo e um cilindro só sabe fazer um:
 *   - `vaoFrente`, para o rosto aparecer. Sem ele a coluna fechava em volta da
 *     cabeça e, de frente, ela era um ovo castanho com dois pontinhos.
 *   - `vaoTras`, para a mochila aparecer no meio, com uma mecha grossa de cada
 *     lado — é assim na imagem do Daniel.
 * Daí dois arcos, um por lado, no mesmo grupo.
 */
function arcosDeCabelo(rCima, rBaixo, altura, vaoFrente, vaoTras) {
  const arco = (Math.PI - vaoTras / 2 - vaoFrente / 2);
  const de = [vaoFrente / 2, Math.PI + vaoTras / 2];
  return de.map((inicio) =>
    new CylinderGeometry(rCima, rBaixo, altura, 5, 1, true, inicio, arco));
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
  const matSaia = material(aparencia.saia, { roughness: 0.75, side: DoubleSide });
  const matMochila = material(aparencia.mochila, { roughness: 0.7 });
  const matAba = material(aparencia.mochilaAba, { roughness: 0.7 });
  const matAlca = material(aparencia.mochilaAlca, { roughness: 0.7 });
  const matFivela = material(aparencia.fivela, { roughness: 0.5, metalness: 0.25 });
  // um material SÓ para o cabelo: a variação de tom da imagem dele é luz nas
  // facetas, não cor pintada. Foi pintando mecha por mecha que eu já produzi,
  // numa versão anterior, um xadrez que lia como pele de girafa
  const matCabelo = material(aparencia.cabelo, { roughness: 0.55, side: DoubleSide });
  const matPele = material(aparencia.pele, { roughness: 0.66 });
  const matMeia = material(aparencia.meia, { roughness: 0.8 });
  const matSapato = material(aparencia.sapato, { roughness: 0.6 });
  const matSola = material(aparencia.sola, { roughness: 0.8 });
  const matOlho = material(aparencia.olho, { roughness: 0.4 });

  const raiz = new Group();
  const balanco = new Group();
  raiz.add(balanco);

  const quadril = new Group();
  quadril.position.y = 0.92;
  balanco.add(quadril);

  /* ── pernas ──
     Finas e afinando, como na imagem: coxa de pele, meia clara da metade da
     canela para baixo, sapato escuro de sola marrom. A sola é pequena e é
     justamente ela que dá o pé — sem, o sapato lia como um toco preto. */
  function fazPerna(lado) {
    const g = new Group();
    g.position.set(0.098 * lado, -0.02, 0);
    quadril.add(g);
    // grossa e quase sem afinar: na imagem dele a perna é encorpada, e com
    // 0.088→0.072 as duas viravam palitos claros pendurados na saia
    malha(tubo(0.101, 0.088, 0.44), matPele, g, 0, -0.22, 0);

    const joelho = new Group();
    joelho.position.y = -0.44;
    g.add(joelho);
    // mais perna à mostra e meia mais curta, como na imagem: com a meia subindo
    // até o joelho as duas pernas viravam dois tubos brancos compridos
    malha(tubo(0.088, 0.079, 0.2), matPele, joelho, 0, -0.1, 0);
    malha(tubo(0.08, 0.068, 0.26), matMeia, joelho, 0, -0.31, 0);

    const tornozelo = new Group();
    tornozelo.position.y = -0.44;
    joelho.add(tornozelo);
    malha(caixaArredondada(0.13, 0.085, 0.25, 0.035, 2), matSapato, tornozelo, 0, -0.05, 0.035);
    malha(caixaArredondada(0.135, 0.04, 0.26, 0.018, 2), matSola, tornozelo, 0, -0.098, 0.038);
    return { g, joelho, tornozelo };
  }
  const pernaE = fazPerna(-1);
  const pernaD = fazPerna(1);

  /* ── tronco ──
     Um `LatheGeometry` só, com nove lados. O perfil sobe da cintura estreita
     para o peito e fecha no pescoço: é ele que dá cintura, e cintura é o que
     faz o olho ler "moça correndo" em vez de "boneco de caixa". As duas caixas
     empilhadas da tentativa anterior não afinavam e viravam um cilindro. */
  const tronco = new Group();
  quadril.add(tronco);

  const PERFIL_TRONCO = [
    [0.128, 0.00], [0.134, 0.10], [0.150, 0.22], [0.166, 0.34],
    [0.172, 0.42], [0.158, 0.50], [0.108, 0.545], [0.062, 0.56],
  ].map(([r, y]) => new Vector2(r, y));
  const corpo = malha(new LatheGeometry(PERFIL_TRONCO, 9), matBlusa, tronco);
  corpo.scale.z = 0.84;

  /* ── saia ──
     Cone aberto de doze lados: as facetas já são as pregas. As abas curtas
     alternadas na barra dão o recorte escalonado que a imagem tem — sem elas a
     barra é um corte de compasso e a saia lê como um sino de metal. */
  const saia = new Group();
  saia.position.y = 0.04;
  tronco.add(saia);
  const cone = malha(tubo(0.135, 0.19, 0.25, 12), matSaia, saia, 0, -0.125, 0);
  cone.scale.z = 0.88;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.26;
    const aba = malha(caixaArredondada(0.09, 0.06, 0.03, 0.012, 2), matSaia, saia,
      Math.sin(a) * 0.184, -0.265, Math.cos(a) * 0.184 * 0.88);
    aba.rotation.y = a;
    aba.rotation.x = -0.16;
  }

  /* ── braços ──
     Magros e quase retos ao longo do corpo, como na imagem. O ombro fica em
     ±0.175, encostado na borda do lathe: mais para fora e o braço descola do
     tronco, mais para dentro e some dentro dele. */
  function fazBraco(lado) {
    const g = new Group();
    g.position.set(0.195 * lado, 0.44, 0);
    tronco.add(g);
    // manga folgada: a 0.055 de raio ela sumia dentro do cabelo e só a mão
    // aparecia, como duas bolinhas creme penduradas no nada. Na imagem dele a
    // blusa é larga e é a manga inteira que se vê pelo lado
    malha(tubo(0.079, 0.07, 0.28, 6), matBlusa, g, 0, -0.14, 0);
    const cotovelo = new Group();
    cotovelo.position.y = -0.28;
    g.add(cotovelo);
    malha(tubo(0.07, 0.061, 0.26, 6), matBlusa, cotovelo, 0, -0.13, 0);
    malha(new SphereGeometry(0.056, 7, 5), matPele, cotovelo, 0, -0.29, 0);
    return { g, cotovelo };
  }
  const bracoE = fazBraco(-1);
  const bracoD = fazBraco(1);

  /* ── mochila ──
     Está na imagem dele, então fica. Corpo de ardósia, aba com a dobra à vista
     e a fivela quadrada clara no meio. O cabelo cobre o alto dela; o que aparece
     é a aba para baixo, que é exatamente o enquadramento da foto. */
  /* Medida na imagem dele: a mochila tem o FUNDO na cintura e sobe daí, com o
     alto escondido atrás do cabelo. Montada no meio das costas ela sumia atrás
     do cabelo; montada no quadril virava um remendo cinza em cima da saia. */
  const bolsa = new Group();
  /* z = -0.195, e não -0.145: a parede de trás do cabelo passa em z ≈ -0.234, e
     uma mochila encostada nas costas fica INTEIRA dentro da coluna e some. Ela
     tem que furar essa parede — é assim que a imagem dele tem a mochila no meio
     com cabelo dos dois lados. */
  /* Medida na imagem dele: a mochila vai do quadril até um palmo acima, e o
     cabelo desce dos DOIS LADOS dela até o fundo. Montada alta, ela ficava do
     tamanho do cabelo e virava o assunto da personagem. */
  /* O TOPO da mochila tem que bater com o começo do vão do cabelo (mundo 1.25).
     Um centímetro abaixo disso e aparece uma tarja de blusa creme entre o
     cabelo e a aba — foi o que aconteceu quando eu a desci para o quadril. */
  bolsa.position.set(0, 0.17, -0.19);
  tronco.add(bolsa);
  malha(caixaArredondada(0.25, 0.32, 0.14, 0.028, 2), matMochila, bolsa);
  // a aba ocupa o terço de cima, com a dobra à vista, como na imagem
  malha(caixaArredondada(0.256, 0.125, 0.155, 0.028, 2), matAba, bolsa, 0, 0.108, 0.002);
  malha(caixaArredondada(0.07, 0.058, 0.035, 0.012, 2), matFivela, bolsa, 0, 0.018, -0.078);
  for (const lado of [-1, 1]) {
    const alca = malha(caixaArredondada(0.04, 0.46, 0.032, 0.013, 2), matAlca, tronco,
      lado * 0.108, 0.25, 0.095);
    alca.rotation.x = -0.1;
  }

  /* ── cabeça ── */
  const pescoco = new Group();
  pescoco.position.y = 0.55;
  tronco.add(pescoco);
  malha(tubo(0.052, 0.058, 0.1, 7), matPele, pescoco, 0, 0.04, 0);

  const cabeca = new Group();
  cabeca.position.y = 0.13;
  pescoco.add(cabeca);
  /* O crânio tem que caber DEBAIXO do domo de cabelo. Na primeira montagem o
     topo dele ficava cinco milímetros acima e, no tamanho de jogo, aparecia uma
     touquinha creme na cabeça dela. Cinco milímetros. */
  const cranio = malha(new SphereGeometry(0.125, 8, 6), matPele, cabeca, 0, 0.052, 0);
  cranio.scale.set(1, 1.06, 0.94);
  for (const lado of [-1, 1]) {
    const olho = malha(new SphereGeometry(0.025, 6, 4), matOlho, cabeca, lado * 0.052, 0.048, 0.11);
    olho.scale.set(1, 1.25, 0.4);
  }

  /* ── o cabelo ──
     É ele que faz a personagem, e é onde eu mais errei.

     A forma é uma COLUNA DE TOPO REDONDO: domo facetado em cima, largura cheia
     logo abaixo da nuca, lados quase paralelos até abaixo da cintura. Nas duas
     tentativas anteriores o perfil abria devagar e saía um ovo — mais estreito
     que a mochila, quando na imagem dele é bem mais largo que ela.

     Quatro peças encadeadas, para balançar. A de cima é um lathe (o domo); as
     de baixo são ARCOS de cilindro, dois por trecho, deixando um vão na frente
     (o rosto) e outro atrás (a mochila). Nove lados no domo, cinco em cada
     arco — é desse número baixo que saem os painéis verticais da imagem dele,
     porque `flatShading` dá a cada faceta um tom próprio.

     `scale.z` de 0.86: o cabelo é mais raso que largo, senão a massa vira um
     barril. E `dz` empurra a coluna para trás conforme desce, porque cabelo cai
     pelas costas e não pelo eixo do corpo. */
  const VAO_ROSTO = 1.15;

  /* O domo vem em DUAS peças, e é por um motivo bobo que só apareceu no jogo:
     com um lathe só, o vão do rosto era cortado do ápice até a nuca, e de
     costas dava para ver o fundo claro pelo buraco — uma fresta branca descendo
     pelo meio da cabeça dela. A calota de cima é fechada; o vão só começa na
     altura em que o rosto de fato está. */
  const CALOTA = [
    [0.000, 0.098], [0.062, 0.090], [0.112, 0.062], [0.150, 0.026],
  ].map(([r, y]) => new Vector2(r, y));
  const MOLDURA = [
    [0.150, 0.026], [0.178, -0.030], [0.196, -0.108], [0.204, -0.19],
  ].map(([r, y]) => new Vector2(r, y));

  const cabelo = [];
  const raizCabelo = new Group();
  raizCabelo.position.set(0, 0.1, -0.012);
  cabeca.add(raizCabelo);
  malha(new LatheGeometry(CALOTA, 9), matCabelo, raizCabelo).scale.z = 0.86;
  malha(new LatheGeometry(MOLDURA, 9, VAO_ROSTO / 2, TAU - VAO_ROSTO),
    matCabelo, raizCabelo).scale.z = 0.86;
  cabelo.push({ g: raizCabelo, nivel: 0 });

  let pai = raizCabelo;
  const TRECHOS = [
    // o vão de trás só abre onde a mochila começa; mais acima ele deixava
    // aparecer uma faixa creme de blusa descendo pela nuca, que lia como uma
    // risca careca
    { rCima: 0.204, rBaixo: 0.212, h: 0.26, de: -0.19, dz: -0.03, vaoTras: 0 },
    { rCima: 0.212, rBaixo: 0.2, h: 0.28, de: -0.26, dz: -0.02, vaoTras: 0.62 },
  ];
  for (let i = 0; i < TRECHOS.length; i++) {
    const t = TRECHOS[i];
    const seg = new Group();
    seg.position.set(0, t.de, t.dz);
    pai.add(seg);
    for (const geo of arcosDeCabelo(t.rCima, t.rBaixo, t.h, VAO_ROSTO, t.vaoTras)) {
      malha(geo, matCabelo, seg, 0, -t.h / 2, 0).scale.z = 0.86;
    }
    cabelo.push({ g: seg, nivel: i + 1 });
    pai = seg;
  }

  /* A barra.

     Duas tentativas de "pontas soltas" e as duas viraram dentadura: cilindros
     pendurados na borda leem como uma fileira de dentes se ficam separados, e
     como garras se ficam grossos o bastante para se tocar. A imagem dele não
     tem isso — tem uma barra quase reta, com um degrau e uma mecha mais
     comprida de um lado. Então: um trecho curto e mais estreito fecha a coluna,
     e duas mechas finas descem mais um pouco. Duas, não nove. */
  const remate = new Group();
  remate.position.y = -0.28;
  pai.add(remate);
  /* Afina pouco (0.20 → 0.188): afinando muito, a coluna arredondava a ponta e
     a silhueta virava cápsula, quando na imagem dele ela é um retângulo de topo
     redondo, com os lados descendo quase verticais até a barra.

     E o vão de trás abre de vez aqui: na imagem, as duas mechas laterais
     continuam DESCENDO ao lado da mochila até o fundo dela, e é isso que
     emoldura a peça em vez de escondê-la. */
  for (const geo of arcosDeCabelo(0.2, 0.188, 0.17, VAO_ROSTO, 1.45)) {
    malha(geo, matCabelo, remate, 0, -0.085, 0).scale.z = 0.86;
  }
  cabelo.push({ g: remate, nivel: 3 });
  for (const [ang, comp] of [[2.3, 0.22], [-2.3, 0.15], [1.75, 0.12], [-1.75, 0.17]]) {
    malha(tubo(0.062, 0.036, comp, 5), matCabelo, remate,
      Math.sin(ang) * 0.172, -0.16 - comp / 2, Math.cos(ang) * 0.172 * 0.86);
  }

  // o nome antigo, que a animação usa para abrir a barra da saia na velocidade
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
      /* Abertura lateral maior que antes (0.20 contra 0.13): é ela que joga a
         manga para FORA do sino de cabelo. Com o cabelo estreito de antes o
         braço aparecia sozinho; agora, se ele não abrir, só a mão escapa e ela
         fica com duas bolinhas creme no lugar dos braços. */
      bracoE.g.rotation.z = 0.2;
      bracoD.g.rotation.z = -0.2;
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

    /* O cabelo, com atraso: cada trecho persegue o de cima.

       O ângulo de cada peça é o ângulo TOTAL dividido pelo número de trechos,
       porque numa corrente as rotações SE SOMAM — cada peça é filha da anterior.
       Sem dividir, meio radiano por peça em três peças dá um radiano e meio na
       ponta e o cabelo sobe por cima da cabeça. Já aconteceu.

       E soma a velocidade, não subtrai: parada ela tem o cabelo caindo reto,
       correndo ele voa para trás. A fórmula antiga era de rabo de cavalo e fazia
       o contrário — quanto mais rápido, mais o cabelo vinha para a frente. */
    const alvoCabelo = limita(-velX * 0.075, -0.42, 0.42);
    const recuo = limita(0.05 + vel * 0.032, 0, 0.52) / cabelo.length;
    for (const { g, nivel } of cabelo) {
      const atraso = (1 - nivel * 0.16) / cabelo.length;
      g.rotation.z = amortece(g.rotation.z, alvoCabelo * atraso, 0.0009 + nivel * 0.0008, dt);
      g.rotation.x = amortece(
        g.rotation.x,
        recuo + Math.sin(fase * 2 + nivel * 0.8) * 0.055 * (andando ? 1 : 0.3) / cabelo.length,
        0.0013, dt
      );
    }

    // a barra da saia abre um pouco quando ela corre mais rápido
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
