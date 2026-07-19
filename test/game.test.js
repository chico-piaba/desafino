'use strict';
const test = require('node:test');
const assert = require('node:assert');
const game = require('../src/game');

const CONFIG = {
  rodada: { duracaoSegundos: 90, totalRodadas: 8 },
  modos: { cantarolar: 100, mimica: 70 },
  dicas: { cantor: 10, ano: 10, quantidadePalavras: 25 },
};
const MUSICAS = Array.from({ length: 10 }, (_, i) => ({
  id: `m${i}`, titulo: `Musica Numero ${i}`, artista: `Artista ${i}`, ano: 1990 + i,
}));

function jogoCom2Duplas() {
  const jogo = game.criarJogo(CONFIG, MUSICAS, () => 0); // rng fixo: sorteia sempre a 1ª disponível
  game.entrarJogador(jogo, 'Ana', 1, 'a');
  game.entrarJogador(jogo, 'João', 1, 'b');
  game.entrarJogador(jogo, 'Bia', 2, 'c');
  game.entrarJogador(jogo, 'Leo', 2, 'd');
  return jogo;
}

test('entrarJogador valida nome, dupla e lotação', () => {
  const jogo = game.criarJogo(CONFIG, MUSICAS);
  assert.throws(() => game.entrarJogador(jogo, '  ', 1), /Nome/);
  assert.throws(() => game.entrarJogador(jogo, 'Ana', 5), /Dupla inválida/);
  game.entrarJogador(jogo, 'Ana', 1);
  game.entrarJogador(jogo, 'João', 1);
  assert.throws(() => game.entrarJogador(jogo, 'Zé', 1), /cheia/);
});

test('iniciarPartida exige pelo menos 2 duplas completas', () => {
  const jogo = game.criarJogo(CONFIG, MUSICAS);
  game.entrarJogador(jogo, 'Ana', 1);
  game.entrarJogador(jogo, 'João', 1);
  assert.throws(() => game.iniciarPartida(jogo), /2 duplas/);
});

test('iniciarPartida rejeita dupla incompleta', () => {
  const jogo = jogoCom2Duplas();
  game.entrarJogador(jogo, 'Solto', 3);
  assert.throws(() => game.iniciarPartida(jogo), /incompleta/);
});

test('iniciarPartida prepara a 1ª rodada com música e papéis', () => {
  const jogo = jogoCom2Duplas();
  game.iniciarPartida(jogo);
  assert.strictEqual(jogo.fase, 'rodada');
  assert.strictEqual(jogo.rodada.fase, 'aguardandoInicio');
  assert.strictEqual(jogo.rodada.dupla, 1);
  assert.strictEqual(jogo.rodada.apresentadorId, 'a');
  assert.strictEqual(jogo.rodada.adivinhadorId, 'b');
  assert.strictEqual(jogo.rodada.musica.id, 'm0');
  assert.strictEqual(jogo.rodada.modo, 'cantarolar');
  assert.strictEqual(jogo.aviso, null); // 8 % 2 === 0, sem aviso
});

test('depois de iniciar ninguém mais entra', () => {
  const jogo = jogoCom2Duplas();
  game.iniciarPartida(jogo);
  assert.throws(() => game.entrarJogador(jogo, 'Tarde', 3), /já começou/);
});

test('rotação alterna duplas e papéis dentro da dupla', () => {
  const jogo = jogoCom2Duplas();
  game.iniciarPartida(jogo);
  // rodada 1: dupla 1, apresenta 'a'
  game.comecarRodada(jogo, 'a');
  game.passar(jogo, 'a');
  game.proximaRodada(jogo);
  // rodada 2: dupla 2, apresenta 'c'
  assert.strictEqual(jogo.rodada.dupla, 2);
  assert.strictEqual(jogo.rodada.apresentadorId, 'c');
  game.comecarRodada(jogo, 'c');
  game.passar(jogo, 'c');
  game.proximaRodada(jogo);
  // rodada 3: dupla 1 de novo, agora apresenta 'b'
  assert.strictEqual(jogo.rodada.dupla, 1);
  assert.strictEqual(jogo.rodada.apresentadorId, 'b');
  assert.strictEqual(jogo.rodada.adivinhadorId, 'a');
});

test('com 3 duplas e 8 rodadas o jogo avisa divisão desigual', () => {
  const jogo = jogoCom2Duplas();
  game.entrarJogador(jogo, 'Carol', 3, 'e');
  game.entrarJogador(jogo, 'Gui', 3, 'f');
  game.iniciarPartida(jogo);
  assert.match(jogo.aviso, /totalRodadas/);
});
