/* ═══════════════ pós-processamento próprio ═══════════════
   Composer feito à mão em vez dos módulos de exemplo do three: são menos
   arquivos para embutir e dá para fundir bloom, tonemap, vinheta, grão,
   aberração e gota de chuva na lente num passe só.

   A cena é renderizada em HDR (meio float, sem tonemap). O bloom acontece
   ainda em HDR — que é a ordem certa e o motivo de o poste de luz "estourar"
   bonito — e só no fim vem o ACES e a conversão para sRGB.
   ═════════════════════════════════════════════════════════ */

import { WebGLRenderTarget, HalfFloatType, LinearFilter, ClampToEdgeWrapping, RGBAFormat,
         ShaderMaterial, PlaneGeometry, Mesh, OrthographicCamera, Scene, Vector2,
         NoToneMapping, LinearSRGBColorSpace, DepthTexture, UnsignedIntType } from 'three';

const VERT = `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

/* Corta o que é mais brilhante que o limiar, com um joelho suave para não
   serrilhar a borda do brilho. */
const FRAG_BRILHO = `
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform float limiar, joelho;
void main(){
  vec3 c = texture2D(tDiffuse, vUv).rgb;
  float b = max(c.r, max(c.g, c.b));
  float macio = clamp(b - limiar + joelho, 0.0, 2.0 * joelho);
  macio = macio * macio / (4.0 * joelho + 0.0001);
  float peso = max(macio, b - limiar) / max(b, 0.0001);
  gl_FragColor = vec4(c * peso, 1.0);
}`;

const FRAG_BORRA = `
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform vec2 direcao;
void main(){
  // gaussiana de 9 amostras aproveitando a interpolação bilinear (5 leituras)
  vec4 soma = texture2D(tDiffuse, vUv) * 0.227027;
  vec2 d1 = direcao * 1.3846153846;
  vec2 d2 = direcao * 3.2307692308;
  soma += (texture2D(tDiffuse, vUv + d1) + texture2D(tDiffuse, vUv - d1)) * 0.3162162162;
  soma += (texture2D(tDiffuse, vUv + d2) + texture2D(tDiffuse, vUv - d2)) * 0.0702702703;
  gl_FragColor = soma;
}`;

const FRAG_COPIA = `
varying vec2 vUv;
uniform sampler2D tDiffuse;
void main(){ gl_FragColor = texture2D(tDiffuse, vUv); }`;

const FRAG_FINAL = `
varying vec2 vUv;
/* o three já injeta <colorspace_pars_fragment> no prefixo de todo shader,
   então incluir aqui duplicaria as funções e o programa nem compila.
   <packing> não é injetado, e é dele que vem perspectiveDepthToViewZ. */
#include <packing>

uniform sampler2D tCena;
uniform sampler2D tDof;
uniform sampler2D tDepth;
uniform float dofPerto, dofLonge, forcaDof, camNear, camFar;
#if NIVEIS > 0
uniform sampler2D tBloom0;
#endif
#if NIVEIS > 1
uniform sampler2D tBloom1;
#endif
#if NIVEIS > 2
uniform sampler2D tBloom2;
#endif

uniform float exposicao, forcaBloom, vinheta, grao, aberracao;
uniform float contraste, saturacao, veu;
uniform vec3 corAmbiente;
uniform float gotas, tempo, flash, velocidade;
uniform vec3 corFlash;

