'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { io: conectar } = require('socket.io-client');
const { criarServidor } = require('../src/server');

const CONFIG = {
  rodada: { duracaoSegundos: 90, totalRodadas: 8 },
  modos: { cantarolar: 100, mimica: 70 },
  x1: { bonusApresentador: 0.5 },
  dicas: { cantor: 10, ano: 10, decada: 5, genero: 10, inicialDoTitulo: 15, forca: 25 },
};
const MUSICAS = Array.from({ length: 10 }, (_, i) => ({
  id: `m${i}`, titulo: `Musica Numero ${i}`, artista: `Artista ${i}`, ano: 1990 + i, genero: 'MPB',
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

function esperarErro(socket) {
  return new Promise((resolve) => socket.once('erro', resolve));
}

async function subirServidor(opcoes = {}) {
  const { httpServer } = criarServidor({ config: CONFIG, banco: bancoFalso, rng: () => 0, ...opcoes });
  await new Promise((r) => httpServer.listen(0, r));
  return { httpServer, url: `http://localhost:${httpServer.address().port}` };
}

async function novaSala(url, donoToken) {
  const display = conectar(url);
  const r = await emitir(display, 'criarSala', { donoToken });
  return { display, codigo: r.codigo, donoToken: r.donoToken, estado: r.estado };
}

test('uma rodada completa via sockets, com sala', async () => {
  const { httpServer, url } = await subirServidor({ resultadoMs: 30 });
  const { display, codigo } = await novaSala(url);
  const clientes = Array.from({ length: 4 }, () => conectar(url));
  const [ana, joao, bia, leo] = clientes;

  try {
    const r1 = await emitir(ana, 'entrar', { sala: codigo, nome: 'Ana', dupla: 1 });
    assert.ok(r1.playerId);
    assert.strictEqual(r1.sala, codigo);
    await emitir(joao, 'entrar', { sala: codigo, nome: 'João', dupla: 1 });
    await emitir(bia, 'entrar', { sala: codigo, nome: 'Bia', dupla: 2 });
    await emitir(leo, 'entrar', { sala: codigo, nome: 'Leo', dupla: 2 });

    display.emit('iniciarPartida');
    const e1 = await esperarEstado(ana, (e) => e.fase === 'rodada');
    assert.strictEqual(e1.codigo, codigo);
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
    assert.strictEqual(e3.rodada.musica.titulo, 'Musica Numero 0');
    assert.strictEqual(e3.duplas.find((d) => d.numero === 1).pontos, 90);

    const e4 = await esperarEstado(bia, (e) => e.rodada && e.rodada.numero === 2);
    assert.strictEqual(e4.voce.papel, 'apresentador');
  } finally {
    display.close();
    for (const c of clientes) c.close();
    httpServer.close();
  }
});

test('entrar exige sala existente', async () => {
  const { httpServer, url } = await subirServidor();
  const c1 = conectar(url);
  try {
    const r = await emitir(c1, 'entrar', { sala: 'ZZZZ', nome: 'Ana', dupla: 1 });
    assert.match(r.erro, /Sala não encontrada/);
  } finally { c1.close(); httpServer.close(); }
});

test('duas salas são isoladas', async () => {
  const { httpServer, url } = await subirServidor();
  const salaA = await novaSala(url);
  const salaB = await novaSala(url);
  const c1 = conectar(url);
  const c2 = conectar(url);
  try {
    assert.notStrictEqual(salaA.codigo, salaB.codigo);
    const rA = await emitir(c1, 'entrar', { sala: salaA.codigo, nome: 'Ana', dupla: 1 });
    const rB = await emitir(c2, 'entrar', { sala: salaB.codigo, nome: 'Zoe', dupla: 1 });
    assert.strictEqual(rB.estado.jogadores.length, 1);
    assert.strictEqual(rB.estado.jogadores[0].nome, 'Zoe'); // Ana não vazou para B
    // Snapshot fresco da sala A depois da entrada em B: Zoe não vazou para A
    const rA2 = await emitir(c1, 'entrar', { sala: salaA.codigo, playerId: rA.playerId });
    assert.strictEqual(rA2.estado.jogadores.length, 1);
    assert.strictEqual(rA2.estado.jogadores[0].nome, 'Ana');
    assert.strictEqual(rA2.estado.codigo, salaA.codigo);
  } finally { c1.close(); c2.close(); salaA.display.close(); salaB.display.close(); httpServer.close(); }
});

test('só o dono inicia a partida, remove jogador e reinicia a sala', async () => {
  const { httpServer, url } = await subirServidor();
  const { display, codigo } = await novaSala(url);
  const c1 = conectar(url);
  try {
    await emitir(c1, 'entrar', { sala: codigo, nome: 'Ana', dupla: 1 });
    for (const evento of ['iniciarPartida', 'removerJogador', 'reiniciarSala']) {
      const erro = esperarErro(c1);
      c1.emit(evento, 1);
      assert.match(await erro, /dono da sala/);
    }
  } finally { c1.close(); display.close(); httpServer.close(); }
});

test('display reassume a mesma sala pelo donoToken', async () => {
  const { httpServer, url } = await subirServidor();
  const primeira = await novaSala(url);
  try {
    primeira.display.close();
    const segunda = await novaSala(url, primeira.donoToken);
    assert.strictEqual(segunda.codigo, primeira.codigo);
    segunda.display.close();
  } finally { httpServer.close(); }
});

test('sala vazia expira após salaExpiraMs', async () => {
  const { httpServer, url } = await subirServidor({ salaExpiraMs: 60 });
  const { display, codigo } = await novaSala(url);
  display.close();
  await new Promise((r) => setTimeout(r, 180));
  const c1 = conectar(url);
  try {
    const r = await emitir(c1, 'entrar', { sala: codigo, nome: 'Ana', dupla: 1 });
    assert.match(r.erro, /Sala não encontrada/);
  } finally { c1.close(); httpServer.close(); }
});

test('evento de jogo sem sala dá erro claro', async () => {
  const { httpServer, url } = await subirServidor();
  const c1 = conectar(url);
  try {
    await new Promise((r) => c1.on('connect', r));
    const erro = esperarErro(c1);
    c1.emit('comecarRodada');
    assert.match(await erro, /não está numa sala/);
  } finally { c1.close(); httpServer.close(); }
});

test('reconexão pelo playerId reassume a vaga na sala', async () => {
  const { httpServer, url } = await subirServidor();
  const { display, codigo } = await novaSala(url);
  const c1 = conectar(url);
  try {
    const { playerId } = await emitir(c1, 'entrar', { sala: codigo, nome: 'Ana', dupla: 1 });
    c1.close();
    const c2 = conectar(url);
    try {
      const r = await emitir(c2, 'entrar', { sala: codigo, playerId });
      assert.strictEqual(r.playerId, playerId);
      assert.strictEqual(r.estado.jogadores.length, 1);
      assert.strictEqual(r.estado.jogadores[0].conectado, true);
    } finally { c2.close(); }
  } finally { display.close(); httpServer.close(); }
});

test('entrar com playerId existente reconecta em vez de duplicar', async () => {
  const { httpServer, url } = await subirServidor();
  const { display, codigo } = await novaSala(url);
  const c1 = conectar(url);
  try {
    const r1 = await emitir(c1, 'entrar', { sala: codigo, nome: 'Ana', dupla: 1 });
    const r2 = await emitir(c1, 'entrar', { sala: codigo, nome: 'Ana de novo', dupla: 2, playerId: r1.playerId });
    assert.strictEqual(r2.playerId, r1.playerId);
    assert.strictEqual(r2.estado.jogadores.length, 1);
    assert.strictEqual(r2.estado.jogadores[0].nome, 'Ana');
  } finally { c1.close(); display.close(); httpServer.close(); }
});

test('desconectado no lobby é removido após o prazo de limpeza', async () => {
  const { httpServer, url } = await subirServidor({ lobbyLimpezaMs: 60 });
  const { display, codigo } = await novaSala(url);
  const c1 = conectar(url);
  const c2 = conectar(url);
  try {
    await emitir(c1, 'entrar', { sala: codigo, nome: 'Ana', dupla: 1 });
    await emitir(c2, 'entrar', { sala: codigo, nome: 'João', dupla: 1 });
    c1.close();
    const e = await esperarEstado(c2, (est) => est.jogadores.length === 1);
    assert.strictEqual(e.jogadores[0].nome, 'João');
  } finally { c2.close(); display.close(); httpServer.close(); }
});

test('removerJogador (dono) tira o jogador e avisa o removido', async () => {
  const { httpServer, url } = await subirServidor();
  const { display, codigo } = await novaSala(url);
  const celular = conectar(url);
  try {
    const r1 = await emitir(celular, 'entrar', { sala: codigo, nome: 'Ana', dupla: 1 });
    const avisoRemovido = new Promise((resolve) => celular.on('removido', resolve));
    display.emit('removerJogador', r1.estado.jogadores[0].num);
    const e = await esperarEstado(display, (est) => est.jogadores.length === 0);
    assert.strictEqual(e.jogadores.length, 0);
    await avisoRemovido;
  } finally { celular.close(); display.close(); httpServer.close(); }
});

test('reiniciarSala (dono) zera a partida, mantém o código e desvincula os celulares', async () => {
  const { httpServer, url } = await subirServidor();
  const { display, codigo } = await novaSala(url);
  const celular = conectar(url);
  try {
    await emitir(celular, 'entrar', { sala: codigo, nome: 'Ana', dupla: 1 });
    const avisoRemovido = new Promise((resolve) => celular.on('removido', resolve));
    display.emit('reiniciarSala');
    const e = await esperarEstado(display, (est) => est.jogadores.length === 0 && est.fase === 'lobby');
    assert.strictEqual(e.codigo, codigo);
    await avisoRemovido;
  } finally { celular.close(); display.close(); httpServer.close(); }
});

test('/api/entrada monta a URL conforme o Host da requisição (proxy/Funnel)', async () => {
  const http = require('node:http');
  const { httpServer, url } = await subirServidor();
  const porta = httpServer.address().port;
  const pedir = (headers) => new Promise((resolve, reject) => {
    http.get({ host: 'localhost', port: porta, path: '/api/entrada?sala=ABCD', headers }, (res) => {
      let corpo = '';
      res.on('data', (c) => { corpo += c; });
      res.on('end', () => resolve(JSON.parse(corpo)));
    }).on('error', reject);
  });
  try {
    const publico = await pedir({ Host: 'desafino.exemplo.ts.net', 'X-Forwarded-Proto': 'https' });
    assert.strictEqual(publico.url, 'https://desafino.exemplo.ts.net/jogar/?sala=ABCD');
    const local = await pedir({ Host: `localhost:${porta}` });
    assert.match(local.url, /^http:\/\/[\d.]+:\d+\/jogar\/\?sala=ABCD$/); // IP da LAN
  } finally { httpServer.close(); }
});

test('avatar circula saneado no estado e emote chega à sala inteira', async () => {
  const { httpServer, url } = await subirServidor();
  const { display, codigo } = await novaSala(url);
  const celular = conectar(url);
  try {
    const r = await emitir(celular, 'entrar', {
      sala: codigo, nome: 'Ana', dupla: 1,
      avatar: { fundo: 2, rosto: 1, olhos: 3, boca: 4, acessorio: 5, extra: 'lixo' },
    });
    assert.deepStrictEqual(r.estado.jogadores[0].avatar, { fundo: 2, rosto: 1, olhos: 3, boca: 4, acessorio: 5 });
    const chegada = new Promise((resolve) => display.on('emote', resolve));
    celular.emit('emote', '🔥');
    assert.deepStrictEqual(await chegada, { num: 1, tipo: '🔥' });
  } finally { celular.close(); display.close(); httpServer.close(); }
});

test('duelo x1 via sockets: 2 jogadores, placar individual', async () => {
  const { httpServer, url } = await subirServidor();
  const { display, codigo } = await novaSala(url);
  const ana = conectar(url);
  const joao = conectar(url);
  try {
    await emitir(ana, 'entrar', { sala: codigo, nome: 'Ana', dupla: 1 });
    await emitir(joao, 'entrar', { sala: codigo, nome: 'João', dupla: 1 });
    display.emit('iniciarPartida');
    const e1 = await esperarEstado(ana, (e) => e.fase === 'rodada');
    assert.strictEqual(e1.modoJogo, 'x1');
    assert.strictEqual(e1.voce.papel, 'apresentador');
    ana.emit('comecarRodada');
    await esperarEstado(joao, (e) => e.rodada && e.rodada.fase === 'emAndamento');
    ana.emit('acertou');
    const e2 = await esperarEstado(display, (e) => e.rodada && e.rodada.fase === 'resultado');
    assert.strictEqual(e2.rodada.pontosGanhos, 100);
    assert.strictEqual(e2.rodada.bonusApresentador, 50);
    assert.deepStrictEqual(e2.pontosJogadores, { 1: 50, 2: 100 });
  } finally { ana.close(); joao.close(); display.close(); httpServer.close(); }
});
