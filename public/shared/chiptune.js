'use strict';
// Música de lobby do Hum-a-Tune: chiptune 8-bit gerado em WebAudio.
// Zero arquivos e zero direitos autorais — funciona offline.
(function () {
  const BPM = 112;
  const PASSO = 60 / BPM / 2; // colcheias
  const nota = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

  // 4 compassos de 8 colcheias (null = pausa), progressão C — Am — F — G
  const MELODIA = [
    76, 79, 81, 79, 76, 74, 72, 74,
    76, 79, 81, 84, 81, 79, 76, null,
    76, 79, 81, 79, 76, 74, 72, 74,
    74, 76, 74, 72, 69, null, 72, null,
  ];
  const BAIXO_RAIZ = [48, 45, 41, 43]; // C3, A2, F2, G2
  const BAIXO_BATIDAS = [0, 3, 4, 6];

  function criar() {
    let ctx = null;
    let master = null;
    let ruido = null;
    let timer = null;
    let passo = 0;
    let proximoTempo = 0;

    function garantirContexto() {
      if (ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.07;
      master.connect(ctx.destination);
      // buffer de ruído branco pro chimbal
      ruido = ctx.createBuffer(1, ctx.sampleRate * 0.1, ctx.sampleRate);
      const dados = ruido.getChannelData(0);
      for (let i = 0; i < dados.length; i++) dados[i] = Math.random() * 2 - 1;
    }

    function voz(tipo, freq, quando, dur, ganho) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = tipo;
      osc.frequency.value = freq;
      g.gain.setValueAtTime(ganho, quando);
      g.gain.exponentialRampToValueAtTime(0.001, quando + dur);
      osc.connect(g).connect(master);
      osc.start(quando);
      osc.stop(quando + dur + 0.02);
    }

    function chimbal(quando, ganho) {
      const fonte = ctx.createBufferSource();
      fonte.buffer = ruido;
      const filtro = ctx.createBiquadFilter();
      filtro.type = 'highpass';
      filtro.frequency.value = 7000;
      const g = ctx.createGain();
      g.gain.setValueAtTime(ganho, quando);
      g.gain.exponentialRampToValueAtTime(0.001, quando + 0.05);
      fonte.connect(filtro).connect(g).connect(master);
      fonte.start(quando);
    }

    function agendar() {
      while (proximoTempo < ctx.currentTime + 0.15) {
        const i = passo % MELODIA.length;
        if (MELODIA[i] != null) voz('square', nota(MELODIA[i]), proximoTempo, 0.2, 0.16);
        if (BAIXO_BATIDAS.includes(i % 8)) {
          voz('triangle', nota(BAIXO_RAIZ[Math.floor(i / 8)]), proximoTempo, 0.28, 0.24);
        }
        if (i % 2 === 0) chimbal(proximoTempo, i % 8 === 0 ? 0.09 : 0.04);
        passo += 1;
        proximoTempo += PASSO;
      }
    }

    return {
      ligar() {
        garantirContexto();
        if (ctx.state === 'suspended') ctx.resume();
        if (timer) return;
        passo = 0;
        proximoTempo = ctx.currentTime + 0.05;
        agendar();
        timer = setInterval(agendar, 40);
      },
      desligar() {
        if (timer) clearInterval(timer);
        timer = null;
        if (ctx && ctx.state === 'running') ctx.suspend();
      },
      ligado: () => Boolean(timer),
    };
  }

  window.HumATuneChiptune = { criar };
})();
