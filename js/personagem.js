/* ═══════════════ a menina ═══════════════
   Sem modelo 3D pronto: o corpo é montado com primitivas em grupos aninhados
   e animado por senoides nas juntas. A câmera fica atrás do ombro, então o
   que precisa ler bem é a silhueta — casaco vermelho, cachecol creme e o
   rabo de cavalo balançando com atraso.

   A proporção é de desenho animado de propósito: cabeça grande, membros
   curtos e grossos, tudo arredondado. Fica muito mais simpática de olhar do
   que uma tentativa de humano realista feita com primitivas.
   ═════════════════════════════════════════ */

import { Group, Mesh, MeshStandardMaterial, MeshPhysicalMaterial, CapsuleGeometry,
         CylinderGeometry, SphereGeometry, BoxGeometry, Color } from 'three';
import { TAU, limita, mistura, amortece } from './util.js';

/* Copiada da foto que o Daniel mandou: cabelo escuro comprido e solto, jaqueta
   de couro preta aberta, camiseta com estampa rosa, shorts, bolsa de alça de
   corrente. O vermelho do casaco antigo servia para ela se recortar contra a
   névoa; agora quem faz esse trabalho é a estampa da camiseta, e na cena da
   noite a luz de apoio que segue ela (`luzHeroi` em jogo.js). */
export const APARENCIA = {
  jaqueta: '#17151a',
  jaquetaForro: '#3b3540',
  camiseta: '#1d1b21',
  estampa: '#e33a6b',
  /* Castanho quente, não preto. Na foto o cabelo é escuríssimo, mas em 3D
     cabelo preto sobre jaqueta preta vira um borrão só — vista de trás, que é
     a vista do jogo, ela some inteira. O castanho separa por matiz do couro
     frio e devolve a silhueta. */
  cabelo: '#3d2618',
  pele: '#f0c4a2',
  shorts: '#191720',
  bota: '#241f28',
  bolsa: '#1a181e',
  corrente: '#cfc7b2',
};

