/* ═══════════════ audio — tudo sintetizado, nenhum arquivo ═══════════════
   Mesma filosofia do site das cartas, que gera os sons do lacre e do carimbo
   em WebAudio. Aqui a lista é maior: chuva, vento, passos, sino, baque e um
   acorde de fundo que troca a cada cena.
   ══════════════════════════════════════════════════════════════════════ */

let ctx = null;
let mestre = null;
let barulhoAmbiente = null;
let padAtual = null;
let mudo = false;
let ligado = false;

/** Ruído branco de N segundos, reaproveitado por todo mundo que precisa chiar. */
function bufferRuido(segundos, tipo) {
  const n = Math.floor(ctx.sampleRate * segundos);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  if (tipo === 'marrom') {
    let ultimo = 0;
    for (let i = 0; i < n; i++) {
      const branco = Math.random() * 2 - 1;
      ultimo = (ultimo + 0.02 * branco) / 1.02;
      d[i] = ultimo * 3.5;
    }
  } else {
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  }
  return buf;
}

export function iniciar() {
  if (ligado) return;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    mestre = ctx.createGain();
    mestre.gain.value = mudo ? 0 : 0.9;
    mestre.connect(ctx.destination);
    ligado = true;
  } catch (e) {
    ligado = false;
  }
}

export function retomar() {
  if (ctx && ctx.state === 'suspended') ctx.resume();
}

export function alternarMudo() {
  mudo = !mudo;
  if (mestre) mestre.gain.setTargetAtTime(mudo ? 0 : 0.9, ctx.currentTime, 0.05);
  aplicarMudoNaMusica();
  return mudo;
}

export function estaMudo() {
  return mudo;
}

/* ── música de verdade, em arquivo ──────────────────────────────────────
   Tudo mais aqui é sintetizado, e continua sendo. Isto é a exceção: um lugar
   para o Daniel pôr uma faixa que ele escolheu, na pasta `musica/`.

   É um <audio> comum, e NÃO o WebAudio como o resto. O motivo é o mesmo que
   guia o projeto inteiro: o presente tem que abrir com dois cliques, em
   `file://`, sem servidor. Ali um `fetch` de arquivo local morre no CORS e um
   `createMediaElementSource` contamina o grafo; um <audio> com caminho
   relativo simplesmente toca.

   Se o arquivo não existir, falha calada — é assim que a demo publicada, que
   não leva a música junto, continua funcionando sem precisar de nada. */
let musicaEl = null;
let musicaVolume = 0.5;
let ultimoAmbiente = null;

function aplicarMudoNaMusica() {
  if (musicaEl) musicaEl.volume = mudo ? 0 : musicaVolume;
}

export function musica(src, { volume = 0.5, laco = true } = {}) {
  if (!src) return;
  // já está tocando esta faixa: não recomeça (a troca de cena passa por aqui)
  if (musicaEl && musicaEl.dataset.src === src) return;
  pararMusica();
  try {
    musicaEl = new Audio(src);
    musicaEl.dataset.src = src;
    musicaEl.loop = laco;
    musicaVolume = volume;
    musicaEl.volume = 0;
    /* Se o arquivo não existir, o erro chega DEPOIS — e a essa altura o
       `ambiente` já rodou e já abaixou o pad achando que tinha música. Sem
       remontar o ambiente aqui, quem não põe música nenhuma (a demo publicada,
       e o jogo até o Daniel salvar o mp3) ficava com o acorde de fundo quase
       inaudível o jogo inteiro. */
    musicaEl.addEventListener('error', () => {
      pararMusica();
      if (ultimoAmbiente) ambiente(ultimoAmbiente);
    });
    const p = musicaEl.play();
    if (p && p.catch) p.catch(() => { /* sem gesto do usuário ainda, ou sem arquivo */ });
    // entra em fade: começar no volume cheio dá um tapa depois do silêncio
    const alvo = mudo ? 0 : volume;
    let v = 0;
    const subir = setInterval(() => {
      if (!musicaEl) return clearInterval(subir);
      v = Math.min(alvo, v + alvo / 40);
      musicaEl.volume = v;
      if (v >= alvo) clearInterval(subir);
    }, 50);
  } catch (e) {
    musicaEl = null;
  }
}

