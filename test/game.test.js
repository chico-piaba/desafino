'use strict';
const test = require('node:test');
const assert = require('node:assert');
const game = require('../src/game');

const CONFIG = {
  rodada: { duracaoSegundos: 90, totalRodadas: 8 },
  modos: { cantarolar: 100, mimica: 70 },
  x1: { bonusApresentador: 0.5 },
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

test('iniciarPartida exige pelo menos uma dupla completa', () => {
  const jogo = game.criarJogo(CONFIG, MUSICAS);
  assert.throws(() => game.iniciarPartida(jogo), /dupla completa/);
  game.entrarJogador(jogo, 'Ana', 1);
  assert.throws(() => game.iniciarPartida(jogo), /incompleta/);
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

function jogoX1() {
  const jogo = game.criarJogo(CONFIG, MUSICAS, () => 0);
  game.entrarJogador(jogo, 'Ana', 1, 'a');
  game.entrarJogador(jogo, 'João', 1, 'b');
  game.iniciarPartida(jogo);
  return jogo;
}

test('uma dupla sozinha entra no modo x1 com placar individual', () => {
  const jogo = jogoX1();
  assert.strictEqual(jogo.modo, 'x1');
  assert.deepStrictEqual(jogo.pontosJogadores, { 1: 0, 2: 0 });
  assert.deepStrictEqual(jogo.duplas, {});
  assert.strictEqual(jogo.rodada.apresentadorId, 'a');
});

test('duas duplas completas seguem no modo clássico', () => {
  const jogo = jogoCom2Duplas();
  game.iniciarPartida(jogo);
  assert.strictEqual(jogo.modo, 'duplas');
  assert.strictEqual(jogo.pontosJogadores[1], undefined);
});

test('x1: acerto credita o adivinhador e dá bônus ao apresentador', () => {
  const jogo = jogoX1();
  game.comecarRodada(jogo, 'a');
  game.comprarDica(jogo, 'b', 'cantor'); // valor 90
  game.acertou(jogo, 'a');
  assert.strictEqual(jogo.rodada.pontosGanhos, 90);
  assert.strictEqual(jogo.rodada.bonusApresentador, 45);
  assert.strictEqual(jogo.pontosJogadores[2], 90); // João adivinhou
  assert.strictEqual(jogo.pontosJogadores[1], 45); // Ana apresentou
  game.proximaRodada(jogo);
  assert.strictEqual(jogo.rodada.apresentadorId, 'b'); // papéis invertem
  assert.strictEqual(jogo.rodada.adivinhadorId, 'a');
});

test('x1: bônus arredonda e passar/tempo não dá bônus', () => {
  const jogo = jogoX1();
  game.comecarRodada(jogo, 'a');
  game.comprarDica(jogo, 'b', 'cantor'); // -10
  game.comprarDica(jogo, 'b', 'forca'); // -25 → 65
  game.acertou(jogo, 'a');
  assert.strictEqual(jogo.rodada.bonusApresentador, 33); // round(32.5)
  game.proximaRodada(jogo);
  game.comecarRodada(jogo, 'b');
  game.passar(jogo, 'b');
  assert.strictEqual(jogo.rodada.pontosGanhos, 0);
  assert.strictEqual(jogo.rodada.bonusApresentador, 0);
  assert.strictEqual(jogo.pontosJogadores[2], 65); // João: adivinhou a 1ª rodada (65)
  assert.strictEqual(jogo.pontosJogadores[1], 33); // Ana: bônus de apresentadora (33)
});

test('criarJogo completa o config com os padrões', () => {
  const jogo = game.criarJogo({ rodada: { duracaoSegundos: 60 } }, MUSICAS);
  assert.strictEqual(jogo.config.rodada.duracaoSegundos, 60);
  assert.strictEqual(jogo.config.sala.maxDuplas, 4);
  assert.strictEqual(jogo.config.plateia.rouboFracao, 0.05);
});

test('maxDuplas maior libera duplas acima de 4', () => {
  const jogo = game.criarJogo({ ...CONFIG, sala: { maxDuplas: 10, maxJogadores: 20 } }, MUSICAS);
  const j = game.entrarJogador(jogo, 'Ana', 7, 'a');
  assert.strictEqual(j.dupla, 7);
  assert.throws(() => game.entrarJogador(jogo, 'Zé', 11), /Dupla inválida/);
});

test('maxJogadores barra a sala lotada', () => {
  const jogo = game.criarJogo({ ...CONFIG, sala: { maxDuplas: 10, maxJogadores: 4 } }, MUSICAS);
  game.entrarJogador(jogo, 'A', 1, 'a');
  game.entrarJogador(jogo, 'B', 1, 'b');
  game.entrarJogador(jogo, 'C', 2, 'c');
  game.entrarJogador(jogo, 'D', 2, 'd');
  assert.throws(() => game.entrarJogador(jogo, 'E', 3), /lotada/);
});

test('a rodada nasce com os campos de ação, roubo e votação', () => {
  const jogo = jogoCom2Duplas();
  game.iniciarPartida(jogo);
  const r = jogo.rodada;
  assert.deepStrictEqual(r.acoes, []);
  assert.deepStrictEqual(r.roubos, []);
  assert.deepStrictEqual(r.duplasQueRoubaram, []);
  assert.strictEqual(r.trocasUsadas, 0);
  assert.strictEqual(r.votacao, null);
});

test('trocar música cobra o custo, sorteia outra e é só do apresentador', () => {
  const jogo = jogoCom2Duplas();
  game.iniciarPartida(jogo);
  game.comecarRodada(jogo, 'a');
  const antiga = jogo.rodada.musica.id;
  assert.throws(() => game.trocarMusica(jogo, 'b'), /apresentador/);
  const nova = game.trocarMusica(jogo, 'a');
  assert.notStrictEqual(nova.id, antiga);
  assert.strictEqual(jogo.rodada.musica.id, nova.id);
  assert.strictEqual(game.valorAtual(jogo), 80); // 100 − 20
  assert.strictEqual(jogo.rodada.trocasUsadas, 1);
});

test('trocar música não devolve o que já foi gasto em dicas', () => {
  const jogo = jogoCom2Duplas();
  game.iniciarPartida(jogo);
  game.comecarRodada(jogo, 'a');
  game.comprarDica(jogo, 'b', 'cantor'); // −10
  game.comprarDica(jogo, 'b', 'forca'); // −25
  game.trocarMusica(jogo, 'a'); // −20
  assert.strictEqual(game.valorAtual(jogo), 45); // 100 − 10 − 25 − 20
  assert.deepStrictEqual(jogo.rodada.dicasCompradas, []); // pode recomprar na música nova
  game.comprarDica(jogo, 'b', 'cantor'); // −10 de novo
  assert.strictEqual(game.valorAtual(jogo), 35);
});

test('trocar música respeita o limite por rodada e a música velha não volta', () => {
  const jogo = jogoCom2Duplas();
  game.iniciarPartida(jogo);
  game.comecarRodada(jogo, 'a');
  const antiga = jogo.rodada.musica.id;
  game.trocarMusica(jogo, 'a');
  assert.throws(() => game.trocarMusica(jogo, 'a'), /já trocou/);
  assert.ok(jogo.musicasUsadas.includes(antiga));
});

test('troca desligada no config é recusada', () => {
  const jogo = game.criarJogo({ ...CONFIG, troca: { ligada: false, custo: 20, porRodada: 1 } }, MUSICAS, () => 0);
  game.entrarJogador(jogo, 'Ana', 1, 'a');
  game.entrarJogador(jogo, 'João', 1, 'b');
  game.entrarJogador(jogo, 'Bia', 2, 'c');
  game.entrarJogador(jogo, 'Leo', 2, 'd');
  game.iniciarPartida(jogo);
  game.comecarRodada(jogo, 'a');
  assert.throws(() => game.trocarMusica(jogo, 'a'), /desligada/);
});

function jogoCom3Duplas() {
  const jogo = jogoCom2Duplas();
  game.entrarJogador(jogo, 'Carol', 3, 'e');
  game.entrarJogador(jogo, 'Gui', 3, 'f');
  game.iniciarPartida(jogo);
  game.comecarRodada(jogo, 'a');
  return jogo; // apresenta 'a' (num 1), adivinha 'b' (num 2); plateia = nums 3,4,5,6
}

test('"eu acertei" abre votação só para a plateia conectada', () => {
  const jogo = jogoCom3Duplas();
  assert.throws(() => game.adivinhadorAcertou(jogo, 'a', [3, 4]), /adivinhador/);
  const v = game.adivinhadorAcertou(jogo, 'b', [3, 4]);
  assert.strictEqual(jogo.rodada.fase, 'votacao');
  assert.strictEqual(v.origem, 'adivinhador');
  assert.deepStrictEqual(v.eleitores, [3, 4]);
});

test('maioria simples aprova e paga o pote descontado', () => {
  const jogo = jogoCom3Duplas();
  game.comprarDica(jogo, 'b', 'cantor'); // −10 → 90
  game.adivinhadorAcertou(jogo, 'b', [3, 4, 5]);
  assert.strictEqual(game.votar(jogo, 3, true), null); // 1 de 3, ainda não
  const r = game.votar(jogo, 4, true); // 2 de 3 → passou de 50%
  assert.strictEqual(r.aprovada, true);
  assert.strictEqual(jogo.rodada.fase, 'resultado');
  assert.strictEqual(jogo.rodada.pontosGanhos, 90);
  assert.strictEqual(jogo.duplas[1].pontos, 90);
});

test('votação reprovada por "eu acertei" devolve a rodada ao andamento', () => {
  const jogo = jogoCom3Duplas();
  game.adivinhadorAcertou(jogo, 'b', [3, 4]);
  game.votar(jogo, 3, false);
  const r = game.votar(jogo, 4, false);
  assert.strictEqual(r.aprovada, false);
  assert.strictEqual(jogo.rodada.fase, 'emAndamento');
  assert.strictEqual(jogo.rodadasJogadas, 0);
});

test('empate não aprova — exige mais de 50%', () => {
  const jogo = jogoCom3Duplas();
  game.adivinhadorAcertou(jogo, 'b', [3, 4]);
  game.votar(jogo, 3, true);
  const r = game.votar(jogo, 4, false);
  assert.strictEqual(r.aprovada, false);
  assert.strictEqual(jogo.rodada.fase, 'emAndamento');
});

test('quem não é eleitor não vota', () => {
  const jogo = jogoCom3Duplas();
  game.adivinhadorAcertou(jogo, 'b', [3, 4]);
  assert.throws(() => game.votar(jogo, 99, true), /não vota/);
});

test('tempo esgotado abre votação; reprovada crava 0', () => {
  const jogo = jogoCom3Duplas();
  game.tempoEsgotado(jogo, [3, 4]);
  assert.strictEqual(jogo.rodada.fase, 'votacao');
  assert.strictEqual(jogo.rodada.votacao.origem, 'tempo');
  const r = game.fecharVotacaoPorPrazo(jogo); // ninguém votou
  assert.strictEqual(r.aprovada, false);
  assert.strictEqual(jogo.rodada.fase, 'resultado');
  assert.strictEqual(jogo.rodada.pontosGanhos, 0);
});

test('tempo esgotado com votação aprovada no prazo paga o pote', () => {
  const jogo = jogoCom3Duplas();
  game.tempoEsgotado(jogo, [3, 4, 5]);
  game.votar(jogo, 3, true);
  game.votar(jogo, 4, true);
  assert.strictEqual(jogo.rodada.fase, 'resultado');
  assert.strictEqual(jogo.rodada.pontosGanhos, 100);
});

test('sem plateia não há votação: x1 mantém o comportamento antigo', () => {
  const jogo = jogoX1();
  game.comecarRodada(jogo, 'a');
  assert.strictEqual(game.adivinhadorAcertou(jogo, 'b', []), null);
  assert.strictEqual(jogo.rodada.fase, 'emAndamento');
  game.tempoEsgotado(jogo, []);
  assert.strictEqual(jogo.rodada.fase, 'resultado');
  assert.strictEqual(jogo.rodada.pontosGanhos, 0);
});

test('votação desligada no config não abre', () => {
  const jogo = jogoCom2Duplas();
  jogo.config.plateia.votacao = false;
  game.iniciarPartida(jogo);
  game.comecarRodada(jogo, 'a');
  assert.strictEqual(game.adivinhadorAcertou(jogo, 'b', [3, 4]), null);
  assert.strictEqual(jogo.rodada.fase, 'emAndamento');
});

test('apresentador resolve na hora mesmo com a votação aberta', () => {
  const jogo = jogoCom3Duplas();
  game.adivinhadorAcertou(jogo, 'b', [3, 4]);
  game.acertou(jogo, 'a');
  assert.strictEqual(jogo.rodada.fase, 'resultado');
  assert.strictEqual(jogo.rodada.votacao, null);
  assert.strictEqual(jogo.rodada.pontosGanhos, 100);
});

test('palpite errado da plateia não mexe no pote', () => {
  const jogo = jogoCom3Duplas();
  const r = game.palpitar(jogo, 'c', 'Aquarela');
  assert.deepStrictEqual(r, { certo: false });
  assert.strictEqual(game.valorAtual(jogo), 100);
});

test('palpite certo rouba a fração do pote e paga metade à dupla', () => {
  const jogo = jogoCom3Duplas(); // música "Musica Numero 0"
  const r = game.palpitar(jogo, 'c', 'musica numero 0');
  assert.strictEqual(r.certo, true);
  assert.strictEqual(r.roubo, 5); // round(100 × 0.05)
  assert.strictEqual(r.bonus, 3); // round(5 × 0.5)
  assert.strictEqual(r.nome, 'Bia');
  assert.strictEqual(game.valorAtual(jogo), 95);
  assert.strictEqual(jogo.duplas[2].pontos, 3);
});

test('a mesma dupla só rouba uma vez por rodada', () => {
  const jogo = jogoCom3Duplas();
  game.palpitar(jogo, 'c', 'Musica Numero 0'); // Bia, dupla 2
  const r = game.palpitar(jogo, 'd', 'Musica Numero 0'); // Leo, mesma dupla 2
  assert.deepStrictEqual(r, { certo: true, roubo: 0, bonus: 0, repetido: true });
  assert.strictEqual(game.valorAtual(jogo), 95);
  assert.strictEqual(jogo.duplas[2].pontos, 3);
});

test('duplas diferentes roubam em sequência sobre o pote que resta', () => {
  const jogo = jogoCom3Duplas();
  const primeiro = game.palpitar(jogo, 'c', 'Musica Numero 0'); // dupla 2: 100 → 95
  const segundo = game.palpitar(jogo, 'e', 'Musica Numero 0'); // dupla 3: 95 → 90
  assert.strictEqual(primeiro.roubo, 5);
  assert.strictEqual(segundo.roubo, 5); // round(95 × 0.05) = 5
  assert.strictEqual(game.valorAtual(jogo), 90);
  assert.strictEqual(jogo.duplas[3].pontos, 3);
});

test('quem está jogando a rodada não palpita', () => {
  const jogo = jogoCom3Duplas();
  assert.throws(() => game.palpitar(jogo, 'a', 'Musica Numero 0'), /não palpita/);
  assert.throws(() => game.palpitar(jogo, 'b', 'Musica Numero 0'), /não palpita/);
});

test('palpite vazio e palpite com a mecânica desligada são recusados', () => {
  const jogo = jogoCom3Duplas();
  assert.throws(() => game.palpitar(jogo, 'c', '   '), /vazio/);
  jogo.config.plateia.palpite = false;
  assert.throws(() => game.palpitar(jogo, 'c', 'Musica Numero 0'), /desligado/);
});

test('x1 não tem plateia para palpitar', () => {
  const jogo = jogoX1();
  game.comecarRodada(jogo, 'a');
  assert.throws(() => game.palpitar(jogo, 'a', 'Musica Numero 0'), /Sem plateia/);
});

test('o roubo tolera acento, pontuação e dedo gordo', () => {
  const jogo = jogoCom3Duplas();
  assert.strictEqual(game.palpitar(jogo, 'c', 'MÚSICA NÚMERO 0!!').certo, true);
});

test('reiniciarPartida mantém jogadores e duplas, zera só a partida', () => {
  const jogo = jogoCom2Duplas();
  game.iniciarPartida(jogo);
  game.comecarRodada(jogo, 'a');
  game.acertou(jogo, 'a');
  assert.strictEqual(jogo.duplas[1].pontos, 100);
  game.reiniciarPartida(jogo);
  assert.strictEqual(jogo.fase, 'lobby');
  assert.strictEqual(jogo.rodada, null);
  assert.strictEqual(jogo.rodadasJogadas, 0);
  assert.deepStrictEqual(jogo.duplas, {});
  assert.deepStrictEqual(jogo.musicasUsadas, []);
  // O que NÃO pode se perder: quem está na sala e em que dupla.
  assert.deepStrictEqual(jogo.jogadores.map((j) => j.nome), ['Ana', 'João', 'Bia', 'Leo']);
  assert.deepStrictEqual(jogo.jogadores.map((j) => j.dupla), [1, 1, 2, 2]);
  // E dá para jogar de novo do zero.
  game.iniciarPartida(jogo);
  assert.strictEqual(jogo.fase, 'rodada');
  assert.strictEqual(jogo.duplas[1].pontos, 0);
});
