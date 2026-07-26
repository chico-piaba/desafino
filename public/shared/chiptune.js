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

  // Efeitos pontuais: lista de [nota MIDI, atraso em segundos, duração].
  const EFEITOS = {
    inicioPartida: [[60, 0, 0.14], [64, 0.09, 0.14], [67, 0.18, 0.14], [72, 0.27, 0.34]],
    contagem: [[64, 0, 0.12], [64, 0.2, 0.12], [64, 0.4, 0.12], [76, 0.6, 0.3]],
    acertou: [[72, 0, 0.1], [76, 0.07, 0.1], [79, 0.14, 0.1], [84, 0.21, 0.36]],
    errou: [[55, 0, 0.22], [51, 0.16, 0.4]],
    fimDeJogo: [
      [72, 0, 0.14], [76, 0.12, 0.14], [79, 0.24, 0.14], [84, 0.36, 0.22],
      [79, 0.58, 0.14], [84, 0.7, 0.55],
    ],
    dica: [[88, 0, 0.08]],
    roubo: [[70, 0, 0.09], [64, 0.09, 0.09], [70, 0.18, 0.14]],
    votacao: [[81, 0, 0.12], [81, 0.16, 0.24]],
  };

  const VOLUME_LOOP = 0.07;
  const VOLUME_EFEITOS = 0.32;

  function criar() {
    let ctx = null;
    let master = null;
    let ruido = null;
    let efeitos = null;
    let timer = null;
    let passo = 0;
    let proximoTempo = 0;
    let mudo = false;
    let ultimoTique = null;

    function garantirContexto() {
      if (ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = mudo ? 0 : VOLUME_LOOP;
      master.connect(ctx.destination);
      // Barramento separado: o loop fica por baixo, os efeitos cortam por cima.
      efeitos = ctx.createGain();
      efeitos.gain.value = mudo ? 0 : VOLUME_EFEITOS;
      efeitos.connect(ctx.destination);
      // buffer de ruído branco pro chimbal
      ruido = ctx.createBuffer(1, ctx.sampleRate * 0.1, ctx.sampleRate);
      const dados = ruido.getChannelData(0);
      for (let i = 0; i < dados.length; i++) dados[i] = Math.random() * 2 - 1;
    }

    function voz(tipo, freq, quando, dur, ganho, destino) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = tipo;
      osc.frequency.value = freq;
      g.gain.setValueAtTime(ganho, quando);
      g.gain.exponentialRampToValueAtTime(0.001, quando + dur);
      osc.connect(g).connect(destino || master);
      osc.start(quando);
      osc.stop(quando + dur + 0.02);
    }

    function chimbal(quando, ganho, destino) {
      const fonte = ctx.createBufferSource();
      fonte.buffer = ruido;
      const filtro = ctx.createBiquadFilter();
      filtro.type = 'highpass';
      filtro.frequency.value = 7000;
      const g = ctx.createGain();
      g.gain.setValueAtTime(ganho, quando);
      g.gain.exponentialRampToValueAtTime(0.001, quando + 0.05);
      fonte.connect(filtro).connect(g).connect(destino || master);
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
      // Para só o loop do lobby. NÃO suspende o contexto: os efeitos tocam
      // durante a partida, que é justamente quando o loop está parado.
      desligar() {
        if (timer) clearInterval(timer);
        timer = null;
      },
      ligado: () => Boolean(timer),

      // Mudo de verdade, para loop e efeitos de uma vez.
      mudo(silenciar) {
        mudo = Boolean(silenciar);
        if (master) master.gain.value = mudo ? 0 : VOLUME_LOOP;
        if (efeitos) efeitos.gain.value = mudo ? 0 : VOLUME_EFEITOS;
      },

      // Abre e acorda o contexto no primeiro gesto do usuário. Sem isto o
      // navegador engole o clique e a primeira partida sai muda.
      destravar() {
        garantirContexto();
        if (ctx.state === 'suspended') ctx.resume();
      },

      tocar(nome) {
        const efeito = EFEITOS[nome];
        if (!efeito || mudo) return;
        garantirContexto();
        if (ctx.state === 'suspended') ctx.resume();
        const agora = ctx.currentTime + 0.02;
        for (const [midi, atraso, dur] of efeito) {
          voz('square', nota(midi), agora + atraso, dur, 0.22, efeitos);
        }
        if (nome === 'acertou' || nome === 'fimDeJogo') chimbal(agora, 0.12, efeitos);
      },

      // Suspense do cronômetro: chamado a cada segundo. Grave e espaçado a
      // partir de 15s, agudo e dobrado nos últimos 5 — casa com o vermelho
      // que o display já pinta no mesmo limiar.
      tique(segundos) {
        if (mudo || typeof segundos !== 'number') return;
        if (segundos > 15 || segundos <= 0) { ultimoTique = null; return; }
        if (ultimoTique === segundos) return; // ignora tick repetido
        ultimoTique = segundos;
        garantirContexto();
        if (ctx.state === 'suspended') ctx.resume();
        const agora = ctx.currentTime + 0.02;
        if (segundos > 5) {
          voz('square', nota(60), agora, 0.07, 0.14, efeitos);
          return;
        }
        voz('square', nota(72), agora, 0.06, 0.2, efeitos);
        voz('square', nota(72), agora + 0.5, 0.06, 0.2, efeitos);
      },
    };
  }

  window.HumATuneChiptune = { criar };
})();