export function pararMusica() {
  if (!musicaEl) return;
  try { musicaEl.pause(); } catch (e) { /* nada a fazer */ }
  musicaEl = null;
}

/** Há música de arquivo tocando? Os pads sintetizados abaixam quando sim. */
export function temMusica() {
  return !!musicaEl;
}

/* ── camada ambiente: chuva, vento e um pad harmônico por cena ── */

function pararAmbiente() {
  if (barulhoAmbiente) {
    barulhoAmbiente.forEach((n) => {
      try {
        n.stop ? n.stop() : n.disconnect();
      } catch (e) {}
    });
    barulhoAmbiente = null;
  }
  if (padAtual) {
    const t = ctx.currentTime;
    padAtual.g.gain.cancelScheduledValues(t);
    padAtual.g.gain.setTargetAtTime(0, t, 0.6);
    const osc = padAtual.osc;
    setTimeout(() => osc.forEach((o) => { try { o.stop(); } catch (e) {} }), 2500);
    padAtual = null;
  }
}

/**
 * @param {object} cfg  {chuva:0..1, vento:0..1, brilho:Hz} mais a harmonia:
 *   `acorde:[freqs]` para um acorde parado, ou `progressao:[[freqs],…]` com
 *   `compasso` em segundos para uma que ande. Os dois são opcionais.
 */
export function ambiente(cfg) {
  if (!ligado) return;
  ultimoAmbiente = cfg;
  pararAmbiente();
  const t = ctx.currentTime;
  const nos = [];

  if (cfg.chuva > 0) {
    const src = ctx.createBufferSource();
    src.buffer = bufferRuido(3, 'branco');
    src.loop = true;
    const passaAlta = ctx.createBiquadFilter();
    passaAlta.type = 'highpass';
    passaAlta.frequency.value = 900;
    const passaBaixa = ctx.createBiquadFilter();
    passaBaixa.type = 'lowpass';
    passaBaixa.frequency.value = cfg.brilho || 6000;
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setTargetAtTime(0.055 * cfg.chuva, t, 1.2);

    // rajadas: o volume respira devagar, senão vira chiado de televisão
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.09;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 0.02 * cfg.chuva;
    lfo.connect(lfoG).connect(g.gain);
    lfo.start();

    src.connect(passaAlta).connect(passaBaixa).connect(g).connect(mestre);
    src.start();
    nos.push(src, lfo);
  }

  if (cfg.vento > 0) {
    const src = ctx.createBufferSource();
    src.buffer = bufferRuido(4, 'marrom');
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 420;
    f.Q.value = 1.4;
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setTargetAtTime(0.05 * cfg.vento, t, 2);

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.055;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 220;
    lfo.connect(lfoG).connect(f.frequency);
    lfo.start();

    src.connect(f).connect(g).connect(mestre);
    src.start();
    nos.push(src, lfo);
  }

  const progressao = cfg.progressao && cfg.progressao.length ? cfg.progressao : null;
  const primeiro = progressao ? progressao[0] : cfg.acorde;

  if (primeiro && primeiro.length) {
    const g = ctx.createGain();
    /* Com música de arquivo tocando, o pad quase some: acorde sintetizado por
       cima de uma balada não soma, suja. Ele fica só como cola grave. */
    const forca = temMusica() ? 0.008 : 0.035;
    g.gain.value = 0;
    g.gain.setTargetAtTime(forca, t, 3);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1100;
    g.connect(f).connect(mestre);
    const osc = primeiro.map((freq, i) => {
      const o = ctx.createOscillator();
      o.type = i === 0 ? 'sine' : 'triangle';
      o.frequency.value = freq;
      o.detune.value = (i - 1) * 4;
      const og = ctx.createGain();
      og.gain.value = 1 / (i + 1.6);
      o.connect(og).connect(g);
      o.start();
      return o;
    });

    /* A progressão. Em vez de um acorde parado, os mesmos osciladores mudam de
       nota em nota agendada — nada de temporizador em JavaScript, que
       engasgaria junto com o quadro. O WebAudio aceita agendamento longe no
       futuro, então dá para escrever a volta inteira de uma vez.

       `setTargetAtTime` e não `setValueAtTime`: o salto seco de frequência dá
       um clique audível no oscilador. A constante de 0,12 s desliza a nota,
       que é o que um pad faz.

       Quinze minutos bastam com folga: a corrida inteira dá uns quatro, e cada
       troca de cena refaz o pad do zero. */
    if (progressao) {
      const compasso = cfg.compasso ?? 6;
      const voltas = Math.ceil((15 * 60) / (compasso * progressao.length));
      for (let volta = 0; volta < voltas; volta++) {
        for (let c = 0; c < progressao.length; c++) {
          if (volta === 0 && c === 0) continue;   // o primeiro já está soando
          const quando = t + ((volta * progressao.length) + c) * compasso;
          progressao[c].forEach((freq, i) => {
            if (osc[i]) osc[i].frequency.setTargetAtTime(freq, quando, 0.12);
          });
        }
      }
    }

    padAtual = { g, osc };
  }

  barulhoAmbiente = nos;
}

