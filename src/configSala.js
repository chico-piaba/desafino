'use strict';

const PADROES = {
  rodada: { duracaoSegundos: 90, totalRodadas: 8 },
  modos: { cantarolar: 100, mimica: 70 },
  x1: { bonusApresentador: 0.5 },
  dicas: { cantor: 10, ano: 10, decada: 5, genero: 10, inicialDoTitulo: 15, forca: 25 },
  sala: { maxDuplas: 4, maxJogadores: 20 },
  troca: { ligada: true, custo: 20, porRodada: 1 },
  plateia: {
    palpite: true,
    rouboFracao: 0.05,
    bonusFracao: 0.5,
    votacao: true,
    votacaoSegundos: 10,
    palpiteIntervaloMs: 2000,
  },
};

// Só o que o líder ajusta no lobby. bonusFracao, votacaoSegundos e
// palpiteIntervaloMs ficam de fora de propósito: são balanceamento fino,
// não decisão de mesa.
const KNOBS = {
  duracaoSegundos: { caminho: ['rodada', 'duracaoSegundos'], min: 30, max: 180 },
  totalRodadas: { caminho: ['rodada', 'totalRodadas'], min: 4, max: 20 },
  maxDuplas: { caminho: ['sala', 'maxDuplas'], min: 1, max: 10 },
  trocaMusica: { caminho: ['troca', 'ligada'], booleano: true },
  trocaCusto: { caminho: ['troca', 'custo'], min: 0, max: 50 },
  palpitePlateia: { caminho: ['plateia', 'palpite'], booleano: true },
  rouboFracao: { caminho: ['plateia', 'rouboFracao'], min: 0, max: 0.2 },
  votacaoPlateia: { caminho: ['plateia', 'votacao'], booleano: true },
};

function mesclarPadroes(config) {
  const saida = {};
  for (const [secao, valores] of Object.entries(PADROES)) {
    saida[secao] = { ...valores, ...((config && config[secao]) || {}) };
  }
  return saida;
}

function aplicarKnobs(config, knobs) {
  const saida = mesclarPadroes(config);
  for (const [nome, bruto] of Object.entries(knobs || {})) {
    const knob = KNOBS[nome];
    // Knob desconhecido é descartado em silêncio: um cliente desatualizado
    // não pode derrubar a configuração da sala inteira.
    if (!knob) continue;
    const [secao, chave] = knob.caminho;
    if (knob.booleano) {
      saida[secao][chave] = Boolean(bruto);
      continue;
    }
    const numero = Number(bruto);
    if (!Number.isFinite(numero)) continue;
    saida[secao][chave] = Math.min(knob.max, Math.max(knob.min, numero));
  }
  return saida;
}

module.exports = { PADROES, KNOBS, mesclarPadroes, aplicarKnobs };
