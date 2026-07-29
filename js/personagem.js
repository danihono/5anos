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

export const APARENCIA = {
  // um vermelho um tico mais vivo que o --red do site, porque num mundo
  // pastel o #9c2233 puro fica sombrio. O toldo da agência continua no
  // vermelho original — é lá que a costura com as cartas precisa bater.
  casaco: '#c02a3e',
  casacoForro: '#8d1c2c',
  cachecol: '#fdf4e2',
  cabelo: '#5a3520',
  pele: '#f2c6a4',
  calca: '#3b3348',
  bota: '#2b2333',
  bolsa: '#a8763f',
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
  const matCasaco = new MeshPhysicalMaterial({
    color: new Color(aparencia.casaco),
    roughness: 0.48,
    metalness: 0,
    clearcoat: 0.35,
    clearcoatRoughness: 0.5,
    sheen: 0.8,
    sheenRoughness: 0.5,
    // o brilho rasante do tecido é o que recorta a silhueta contra a névoa
    sheenColor: new Color('#ff9aa6'),
  });
  const matForro = material(aparencia.casacoForro, { roughness: 0.85 });
  const matCachecol = material(aparencia.cachecol, { roughness: 0.9 });
  const matCabelo = material(aparencia.cabelo, { roughness: 0.55 });
  const matPele = material(aparencia.pele, { roughness: 0.6 });
  const matCalca = material(aparencia.calca, { roughness: 0.85 });
  const matBota = material(aparencia.bota, { roughness: 0.45 });
  const matBolsa = material(aparencia.bolsa, { roughness: 0.7 });

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
    malha(geoCoxa, matCalca, g, 0, -0.2, 0);
    const joelho = new Group();
    joelho.position.y = -0.4;
    g.add(joelho);
    malha(geoCanela, matCalca, joelho, 0, -0.19, 0);
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

  // corpo do casaco, evasê para baixo
  const corpoCasaco = malha(
    new CylinderGeometry(0.2, 0.3, 0.52, 22, 1, true), matCasaco, tronco, 0, 0.1, 0
  );
  corpoCasaco.material.side = 2;
  malha(new CylinderGeometry(0.298, 0.298, 0.03, 22), matForro, tronco, 0, -0.155, 0);
  // peito
  malha(new CapsuleGeometry(0.2, 0.16, 5, 20), matCasaco, tronco, 0, 0.33, 0);

  // cachecol creme — o contraste que faz o rosto/pescoço aparecerem de longe
  malha(new SphereGeometry(0.145, 16, 12), matCachecol, tronco, 0, 0.5, 0).scale.set(1, 0.62, 1);
  const pontaCachecol = malha(new BoxGeometry(0.085, 0.34, 0.04), matCachecol, tronco, -0.08, 0.34, -0.13);

  /* ── braços ── */
  const geoBraco = new CapsuleGeometry(0.072, 0.15, 4, 12);
  const geoAntebraco = new CapsuleGeometry(0.063, 0.14, 4, 12);
  function fazBraco(lado) {
    const g = new Group();
    // ombro para fora do volume do casaco, senão o braço fica escondido
    // dentro do cilindro e ela vira um sino vermelho
    g.position.set(0.245 * lado, 0.42, 0);
    tronco.add(g);
    malha(geoBraco, matCasaco, g, 0, -0.14, 0);
    const cotovelo = new Group();
    cotovelo.position.y = -0.28;
    g.add(cotovelo);
    malha(geoAntebraco, matCasaco, cotovelo, 0, -0.13, 0);
    malha(new SphereGeometry(0.068, 12, 10), matPele, cotovelo, 0, -0.25, 0);
    return { g, cotovelo };
  }
  const bracoE = fazBraco(-1);
  const bracoD = fazBraco(1);

  /* ── bolsa a tiracolo: é onde as cartas vão parar ── */
  const bolsa = new Group();
  bolsa.position.set(0.2, 0.02, -0.03);
  tronco.add(bolsa);
  malha(new SphereGeometry(0.115, 16, 12), matBolsa, bolsa).scale.set(1, 0.85, 0.6);
  malha(new BoxGeometry(0.175, 0.05, 0.085), matBolsa, bolsa, 0, 0.06, 0).material = matForro;

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

  // rabo de cavalo em três segmentos, cada um pendurado no anterior
  const cabelo = [];
  let paiCabelo = cabeca;
  for (let i = 0; i < 3; i++) {
    const seg = new Group();
    seg.position.set(0, i === 0 ? 0.01 : -0.145, i === 0 ? -0.135 : 0);
    paiCabelo.add(seg);
    const esc = 1 - i * 0.19;
    malha(new CapsuleGeometry(0.082 * esc, 0.11, 4, 14), matCabelo, seg, 0, -0.075, 0);
    cabelo.push(seg);
    paiCabelo = seg;
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

    // um passo a cada ~1.65 m percorridos
    if (andando) fase += (vel / 1.65) * TAU * dt;

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

      bracoE.g.rotation.x = -s * 0.78 * amp;
      bracoD.g.rotation.x = s * 0.78 * amp;
      bracoE.cotovelo.rotation.x = (0.5 + Math.max(0, s) * 0.7) * amp;
      bracoD.cotovelo.rotation.x = (0.5 + Math.max(0, -s) * 0.7) * amp;
      bracoE.g.rotation.z = 0.2;
      bracoD.g.rotation.z = -0.2;

      balanco.position.y = Math.abs(c) * 0.045 * amp;

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
    }

    // agachar: quadril desce, tronco dobra, joelhos fecham
    quadril.position.y = 0.92 - agachadoSuave * 0.34;
    tronco.rotation.x = mistura(0.14, 0.72, agachadoSuave) + tropecoSuave * 0.5;
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

    // cabelo e cachecol com atraso: cada segmento persegue o de cima
    const alvoCabelo = limita(-velX * 0.09, -0.5, 0.5);
    cabelo.forEach((seg, i) => {
      const atraso = 1 - i * 0.22;
      seg.rotation.z = amortece(seg.rotation.z, alvoCabelo * atraso, 0.0009 + i * 0.0008, dt);
      seg.rotation.x = amortece(
        seg.rotation.x,
        0.22 + Math.sin(fase * 2 + i * 0.8) * 0.09 * (andando ? 1 : 0.3) - limita(vel * 0.012, 0, 0.4),
        0.0012, dt
      );
    });
    pontaCachecol.rotation.z = amortece(pontaCachecol.rotation.z, alvoCabelo * 1.6, 0.0007, dt);
    pontaCachecol.rotation.x = -0.2 - limita(vel * 0.03, 0, 0.9);

    // a barra do casaco abre um pouco quando ela corre mais rápido
    corpoCasaco.scale.x = corpoCasaco.scale.z = 1 + limita(vel * 0.006, 0, 0.09);

    cabeca.rotation.x = -tronco.rotation.x * 0.55 - agachadoSuave * 0.15;
  }

  return {
    raiz,
    atualizar,
    bolsa,
    set aoPassar(fn) { estadoInterno.aoPassar = fn; },
    materiais: { matCasaco, matCachecol, matCabelo },
  };
}