/* ── efeitos pontuais ── */

function envelope(g, pico, ataque, queda, t) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(pico, t + ataque);
  g.gain.exponentialRampToValueAtTime(0.0001, t + ataque + queda);
}

/** Passo na calçada molhada: estalo curto de ruído filtrado. */
export function passo(forca = 1) {
  if (!ligado) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = bufferRuido(0.09, 'branco');
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = 1500 + Math.random() * 900;
  f.Q.value = 1.1;
  const g = ctx.createGain();
  envelope(g, 0.055 * forca, 0.004, 0.075, t);
  src.connect(f).connect(g).connect(mestre);
  src.start(t);
  src.stop(t + 0.12);
}

export function respingo() {
  if (!ligado) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = bufferRuido(0.3, 'branco');
  const f = ctx.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.setValueAtTime(700, t);
  f.frequency.exponentialRampToValueAtTime(2600, t + 0.25);
  const g = ctx.createGain();
  envelope(g, 0.14, 0.008, 0.28, t);
  src.connect(f).connect(g).connect(mestre);
  src.start(t);
  src.stop(t + 0.35);
}

export function pulo() {
  if (!ligado) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(220, t);
  o.frequency.exponentialRampToValueAtTime(430, t + 0.13);
  const g = ctx.createGain();
  envelope(g, 0.09, 0.006, 0.14, t);
  o.connect(g).connect(mestre);
  o.start(t);
  o.stop(t + 0.2);
}

export function pouso() {
  if (!ligado) return;
  passo(1.6);
}

/** Batida num obstáculo: baque grave e curto, com um pouco de aspereza. */
export function baque() {
  if (!ligado) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(170, t);
  o.frequency.exponentialRampToValueAtTime(48, t + 0.19);
  const g = ctx.createGain();
  envelope(g, 0.42, 0.004, 0.24, t);
  o.connect(g).connect(mestre);
  o.start(t);
  o.stop(t + 0.3);

  const src = ctx.createBufferSource();
  src.buffer = bufferRuido(0.14, 'branco');
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 900;
  const g2 = ctx.createGain();
  envelope(g2, 0.2, 0.003, 0.12, t);
  src.connect(f).connect(g2).connect(mestre);
  src.start(t);
  src.stop(t + 0.2);
}

/** Sino ao pegar um envelope — dois harmônicos, igual ao chime do site. */
export function sino() {
  if (!ligado) return;
  const t = ctx.currentTime;
  [1174.7, 1567.98, 2349.3].forEach((fq, i) => {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = fq;
    const g = ctx.createGain();
    const inicio = t + i * 0.045;
    g.gain.setValueAtTime(0.0001, inicio);
    g.gain.exponentialRampToValueAtTime(0.13 / (i + 1), inicio + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, inicio + 1.3);
    o.connect(g).connect(mestre);
    o.start(inicio);
    o.stop(inicio + 1.4);
  });
}