function material(cor, opcoes = {}) {
  return new MeshStandardMaterial({ color: new Color(cor), roughness: 0.52, metalness: 0.02, ...opcoes });
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
  /* Couro: liso, com verniz e um brilho rasante frio. É esse realce na borda
     que salva a silhueta preta — sem ele ela vira um recorte chapado. */
  const matJaqueta = new MeshPhysicalMaterial({
    color: new Color(aparencia.jaqueta),
    roughness: 0.34,
    metalness: 0,
    clearcoat: 0.6,
    clearcoatRoughness: 0.35,
    sheen: 0.7,
    sheenRoughness: 0.4,
    sheenColor: new Color('#9fb6d8'),
  });
  const matForro = material(aparencia.jaquetaForro, { roughness: 0.8 });
  const matCamiseta = material(aparencia.camiseta, { roughness: 0.9 });
  const matEstampa = material(aparencia.estampa, { roughness: 0.85 });
  // brilho quente no cabelo, contra o brilho frio do couro: é o que separa os dois
  const matCabelo = new MeshPhysicalMaterial({
    color: new Color(aparencia.cabelo), roughness: 0.36, metalness: 0,
    sheen: 0.6, sheenRoughness: 0.4, sheenColor: new Color('#c88f5a'),
  });
  const matPele = material(aparencia.pele, { roughness: 0.6 });
  const matShorts = material(aparencia.shorts, { roughness: 0.8 });
  const matBota = material(aparencia.bota, { roughness: 0.45 });
  const matBolsa = material(aparencia.bolsa, { roughness: 0.6 });
  const matCorrente = material(aparencia.corrente, { roughness: 0.3, metalness: 0.8 });

  const raiz = new Group();
  const balanco = new Group();
  raiz.add(balanco);

  const quadril = new Group();
  quadril.position.y = 0.92;
  balanco.add(quadril);

  /* ── pernas ── */
  const geoCoxa = new CapsuleGeometry(0.115, 0.24, 4, 14);
  const geoCanela = new CapsuleGeometry(0.098, 0.24, 4, 14);
  const geoBota = new SphereGeometry(0.115, 12, 10);

  function fazPerna(lado) {
    const g = new Group();
    g.position.set(0.105 * lado, -0.02, 0);
    quadril.add(g);
    // coxa de pele com a barra do short por cima: é o que lê como "shorts"
    malha(geoCoxa, matPele, g, 0, -0.2, 0);
    malha(new CapsuleGeometry(0.125, 0.1, 4, 14), matShorts, g, 0, -0.11, 0);
    const joelho = new Group();
    joelho.position.y = -0.4;
    g.add(joelho);
    malha(geoCanela, matPele, joelho, 0, -0.19, 0);
    const tornozelo = new Group();
    tornozelo.position.y = -0.38;
    joelho.add(tornozelo);
    const bota = malha(geoBota, matBota, tornozelo, 0, -0.05, 0.035);
    bota.scale.set(1, 0.78, 1.5);
    return { g, joelho, tornozelo };
  }
  const pernaE = fazPerna(-1);
  const pernaD = fazPerna(1);

  /* ── tronco e casaco ── */
  const tronco = new Group();
  quadril.add(tronco);

  /* Camiseta primeiro, jaqueta por cima e aberta. A jaqueta de motoqueiro é
     curta e reta — nada do evasê do casaco antigo, que descia até a coxa. */
  malha(new CapsuleGeometry(0.185, 0.34, 5, 20), matCamiseta, tronco, 0, 0.2, 0);
  // a estampa, no peito, virada para fora
  const estampa = malha(new CylinderGeometry(0.187, 0.187, 0.2, 20, 1, true), matEstampa, tronco, 0, 0.3, 0);
  estampa.material.side = 2;
  estampa.scale.set(1, 1, 0.55);

  // as duas frentes de couro, abertas, deixando a estampa aparecer no meio
  const corpoCasaco = new Group();
  tronco.add(corpoCasaco);
  /* No CylinderGeometry do three, theta=0 é o +z — que é a frente dela. As duas
     abas saem daí para trás, cada uma para um lado, deixando aberto um vão de
     40° na frente por onde a estampa aparece. */
  for (const lado of [-1, 1]) {
    const frente = malha(
      new CylinderGeometry(0.215, 0.235, 0.46, 20, 1, true, lado > 0 ? 0.35 : -3.05, 2.7),
      matJaqueta, corpoCasaco, 0, 0.16, 0
    );
    frente.material.side = 2;
  }
  // gola levantada e o zíper aberto na cintura
  malha(new CylinderGeometry(0.2, 0.2, 0.06, 20), matForro, corpoCasaco, 0, -0.07, 0);
  malha(new SphereGeometry(0.155, 16, 12), matJaqueta, tronco, 0, 0.47, -0.01).scale.set(1.06, 0.5, 1.06);

  /* ── braços ── */
  const geoBraco = new CapsuleGeometry(0.072, 0.15, 4, 12);
  const geoAntebraco = new CapsuleGeometry(0.063, 0.14, 4, 12);
  function fazBraco(lado) {
    const g = new Group();
    // ombro para fora do volume do casaco, senão o braço fica escondido
    // dentro do cilindro e ela vira um sino vermelho
    g.position.set(0.245 * lado, 0.42, 0);
    tronco.add(g);
    malha(geoBraco, matJaqueta, g, 0, -0.14, 0);
    const cotovelo = new Group();
    cotovelo.position.y = -0.28;
    g.add(cotovelo);
    malha(geoAntebraco, matJaqueta, cotovelo, 0, -0.13, 0);
    // punho da manga e a mão saindo dele
    malha(new CylinderGeometry(0.068, 0.062, 0.05, 12), matForro, cotovelo, 0, -0.21, 0);
    malha(new SphereGeometry(0.062, 12, 10), matPele, cotovelo, 0, -0.25, 0);
    return { g, cotovelo };
  }
  const bracoE = fazBraco(-1);
  const bracoD = fazBraco(1);

  /* ── bolsa a tiracolo: é onde as cartas vão parar ──
     Preta com alça de corrente, como a da foto. A corrente é o único metal
     dela e dá um brilho que ajuda a achá-la contra fundo escuro. */
  const bolsa = new Group();
  bolsa.position.set(0.2, 0.02, -0.03);
  tronco.add(bolsa);
  malha(new BoxGeometry(0.2, 0.15, 0.07), matBolsa, bolsa).geometry.computeVertexNormals();
  malha(new BoxGeometry(0.2, 0.045, 0.075), matForro, bolsa, 0, 0.07, 0);
  // a alça cruzando o peito
  const alca = malha(new CylinderGeometry(0.011, 0.011, 0.62, 6), matCorrente, tronco, 0.02, 0.28, -0.02);
  alca.rotation.set(0.1, 0, 0.55);

  /* ── cabeça e cabelo ── */
  const pescoco = new Group();
  pescoco.position.y = 0.56;
  tronco.add(pescoco);
  malha(new CylinderGeometry(0.062, 0.07, 0.06, 12), matPele, pescoco, 0, 0.02, 0);

  const cabeca = new Group();
  cabeca.position.y = 0.11;
  pescoco.add(cabeca);
  malha(new SphereGeometry(0.152, 22, 18), matPele, cabeca, 0, 0.06, 0).scale.set(1, 1.04, 0.96);
  // franja/topo
  const topo = malha(new SphereGeometry(0.163, 22, 18), matCabelo, cabeca, 0, 0.085, -0.012);
  topo.scale.set(1.02, 0.94, 1.04);

  /* Cabelo comprido e solto, no lugar do rabo de cavalo. É o mesmo rig de
     antes — cada segmento pendurado no anterior, perseguindo com atraso —
     só que com mais segmentos e uma massa larga e achatada, que cai pelas
     costas até abaixo do ombro. Duas mechas mais curtas emolduram o rosto. */
  const cabelo = [];
  let paiCabelo = cabeca;
  for (let i = 0; i < 5; i++) {
    const seg = new Group();
    // z = -0.19 no primeiro: a nuca fica atrás da casca da jaqueta (raio 0.22).
    // Em -0.1 o cabelo inteiro caía DENTRO do casaco e não aparecia.
    seg.position.set(0, i === 0 ? -0.02 : -0.175, i === 0 ? -0.19 : 0);
    paiCabelo.add(seg);
    const esc = 1 - i * 0.07;
    /* Duas medidas que brigam entre si e levaram três tentativas:
       - a cápsula precisa ser quase TÃO COMPRIDA quanto o vão (0.175), senão
         aparecem as emendas e o cabelo vira uma corda de nós;
       - e não pode passar muito disso, senão os segmentos se enfiam uns nos
         outros e tudo colapsa num capacete redondo (foi o primeiro erro).
       Achatada e bem larga é o que faz ler como massa de cabelo, não como rabo. */
    const m = malha(new CapsuleGeometry(0.058 * esc, 0.2, 4, 12), matCabelo, seg, 0, -0.088, 0);
    m.scale.set(3.1, 1, 0.8);
    cabelo.push(seg);
    paiCabelo = seg;
  }
  const mechas = [];
  for (const lado of [-1, 1]) {
    let pai = cabeca;
    for (let i = 0; i < 3; i++) {
      const seg = new Group();
      seg.position.set(i === 0 ? 0.12 * lado : 0, i === 0 ? 0.04 : -0.155, 0);
      pai.add(seg);
      const m = malha(new CapsuleGeometry(0.038 - i * 0.005, 0.13, 4, 10), matCabelo, seg, 0, -0.075, 0);
      m.scale.set(0.9, 1, 0.85);
      mechas.push(seg);
      pai = seg;
    }
  }

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

      /* Braços de corredor: cotovelo travado perto de 90° e a mão cruzando um
         pouco na frente do corpo, em vez de balançar reto ao lado. */
      bracoE.g.rotation.x = -s * 0.95 * amp;
      bracoD.g.rotation.x = s * 0.95 * amp;
      bracoE.cotovelo.rotation.x = (1.15 + Math.max(0, s) * 0.5) * amp;
      bracoD.cotovelo.rotation.x = (1.15 + Math.max(0, -s) * 0.5) * amp;
      bracoE.g.rotation.z = 0.16 + Math.max(0, -s) * 0.24 * amp;
      bracoD.g.rotation.z = -0.16 - Math.max(0, s) * 0.24 * amp;

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
    materiais: { matJaqueta, matEstampa, matCabelo },
  };
}