float hash21(vec2 p){
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

/* Gotas na lente: uma grade de células, cada uma com uma gota em posição
   sorteada. Perto do centro da gota a imagem é levemente desviada e ganha
   um realce — o suficiente para o olho ler "chuva batendo na câmera". */
vec2 desvioDasGotas(vec2 uv, out float realce){
  realce = 0.0;
  if (gotas <= 0.001) return vec2(0.0);
  vec2 desvio = vec2(0.0);
  for (int camada = 0; camada < 2; camada++){
    float escala = camada == 0 ? 9.0 : 15.0;
    vec2 grade = uv * escala;
    vec2 id = floor(grade);
    vec2 f = fract(grade) - 0.5;
    float r1 = hash21(id + float(camada) * 37.0);
    float r2 = hash21(id + float(camada) * 91.0 + 7.0);
    // as gotas escorrem devagar para baixo e reaparecem em outro lugar
    float ciclo = fract(tempo * (0.05 + r2 * 0.06) + r1);
    vec2 centro = vec2(r1 - 0.5, 0.5 - ciclo) * 0.7;
    float d = length(f - centro);
    float raio = (0.10 + r2 * 0.11) * gotas;
    float dentro = smoothstep(raio, raio * 0.25, d);
    desvio += normalize(f - centro + 0.0001) * dentro * 0.012 * gotas;
    realce += dentro * 0.35;
  }
  return desvio;
}

vec3 aces(vec3 x){
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

void main(){
  vec2 centrado = vUv - 0.5;
  float raio2 = dot(centrado, centrado);

  float realce;
  vec2 uvGota = vUv + desvioDasGotas(vUv, realce);

  // aberração cromática: aumenta na borda e um tiquinho com a velocidade.
  // o fator da velocidade tem que ser bem pequeno — acima disso vira
  // franja colorida em toda quina e o realismo vai embora
  float ab = (aberracao + velocidade * 0.00004) * (0.35 + raio2 * 2.2);
  vec2 desloca = centrado * ab;
  vec3 cor;
  cor.r = texture2D(tCena, uvGota + desloca).r;
  cor.g = texture2D(tCena, uvGota).g;
  cor.b = texture2D(tCena, uvGota - desloca).b;

  /* Profundidade de campo: nítido nela, macio no fundo. É o que mais faz o
     quadro parecer caprichado em vez de renderizado às pressas. O céu força
     profundidade no plano distante, então derrete junto — de propósito. */
  if (forcaDof > 0.001) {
    float bruto = texture2D(tDepth, uvGota).x;
    float dist = -perspectiveDepthToViewZ(bruto, camNear, camFar);
    float coc = smoothstep(dofPerto, dofLonge, dist) * forcaDof;
    cor = mix(cor, texture2D(tDof, uvGota).rgb, coc);
  }

  #if NIVEIS > 0
    vec3 brilho = texture2D(tBloom0, uvGota).rgb * 1.0;
  #endif
  #if NIVEIS > 1
    brilho += texture2D(tBloom1, uvGota).rgb * 0.62;
  #endif
  #if NIVEIS > 2
    brilho += texture2D(tBloom2, uvGota).rgb * 0.36;
  #endif
  #if NIVEIS > 0
    cor += brilho * forcaBloom;
  #endif

  cor += realce * 0.06 * gotas;
  cor *= exposicao;
  cor = aces(cor);

  /* Acabamento de ilustração: sem isto o mundo pastel vira leitoso.

     A curva tem que ser em S de verdade (smoothstep), e não uma reta girada
     em volta de 0,5. Com a reta e contraste 1,2 tudo abaixo de 0,083 vira
     preto puro — foi assim que o céu noturno da última cena ficou totalmente
     preto, brigando com a neblina lilás. O smoothstep mapeia 0→0 e 1→1,
     então adiciona contraste no meio sem nunca cortar as pontas. */
  vec3 emS = cor * cor * (3.0 - 2.0 * cor);
  cor = mix(cor, emS, contraste);
  float luma = dot(cor, vec3(0.2126, 0.7152, 0.0722));
  cor = clamp(mix(vec3(luma), cor, saturacao), 0.0, 1.0);
  cor = mix(cor, cor * corAmbiente, veu);

  // pancada: lava a tela de vermelho por um instante
  cor = mix(cor, corFlash, flash);

  // vinheta, mais fechada quanto mais rápido ela estiver correndo
  float v = 1.0 - vinheta * (raio2 * 1.9 + velocidade * 0.0075 * raio2 * 3.0);
  cor *= clamp(v, 0.0, 1.0);

  // grão de filme
  float g = hash21(vUv * 900.0 + fract(tempo) * 100.0) - 0.5;
  cor += g * grao;

  gl_FragColor = vec4(max(cor, 0.0), 1.0);
  #include <colorspace_fragment>
}`;

function alvo(l, a) {
  const rt = new WebGLRenderTarget(Math.max(1, l | 0), Math.max(1, a | 0), {
    type: HalfFloatType,
    format: RGBAFormat,
    minFilter: LinearFilter,
    magFilter: LinearFilter,
    wrapS: ClampToEdgeWrapping,
    wrapT: ClampToEdgeWrapping,
    depthBuffer: false,
    stencilBuffer: false,
  });
  rt.texture.colorSpace = LinearSRGBColorSpace;
  rt.texture.generateMipmaps = false;
  return rt;
}

export function criarPos(renderer, cena, camera, opts = {}) {
  let niveis = opts.niveis ?? 3;
  let largura = 1, altura = 1;

  const cenaQuad = new Scene();
  const camQuad = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new Mesh(new PlaneGeometry(2, 2), null);
  quad.frustumCulled = false;
  cenaQuad.add(quad);

  const matBrilho = new ShaderMaterial({
    uniforms: { tDiffuse: { value: null }, limiar: { value: 1.35 }, joelho: { value: 0.6 } },
    vertexShader: VERT, fragmentShader: FRAG_BRILHO, depthTest: false, depthWrite: false,
  });
  const matBorra = new ShaderMaterial({
    uniforms: { tDiffuse: { value: null }, direcao: { value: new Vector2() } },
    vertexShader: VERT, fragmentShader: FRAG_BORRA, depthTest: false, depthWrite: false,
  });
  const matCopia = new ShaderMaterial({
    uniforms: { tDiffuse: { value: null } },
    vertexShader: VERT, fragmentShader: FRAG_COPIA, depthTest: false, depthWrite: false,
  });

  let matFinal = null;
  let rtCena = null;
  let rtDofA = null;
  let rtDofB = null;
  let cadeia = [];

  function fazFinal() {
    if (matFinal) matFinal.dispose();
    matFinal = new ShaderMaterial({
      defines: { NIVEIS: niveis },
      uniforms: {
        tCena: { value: null },
        tDof: { value: null },
        tDepth: { value: null },
        dofPerto: { value: opts.dofPerto ?? 13 },
        dofLonge: { value: opts.dofLonge ?? 62 },
        forcaDof: { value: opts.dof ?? 0.85 },
        camNear: { value: camera.near },
        camFar: { value: camera.far },
        tBloom0: { value: null },
        tBloom1: { value: null },
        tBloom2: { value: null },
        exposicao: { value: opts.exposicao ?? 1 },
        forcaBloom: { value: opts.bloom ?? 0.5 },
        vinheta: { value: opts.vinheta ?? 0.55 },
        grao: { value: opts.grao ?? 0.035 },
        aberracao: { value: opts.aberracao ?? 0.0016 },
        contraste: { value: opts.contraste ?? 0.22 },
        saturacao: { value: opts.saturacao ?? 1.18 },
        veu: { value: opts.veu ?? 0.12 },
        corAmbiente: { value: opts.corAmbiente ?? [1.03, 1.0, 0.95] },
        gotas: { value: opts.gotas ?? 0 },
        tempo: { value: 0 },
        flash: { value: 0 },
        velocidade: { value: 0 },
        corFlash: { value: opts.corFlash ?? [0.62, 0.1, 0.14] },
      },
      vertexShader: VERT, fragmentShader: FRAG_FINAL, depthTest: false, depthWrite: false,
    });
  }
  fazFinal();

  function soltaAlvos() {
    if (rtCena) {
      if (rtCena.depthTexture) rtCena.depthTexture.dispose();
      rtCena.dispose();
    }
    if (rtDofA) rtDofA.dispose();
    if (rtDofB) rtDofB.dispose();
    rtDofA = rtDofB = null;
    cadeia.forEach((n) => { n.a.dispose(); n.b.dispose(); });
    cadeia = [];
  }

  function redimensiona(l, a) {
    largura = Math.max(1, l | 0);
    altura = Math.max(1, a | 0);
    soltaAlvos();
    // o alvo principal é o único que precisa de buffer de profundidade,
    // porque é nele que a cena 3D de verdade é desenhada — e é dele que sai
    // a textura de profundidade usada pelo desfoque de fundo
    rtCena = new WebGLRenderTarget(largura, altura, {
      type: HalfFloatType, format: RGBAFormat,
      minFilter: LinearFilter, magFilter: LinearFilter,
      depthBuffer: true, stencilBuffer: false,
    });
    rtCena.texture.colorSpace = LinearSRGBColorSpace;
    rtCena.texture.generateMipmaps = false;
    rtCena.depthTexture = new DepthTexture(largura, altura);
    rtCena.depthTexture.type = UnsignedIntType;

    // versão macia da cena, em um quarto da resolução: barata e é justamente
    // a falta de nitidez que interessa aqui
    rtDofA = alvo(largura / 4, altura / 4);
    rtDofB = alvo(largura / 4, altura / 4);

    for (let i = 0; i < niveis; i++) {
      const div = Math.pow(2, i + 1);
      cadeia.push({ a: alvo(largura / div, altura / div), b: alvo(largura / div, altura / div) });
    }
  }

  function desenha(material, destino) {
    quad.material = material;
    renderer.setRenderTarget(destino || null);
    renderer.render(cenaQuad, camQuad);
  }

  function render(dt) {
    const u = matFinal.uniforms;
    u.tempo.value += dt;

    const tonemapAntes = renderer.toneMapping;
    renderer.toneMapping = NoToneMapping;
    renderer.setRenderTarget(rtCena);
    renderer.clear();
    renderer.render(cena, camera);
    renderer.toneMapping = tonemapAntes;

    if (niveis > 0) {
      matBrilho.uniforms.tDiffuse.value = rtCena.texture;
      desenha(matBrilho, cadeia[0].a);

      for (let i = 0; i < niveis; i++) {
        const n = cadeia[i];
        const l = largura / Math.pow(2, i + 1);
        const a = altura / Math.pow(2, i + 1);

        matBorra.uniforms.tDiffuse.value = n.a.texture;
        matBorra.uniforms.direcao.value.set(1 / l, 0);
        desenha(matBorra, n.b);

        matBorra.uniforms.tDiffuse.value = n.b.texture;
        matBorra.uniforms.direcao.value.set(0, 1 / a);
        desenha(matBorra, n.a);

        if (i + 1 < niveis) {
          matCopia.uniforms.tDiffuse.value = n.a.texture;
          desenha(matCopia, cadeia[i + 1].a);
        }
      }

      u.tBloom0.value = cadeia[0] ? cadeia[0].a.texture : null;
      u.tBloom1.value = cadeia[1] ? cadeia[1].a.texture : null;
      u.tBloom2.value = cadeia[2] ? cadeia[2].a.texture : null;
    }

    // desfoque do fundo: reduz para um quarto e passa duas vezes a gaussiana
    // separável, que já existe para o bloom
    if (u.forcaDof.value > 0.001) {
      const lq = largura / 4;
      const aq = altura / 4;
      matCopia.uniforms.tDiffuse.value = rtCena.texture;
      desenha(matCopia, rtDofA);
      for (let volta = 0; volta < 2; volta++) {
        matBorra.uniforms.tDiffuse.value = rtDofA.texture;
        matBorra.uniforms.direcao.value.set(1 / lq, 0);
        desenha(matBorra, rtDofB);
        matBorra.uniforms.tDiffuse.value = rtDofB.texture;
        matBorra.uniforms.direcao.value.set(0, 1 / aq);
        desenha(matBorra, rtDofA);
      }
      u.tDof.value = rtDofA.texture;
      u.tDepth.value = rtCena.depthTexture;
    }

    u.tCena.value = rtCena.texture;
    desenha(matFinal, null);
  }

  function definirNiveis(n) {
    if (n === niveis) return;
    niveis = n;
    fazFinal();
    redimensiona(largura, altura);
  }

  function dispose() {
    soltaAlvos();
    matBrilho.dispose(); matBorra.dispose(); matCopia.dispose();
    if (matFinal) matFinal.dispose();
    quad.geometry.dispose();
  }

  return {
    render,
    redimensiona,
    definirNiveis,
    dispose,
    get uniforms() { return matFinal.uniforms; },
  };
}