/** Perdeu o último coração. */
export function tombo() {
  if (!ligado) return;
  const t = ctx.currentTime;
  [392, 329.6, 261.6].forEach((fq, i) => {
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = fq;
    const g = ctx.createGain();
    const inicio = t + i * 0.13;
    g.gain.setValueAtTime(0.0001, inicio);
    g.gain.exponentialRampToValueAtTime(0.11, inicio + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, inicio + 0.75);
    o.connect(g).connect(mestre);
    o.start(inicio);
    o.stop(inicio + 0.8);
  });
}

/** Chegou num checkpoint. */
export function marco() {
  if (!ligado) return;
  const t = ctx.currentTime;
  [523.25, 659.25].forEach((fq, i) => {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = fq;
    const g = ctx.createGain();
    const inicio = t + i * 0.1;
    g.gain.setValueAtTime(0.0001, inicio);
    g.gain.exponentialRampToValueAtTime(0.1, inicio + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, inicio + 0.9);
    o.connect(g).connect(mestre);
    o.start(inicio);
    o.stop(inicio + 1);
  });
}

/** Sino de porta de loja — o mesmo gesto do chime que abre a agência. */
export function sinetaDaPorta() {
  if (!ligado) return;
  const t = ctx.currentTime;
  [880, 1174.7].forEach((fq, i) => {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = fq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t + i * 0.12);
    g.gain.exponentialRampToValueAtTime(0.2, t + i * 0.12 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.12 + 1.6);
    o.connect(g).connect(mestre);
    o.start(t + i * 0.12);
    o.stop(t + i * 0.12 + 1.7);
  });
}

/**
 * Uma badalada de sino. Sino não é som harmônico: os parciais ficam em razões
 * NÃO inteiras da fundamental, e cada um decai num tempo diferente — é daí que
 * vem o timbre metálico e o "batimento" que faz um sino soar como sino em vez
 * de flauta. As razões abaixo são as clássicas de sino de torre.
 */
function sino1(freq, quando, volume, duracao) {
  const PARCIAIS = [
    { r: 0.5,  g: 0.30, d: 1.00 },   // o hum, uma oitava abaixo
    { r: 1.0,  g: 1.00, d: 0.90 },   // fundamental
    { r: 1.19, g: 0.42, d: 0.55 },   // terça menor, a assinatura do sino
    { r: 1.50, g: 0.32, d: 0.45 },
    { r: 2.00, g: 0.38, d: 0.35 },
    { r: 2.55, g: 0.22, d: 0.22 },
    { r: 3.42, g: 0.14, d: 0.15 },
  ];
  const saida = ctx.createGain();
  saida.gain.value = volume;
  const filtro = ctx.createBiquadFilter();
  filtro.type = 'lowpass';
  filtro.frequency.value = 4200;
  saida.connect(filtro).connect(mestre);

  for (const p of PARCIAIS) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq * p.r;
    // desafinar de leve dá o batimento lento de um sino grande
    o.detune.value = (Math.random() - 0.5) * 6;
    const g = ctx.createGain();
    const dur = duracao * p.d;
    g.gain.setValueAtTime(0.0001, quando);
    g.gain.exponentialRampToValueAtTime(p.g, quando + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, quando + dur);
    o.connect(g).connect(saida);
    o.start(quando);
    o.stop(quando + dur + 0.05);
  }
}

/**
 * As badaladas de Westminster. A frase é a original de 1793 (domínio público):
 * sol♯ fá♯ mi si — e por baixo entra o sino grave da hora, em mi.
 */
export function badaladas() {
  if (!ligado) return;
  const t = ctx.currentTime + 0.2;

  const SOL = 415.30, FA = 369.99, MI = 329.63, SI = 246.94;
  const FRASE = [SOL, FA, MI, SI];
  FRASE.forEach((f, i) => sino1(f, t + i * 1.15, 0.16, 4.2));

  // o sino da hora, grave, entrando quando a frase termina
  const MI_GRAVE = 164.81;
  for (let i = 0; i < 3; i++) {
    sino1(MI_GRAVE, t + 5.1 + i * 2.1, 0.2, 7);
  }
}

export function silenciarTudo() {
  pararMusica();
  if (!ligado) return;
  pararAmbiente();
}
