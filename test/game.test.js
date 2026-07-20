'use strict';
const test = require('node:test');
const assert = require('node:assert');
const game = require('../src/game');

const CONFIG = {
  rodada: { duracaoSegundos: 90, totalRodadas: 8 },
  modos: { cantarolar: 100, mimica: 70 },
  dicas: { cantor: 10, ano: 10, decada: 5, genero: 10, inicialDoTitulo: 15, forca: 25 },
};
const MUSICAS = Array.from({ length: 10 }, (_, i) => ({
  id: `m${i}`, titulo: `Musica Numero ${i}`, artista: `Artista ${i}`, ano: 1990 + i, genero: 'MPB',
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

test('rodada começa em cantarolar valendo 100', () => {
  const jogo = jogoCom2Duplas();
  game.iniciarPartida(jogo);
  game.comecarRodada(jogo, 'a');
  assert.strictEqual(jogo.rodada.fase, 'emAndamento');
  assert.strictEqual(game.valorAtual(jogo), 100);
});

test('só o apresentador inicia, muda modo, acerta e passa', () => {
  const jogo = jogoCom2Duplas();
  game.iniciarPartida(jogo);
  assert.throws(() => game.comecarRodada(jogo, 'b'), /apresentador/);
  game.comecarRodada(jogo, 'a');
  assert.throws(() => game.mudarParaMimica(jogo, 'b'), /apresentador/);
  assert.throws(() => game.acertou(jogo, 'b'), /apresentador/);
  assert.throws(() => game.passar(jogo, 'b'), /apresentador/);
});

test('mudar para mímica derruba o V0 para 70 e é só de ida', () => {
  const jogo = jogoCom2Duplas();
  game.iniciarPartida(jogo);
  game.comecarRodada(jogo, 'a');
  game.mudarParaMimica(jogo, 'a');
  assert.strictEqual(game.valorAtual(jogo), 70);
  assert.throws(() => game.mudarParaMimica(jogo, 'a'), /já está/);
});

test('dicas descontam do valor e revelam conteúdo; só o adivinhador compra', () => {
  const jogo = jogoCom2Duplas();
  game.iniciarPartida(jogo);
  game.comecarRodada(jogo, 'a');
  assert.throws(() => game.comprarDica(jogo, 'a', 'cantor'), /adivinhador/);
  const cantor = game.comprarDica(jogo, 'b', 'cantor');
  assert.strictEqual(cantor.conteudo, 'Artista 0');
  const forca = game.comprarDica(jogo, 'b', 'forca');
  assert.strictEqual(forca.conteudo, '_ _ _ _ _ _   _ _ _ _ _ _   _'); // "Musica Numero 0"
  assert.strictEqual(game.valorAtual(jogo), 100 - 10 - 25);
  assert.throws(() => game.comprarDica(jogo, 'b', 'cantor'), /já comprada/);
  assert.throws(() => game.comprarDica(jogo, 'b', 'nota'), /desconhecida/);
});

test('valor nunca fica negativo', () => {
  const jogo = jogoCom2Duplas();
  game.iniciarPartida(jogo);
  game.comecarRodada(jogo, 'a');
  game.mudarParaMimica(jogo, 'a'); // 70
  game.comprarDica(jogo, 'b', 'cantor'); // -10
  game.comprarDica(jogo, 'b', 'ano'); // -10
  game.comprarDica(jogo, 'b', 'forca'); // -25 → 25
  assert.strictEqual(game.valorAtual(jogo), 25);
});

test('valor para em 0 quando as dicas custam mais que o V0', () => {
  const configCaro = { ...CONFIG, dicas: { cantor: 40, ano: 40, forca: 40 } };
  const jogo = game.criarJogo(configCaro, MUSICAS, () => 0);
  game.entrarJogador(jogo, 'Ana', 1, 'a');
  game.entrarJogador(jogo, 'João', 1, 'b');
  game.entrarJogador(jogo, 'Bia', 2, 'c');
  game.entrarJogador(jogo, 'Leo', 2, 'd');
  game.iniciarPartida(jogo);
  game.comecarRodada(jogo, 'a');
  game.mudarParaMimica(jogo, 'a'); // V0 = 70
  game.comprarDica(jogo, 'b', 'cantor'); // -40
  game.comprarDica(jogo, 'b', 'ano'); // -40 → max(0, 70-80) = 0
  assert.strictEqual(game.valorAtual(jogo), 0);
  game.acertou(jogo, 'a');
  assert.strictEqual(jogo.duplas[1].pontos, 0);
});

test('acertou credita o valor atual à dupla', () => {
  const jogo = jogoCom2Duplas();
  game.iniciarPartida(jogo);
  game.comecarRodada(jogo, 'a');
  game.comprarDica(jogo, 'b', 'cantor');
  game.acertou(jogo, 'a');
  assert.strictEqual(jogo.rodada.fase, 'resultado');
  assert.strictEqual(jogo.rodada.pontosGanhos, 90);
  assert.strictEqual(jogo.duplas[1].pontos, 90);
});

test('passar e tempoEsgotado encerram com 0 pontos', () => {
  const jogo = jogoCom2Duplas();
  game.iniciarPartida(jogo);
  game.comecarRodada(jogo, 'a');
  game.passar(jogo, 'a');
  assert.strictEqual(jogo.rodada.pontosGanhos, 0);
  assert.strictEqual(jogo.duplas[1].pontos, 0);
  game.proximaRodada(jogo);
  game.comecarRodada(jogo, 'c');
  game.tempoEsgotado(jogo);
  assert.strictEqual(jogo.rodada.pontosGanhos, 0);
  assert.strictEqual(jogo.duplas[2].pontos, 0);
});

test('músicas não se repetem entre rodadas', () => {
  const jogo = jogoCom2Duplas();
  game.iniciarPartida(jogo);
  const vistas = [jogo.rodada.musica.id];
  for (let i = 0; i < 3; i++) {
    game.comecarRodada(jogo, jogo.rodada.apresentadorId);
    game.passar(jogo, jogo.rodada.apresentadorId);
    game.proximaRodada(jogo);
    vistas.push(jogo.rodada.musica.id);
  }
  assert.strictEqual(new Set(vistas).size, vistas.length);
});

test('o jogo termina após totalRodadas', () => {
  const jogo = jogoCom2Duplas();
  game.iniciarPartida(jogo);
  for (let i = 0; i < 8; i++) {
    game.comecarRodada(jogo, jogo.rodada.apresentadorId);
    game.acertou(jogo, jogo.rodada.apresentadorId);
    game.proximaRodada(jogo);
  }
  assert.strictEqual(jogo.fase, 'fim');
  assert.strictEqual(jogo.duplas[1].pontos, 400); // 4 rodadas × 100
  assert.strictEqual(jogo.duplas[2].pontos, 400);
});

test('banco esgotado encerra a partida mais cedo com aviso', () => {
  const poucas = MUSICAS.slice(0, 2);
  const jogo = game.criarJogo(CONFIG, poucas, () => 0);
  game.entrarJogador(jogo, 'Ana', 1, 'a');
  game.entrarJogador(jogo, 'João', 1, 'b');
  game.entrarJogador(jogo, 'Bia', 2, 'c');
  game.entrarJogador(jogo, 'Leo', 2, 'd');
  game.iniciarPartida(jogo);
  for (let i = 0; i < 2; i++) {
    game.comecarRodada(jogo, jogo.rodada.apresentadorId);
    game.passar(jogo, jogo.rodada.apresentadorId);
    game.proximaRodada(jogo);
  }
  assert.strictEqual(jogo.fase, 'fim');
  assert.match(jogo.aviso, /esgotado/);
});

test('jogadores recebem num público sequencial', () => {
  const jogo = jogoCom2Duplas();
  assert.deepStrictEqual(jogo.jogadores.map((j) => j.num), [1, 2, 3, 4]);
});

test('removerJogador tira do lobby, libera a vaga e não reaproveita num', () => {
  const jogo = jogoCom2Duplas();
  const numJoao = jogo.jogadores.find((j) => j.id === 'b').num;
  game.removerJogador(jogo, numJoao);
  assert.strictEqual(jogo.jogadores.length, 3);
  const novo = game.entrarJogador(jogo, 'Zé', 1);
  assert.notStrictEqual(novo.num, numJoao);
});

test('removerJogador só funciona no lobby e exige jogador existente', () => {
  const jogo = jogoCom2Duplas();
  assert.throws(() => game.removerJogador(jogo, 99), /não encontrado/);
  game.iniciarPartida(jogo);
  assert.throws(() => game.removerJogador(jogo, 1), /lobby/);
});

test('gerarForca esconde letras, mantém pontuação e pode revelar a inicial', () => {
  assert.strictEqual(game.gerarForca('Anna Júlia', false), '_ _ _ _   _ _ _ _ _');
  assert.strictEqual(game.gerarForca('Trem-Bala', true), 'T _ _ _ - _ _ _ _');
});

test('dicas novas: década, gênero e inicial do título', () => {
  const jogo = jogoCom2Duplas();
  game.iniciarPartida(jogo);
  game.comecarRodada(jogo, 'a');
  assert.strictEqual(game.comprarDica(jogo, 'b', 'decada').conteudo, 'Anos 90'); // 1990
  assert.strictEqual(game.comprarDica(jogo, 'b', 'genero').conteudo, 'MPB');
  assert.strictEqual(game.comprarDica(jogo, 'b', 'inicialDoTitulo').conteudo, 'Começa com "M"');
});

test('década a partir de 2000 sai por extenso', () => {
  const musicas = [{ id: 'x', titulo: 'Festa', artista: 'Ivete Sangalo', ano: 2003, genero: 'Axé' }];
  const jogo = game.criarJogo(CONFIG, musicas, () => 0);
  game.entrarJogador(jogo, 'Ana', 1, 'a');
  game.entrarJogador(jogo, 'João', 1, 'b');
  game.entrarJogador(jogo, 'Bia', 2, 'c');
  game.entrarJogador(jogo, 'Leo', 2, 'd');
  game.iniciarPartida(jogo);
  game.comecarRodada(jogo, 'a');
  assert.strictEqual(game.comprarDica(jogo, 'b', 'decada').conteudo, 'Anos 2000');
});

test('forca comprada antes da inicial é atualizada com a primeira letra', () => {
  const jogo = jogoCom2Duplas();
  game.iniciarPartida(jogo);
  game.comecarRodada(jogo, 'a');
  const forca = game.comprarDica(jogo, 'b', 'forca');
  assert.strictEqual(forca.conteudo, '_ _ _ _ _ _   _ _ _ _ _ _   _');
  game.comprarDica(jogo, 'b', 'inicialDoTitulo');
  assert.strictEqual(
    jogo.rodada.dicasCompradas.find((d) => d.tipo === 'forca').conteudo,
    'M _ _ _ _ _   _ _ _ _ _ _   _'
  );
});

test('gênero indisponível some dos preços e não pode ser comprado', () => {
  const semGenero = [{ id: 'x', titulo: 'Oceano', artista: 'Djavan', ano: 1989 }];
  const jogo = game.criarJogo(CONFIG, semGenero, () => 0);
  game.entrarJogador(jogo, 'Ana', 1, 'a');
  game.entrarJogador(jogo, 'João', 1, 'b');
  game.entrarJogador(jogo, 'Bia', 2, 'c');
  game.entrarJogador(jogo, 'Leo', 2, 'd');
  game.iniciarPartida(jogo);
  game.comecarRodada(jogo, 'a');
  const precos = game.dicasDisponiveis(CONFIG, jogo.rodada.musica);
  assert.ok(!('genero' in precos));
  assert.ok('forca' in precos);
  assert.throws(() => game.comprarDica(jogo, 'b', 'genero'), /indisponível/);
});

test('entrarJogador guarda avatar saneado (só as 5 peças, inteiros 0-99)', () => {
  const jogo = game.criarJogo(CONFIG, MUSICAS);
  const semAvatar = game.entrarJogador(jogo, 'Ana', 1);
  assert.deepStrictEqual(semAvatar.avatar, { fundo: 0, rosto: 0, olhos: 0, boca: 0, acessorio: 0 });
  const comAvatar = game.entrarJogador(jogo, 'João', 1, undefined, {
    fundo: 3, rosto: 1, olhos: 5, boca: 2, acessorio: 6, hack: 'x',
  });
  assert.deepStrictEqual(comAvatar.avatar, { fundo: 3, rosto: 1, olhos: 5, boca: 2, acessorio: 6 });
  const lixo = game.entrarJogador(jogo, 'Bia', 2, undefined, { fundo: 'xss', olhos: -5, boca: 1000 });
  assert.deepStrictEqual(lixo.avatar, { fundo: 0, rosto: 0, olhos: 0, boca: 0, acessorio: 0 });
});
