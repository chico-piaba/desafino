'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { io: conectar } = require('socket.io-client');
const { criarServidor } = require('../src/server');

const CONFIG = {
  rodada: { duracaoSegundos: 90, totalRodadas: 8 },
  modos: { cantarolar: 100, mimica: 70 },
  dicas: { cantor: 10, ano: 10, quantidadePalavras: 25 },
};
const MUSICAS = Array.from({ length: 10 }, (_, i) => ({
  id: `m${i}`, titulo: `Musica Numero ${i}`, artista: `Artista ${i}`, ano: 1990 + i,
}));
const bancoFalso = { ler: () => MUSICAS };

function esperarEstado(socket, predicado) {
  return new Promise((resolve) => {
    const handler = (estado) => {
      if (predicado(estado)) { socket.off('estado', handler); resolve(estado); }
    };
    socket.on('estado', handler);
  });
}

function emitir(socket, evento, ...args) {
  return new Promise((resolve) => socket.emit(evento, ...args, resolve));
}

test('uma rodada completa via sockets', async () => {
  const { httpServer } = criarServidor({ config: CONFIG, banco: bancoFalso, rng: () => 0, resultadoMs: 30 });
  await new Promise((r) => httpServer.listen(0, r));
  const porta = httpServer.address().port;
  const url = `http://localhost:${porta}`;
  const clientes = Array.from({ length: 4 }, () => conectar(url));
  const [ana, joao, bia, leo] = clientes;

  try {
    const r1 = await emitir(ana, 'entrar', { nome: 'Ana', dupla: 1 });
    assert.ok(r1.playerId);
    await emitir(joao, 'entrar', { nome: 'João', dupla: 1 });
    await emitir(bia, 'entrar', { nome: 'Bia', dupla: 2 });
    await emitir(leo, 'entrar', { nome: 'Leo', dupla: 2 });

    ana.emit('iniciarPartida');
    const e1 = await esperarEstado(ana, (e) => e.fase === 'rodada');
    assert.strictEqual(e1.voce.papel, 'apresentador');
    assert.strictEqual(e1.voce.musica.titulo, 'Musica Numero 0');

    ana.emit('comecarRodada');
    await esperarEstado(joao, (e) => e.rodada && e.rodada.fase === 'emAndamento');

    joao.emit('comprarDica', 'cantor');
    const e2 = await esperarEstado(joao, (e) => e.voce.dicas && e.voce.dicas.length === 1);
    assert.strictEqual(e2.voce.dicas[0].conteudo, 'Artista 0');
    assert.strictEqual(e2.rodada.valorAtual, 90);

    ana.emit('acertou');
    const e3 = await esperarEstado(bia, (e) => e.rodada && e.rodada.fase === 'resultado');
    assert.strictEqual(e3.rodada.pontosGanhos, 90);
    assert.strictEqual(e3.rodada.musica.titulo, 'Musica Numero 0'); // revelada no resultado
    assert.strictEqual(e3.duplas.find((d) => d.numero === 1).pontos, 90);

    // após resultadoMs, avança sozinho para a rodada 2 (dupla 2 apresenta)
    const e4 = await esperarEstado(bia, (e) => e.rodada && e.rodada.numero === 2);
    assert.strictEqual(e4.voce.papel, 'apresentador');
  } finally {
    for (const c of clientes) c.close();
    httpServer.close();
  }
});

test('reconexão pelo playerId reassume a vaga', async () => {
  const { httpServer } = criarServidor({ config: CONFIG, banco: bancoFalso, rng: () => 0 });
  await new Promise((r) => httpServer.listen(0, r));
  const url = `http://localhost:${httpServer.address().port}`;
  const c1 = conectar(url);
  try {
    const { playerId } = await emitir(c1, 'entrar', { nome: 'Ana', dupla: 1 });
    c1.close();
    const c2 = conectar(url);
    try {
      const r = await emitir(c2, 'entrar', { playerId });
      assert.strictEqual(r.playerId, playerId);
      assert.strictEqual(r.estado.jogadores.length, 1);
      assert.strictEqual(r.estado.jogadores[0].conectado, true);
    } finally { c2.close(); }
  } finally { httpServer.close(); }
});

test('entrar com playerId existente reconecta em vez de duplicar', async () => {
  const { httpServer } = criarServidor({ config: CONFIG, banco: bancoFalso, rng: () => 0 });
  await new Promise((r) => httpServer.listen(0, r));
  const url = `http://localhost:${httpServer.address().port}`;
  const c1 = conectar(url);
  try {
    const r1 = await emitir(c1, 'entrar', { nome: 'Ana', dupla: 1 });
    const r2 = await emitir(c1, 'entrar', { nome: 'Ana de novo', dupla: 2, playerId: r1.playerId });
    assert.strictEqual(r2.playerId, r1.playerId);
    assert.strictEqual(r2.estado.jogadores.length, 1);
    assert.strictEqual(r2.estado.jogadores[0].nome, 'Ana');
  } finally { c1.close(); httpServer.close(); }
});

test('desconectado no lobby é removido após o prazo de limpeza', async () => {
  const { httpServer } = criarServidor({ config: CONFIG, banco: bancoFalso, rng: () => 0, lobbyLimpezaMs: 60 });
  await new Promise((r) => httpServer.listen(0, r));
  const url = `http://localhost:${httpServer.address().port}`;
  const c1 = conectar(url);
  const c2 = conectar(url);
  try {
    await emitir(c1, 'entrar', { nome: 'Ana', dupla: 1 });
    await emitir(c2, 'entrar', { nome: 'João', dupla: 1 });
    c1.close();
    const e = await esperarEstado(c2, (est) => est.jogadores.length === 1);
    assert.strictEqual(e.jogadores[0].nome, 'João');
  } finally { c2.close(); httpServer.close(); }
});

test('removerJogador via socket tira o jogador e avisa o removido', async () => {
  const { httpServer } = criarServidor({ config: CONFIG, banco: bancoFalso, rng: () => 0 });
  await new Promise((r) => httpServer.listen(0, r));
  const url = `http://localhost:${httpServer.address().port}`;
  const celular = conectar(url);
  const display = conectar(url);
  try {
    const r1 = await emitir(celular, 'entrar', { nome: 'Ana', dupla: 1 });
    const avisoRemovido = new Promise((resolve) => celular.on('removido', resolve));
    display.emit('removerJogador', r1.estado.jogadores[0].num);
    const e = await esperarEstado(display, (est) => est.jogadores.length === 0);
    assert.strictEqual(e.jogadores.length, 0);
    await avisoRemovido;
  } finally { celular.close(); display.close(); httpServer.close(); }
});

test('reiniciarSala zera a partida e desvincula os celulares', async () => {
  const { httpServer } = criarServidor({ config: CONFIG, banco: bancoFalso, rng: () => 0 });
  await new Promise((r) => httpServer.listen(0, r));
  const url = `http://localhost:${httpServer.address().port}`;
  const celular = conectar(url);
  const display = conectar(url);
  try {
    await emitir(celular, 'entrar', { nome: 'Ana', dupla: 1 });
    const avisoRemovido = new Promise((resolve) => celular.on('removido', resolve));
    display.emit('reiniciarSala');
    const e = await esperarEstado(display, (est) => est.jogadores.length === 0 && est.fase === 'lobby');
    assert.strictEqual(e.jogadores.length, 0);
    await avisoRemovido;
  } finally { celular.close(); display.close(); httpServer.close(); }
});
