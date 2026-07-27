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

    ana.emit('iniciarPartida');
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

test('só o líder inicia a partida, remove jogador, reinicia e configura', async () => {
  const { httpServer, url } = await subirServidor();
  const { display, codigo } = await novaSala(url);
  const lider = conectar(url);
  const outro = conectar(url);
  try {
    await emitir(lider, 'entrar', { sala: codigo, nome: 'Ana', dupla: 1 });
    await emitir(outro, 'entrar', { sala: codigo, nome: 'João', dupla: 1 });
    for (const evento of ['iniciarPartida', 'removerJogador', 'reiniciarSala', 'configurarSala']) {
      const erro = esperarErro(outro);
      outro.emit(evento, 1);
      assert.match(await erro, /líder da sala/);
    }
    // O display virou espectador: também não manda mais na sala.
    const erroDisplay = esperarErro(display);
    display.emit('iniciarPartida');
    assert.match(await erroDisplay, /líder da sala/);
  } finally { lider.close(); outro.close(); display.close(); httpServer.close(); }
});

test('o primeiro a entrar é o líder e aparece no estado', async () => {
  const { httpServer, url } = await subirServidor();
  const { display, codigo } = await novaSala(url);
  const ana = conectar(url);
  const joao = conectar(url);
  try {
    const r1 = await emitir(ana, 'entrar', { sala: codigo, nome: 'Ana', dupla: 1 });
    assert.strictEqual(r1.estado.liderNum, 1);
    assert.strictEqual(r1.estado.voce.ehLider, true);
    const r2 = await emitir(joao, 'entrar', { sala: codigo, nome: 'João', dupla: 1 });
    assert.strictEqual(r2.estado.liderNum, 1);
    assert.strictEqual(r2.estado.voce.ehLider, false);
  } finally { ana.close(); joao.close(); display.close(); httpServer.close(); }
});

test('líder que cai é sucedido pelo jogador conectado mais antigo', async () => {
  const { httpServer, url } = await subirServidor({ lobbyLimpezaMs: 60000 });
  const { display, codigo } = await novaSala(url);
  const ana = conectar(url);
  const joao = conectar(url);
  try {
    await emitir(ana, 'entrar', { sala: codigo, nome: 'Ana', dupla: 1 });
    await emitir(joao, 'entrar', { sala: codigo, nome: 'João', dupla: 1 });
    ana.close();
    const e = await esperarEstado(joao, (est) => est.liderNum === 2);
    assert.strictEqual(e.liderNum, 2);
    assert.strictEqual(e.voce.ehLider, true);
  } finally { joao.close(); display.close(); httpServer.close(); }
});

test('o líder não pode se expulsar', async () => {
  const { httpServer, url } = await subirServidor();
  const { display, codigo } = await novaSala(url);
  const ana = conectar(url);
  try {
    const r = await emitir(ana, 'entrar', { sala: codigo, nome: 'Ana', dupla: 1 });
    const erro = esperarErro(ana);
    ana.emit('removerJogador', r.estado.jogadores[0].num);
    assert.match(await erro, /não pode se expulsar/);
  } finally { ana.close(); display.close(); httpServer.close(); }
});

test('configurarSala aplica knobs, satura faixa e sobrevive ao reinício', async () => {
  const { httpServer, url } = await subirServidor();
  const { display, codigo } = await novaSala(url);
  const ana = conectar(url);
  try {
    await emitir(ana, 'entrar', { sala: codigo, nome: 'Ana', dupla: 1 });
    ana.emit('configurarSala', { duracaoSegundos: 30, totalRodadas: 999, maxDuplas: 8, palpitePlateia: false });
    const e = await esperarEstado(display, (est) => est.configSala.duracaoSegundos === 30);
    assert.strictEqual(e.configSala.totalRodadas, 20); // saturado
    assert.strictEqual(e.configSala.maxDuplas, 8);
    assert.strictEqual(e.configSala.palpitePlateia, false);
    assert.strictEqual(e.duracaoSegundos, 30);
    assert.strictEqual(e.totalRodadas, 20);
    ana.emit('reiniciarSala');
    const depois = await esperarEstado(display, (est) => est.jogadores.length === 0);
    assert.strictEqual(depois.configSala.duracaoSegundos, 30); // config persiste
    assert.strictEqual(depois.liderNum, null);
  } finally { ana.close(); display.close(); httpServer.close(); }
});

test('maxDuplas configurado libera a dupla 8', async () => {
  const { httpServer, url } = await subirServidor();
  const { display, codigo } = await novaSala(url);
  const ana = conectar(url);
  const bia = conectar(url);
  try {
    await emitir(ana, 'entrar', { sala: codigo, nome: 'Ana', dupla: 1 });
    const recusada = await emitir(bia, 'entrar', { sala: codigo, nome: 'Bia', dupla: 8 });
    assert.match(recusada.erro, /Dupla inválida/);
    ana.emit('configurarSala', { maxDuplas: 8 });
    await esperarEstado(ana, (est) => est.configSala.maxDuplas === 8);
    const aceita = await emitir(bia, 'entrar', { sala: codigo, nome: 'Bia', dupla: 8 });
    assert.strictEqual(aceita.estado.jogadores.length, 2);
  } finally { ana.close(); bia.close(); display.close(); httpServer.close(); }
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
  const lider = conectar(url);
  const celular = conectar(url);
  try {
    await emitir(lider, 'entrar', { sala: codigo, nome: 'Ana', dupla: 1 });
    const r1 = await emitir(celular, 'entrar', { sala: codigo, nome: 'João', dupla: 1 });
    const avisoRemovido = new Promise((resolve) => celular.on('removido', resolve));
    const alvo = r1.estado.jogadores.find((j) => j.nome === 'João');
    lider.emit('removerJogador', alvo.num);
    const e = await esperarEstado(display, (est) => est.jogadores.length === 1);
    assert.strictEqual(e.jogadores.length, 1);
    await avisoRemovido;
  } finally { lider.close(); celular.close(); display.close(); httpServer.close(); }
});

test('reiniciarSala (dono) zera a partida, mantém o código e desvincula os celulares', async () => {
  const { httpServer, url } = await subirServidor();
  const { display, codigo } = await novaSala(url);
  const celular = conectar(url);
  try {
    await emitir(celular, 'entrar', { sala: codigo, nome: 'Ana', dupla: 1 });
    const avisoRemovido = new Promise((resolve) => celular.on('removido', resolve));
    celular.emit('reiniciarSala');
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
    ana.emit('iniciarPartida');
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

// ---- Monitoramento ----
const { criarRegistrador } = require('../src/eventos');

test('GET /api/monitor exige token', async () => {
  const { httpServer, url } = await subirServidor({ monitorToken: 'segredo' });
  try {
    const sem = await fetch(`${url}/api/monitor`);
    assert.strictEqual(sem.status, 403);
    const errado = await fetch(`${url}/api/monitor?token=xxx`);
    assert.strictEqual(errado.status, 403);
    assert.match((await errado.json()).erro, /Token inválido/);
  } finally { httpServer.close(); }
});

test('GET /api/monitor com token devolve salas e eventos', async () => {
  const { httpServer, url } = await subirServidor({ monitorToken: 'segredo' });
  const { display, codigo } = await novaSala(url);
  const ana = conectar(url);
  try {
    await emitir(ana, 'entrar', { sala: codigo, nome: 'Ana', dupla: 1 });
    const r = await fetch(`${url}/api/monitor?token=segredo`);
    assert.strictEqual(r.status, 200);
    const { salas, eventos } = await r.json();
    const sala = salas.find((s) => s.codigo === codigo);
    assert.ok(sala, 'sala aparece no snapshot');
    assert.strictEqual(sala.fase, 'lobby');
    assert.strictEqual(sala.jogadores.length, 1);
    assert.strictEqual(sala.jogadores[0].nome, 'Ana');
    assert.strictEqual(sala.jogadores[0].conectado, true);
    const tipos = eventos.map((e) => e.tipo);
    assert.ok(tipos.includes('salaCriada'), `faltou salaCriada: ${tipos}`);
    assert.ok(tipos.includes('jogadorEntrou'), `faltou jogadorEntrou: ${tipos}`);
  } finally { ana.close(); display.close(); httpServer.close(); }
});

test('socket monitorar recebe monitorEvento e monitorSalas ao vivo', async () => {
  const { httpServer, url } = await subirServidor({ monitorToken: 'segredo' });
  const { display, codigo } = await novaSala(url);
  const mon = conectar(url);
  const intruso = conectar(url);
  const ana = conectar(url);
  try {
    assert.deepStrictEqual(await emitir(mon, 'monitorar', 'segredo'), { ok: true });
    assert.match((await emitir(intruso, 'monitorar', 'nope')).erro, /Token inválido/);
    const evento = new Promise((res) => mon.on('monitorEvento', (e) => {
      if (e.tipo === 'jogadorEntrou') res(e);
    }));
    const resumo = new Promise((res) => mon.on('monitorSalas', res));
    await emitir(ana, 'entrar', { sala: codigo, nome: 'Ana', dupla: 1 });
    const e = await evento;
    assert.strictEqual(e.sala, codigo);
    assert.strictEqual(e.nome, 'Ana');
    const salas = await resumo;
    assert.ok(salas.find((s) => s.codigo === codigo));
  } finally { mon.close(); intruso.close(); ana.close(); display.close(); httpServer.close(); }
});

test('fluxo de partida registra a sequência de eventos do jogo', async () => {
  const registrador = criarRegistrador();
  const { httpServer, url } = await subirServidor({ registrador, resultadoMs: 30 });
  const { display, codigo } = await novaSala(url);
  const ana = conectar(url);
  const joao = conectar(url);
  try {
    await emitir(ana, 'entrar', { sala: codigo, nome: 'Ana', dupla: 1 });
    await emitir(joao, 'entrar', { sala: codigo, nome: 'João', dupla: 1 });
    ana.emit('iniciarPartida');
    await esperarEstado(ana, (e) => e.fase === 'rodada');
    ana.emit('comecarRodada');
    await esperarEstado(joao, (e) => e.rodada && e.rodada.fase === 'emAndamento');
    joao.emit('comprarDica', 'decada');
    await esperarEstado(joao, (e) => e.voce.dicas && e.voce.dicas.length === 1);
    ana.emit('acertou');
    await esperarEstado(display, (e) => e.rodada && e.rodada.fase === 'resultado');
    const tipos = registrador.recentes().map((e) => e.tipo);
    for (const esperado of ['salaCriada', 'socketConectado', 'jogadorEntrou',
      'partidaIniciada', 'rodadaComecou', 'dicaComprada', 'acertou']) {
      assert.ok(tipos.includes(esperado), `faltou evento ${esperado}: ${tipos}`);
    }
    const dica = registrador.recentes().find((e) => e.tipo === 'dicaComprada');
    assert.strictEqual(dica.dica, 'decada');
    assert.strictEqual(dica.custo, 5);
    const acerto = registrador.recentes().find((e) => e.tipo === 'acertou');
    assert.strictEqual(acerto.pontos, 95);
    assert.strictEqual(acerto.musica, 'Musica Numero 0');
  } finally { ana.close(); joao.close(); display.close(); httpServer.close(); }
});

test('trocar música pelo socket desconta e troca o título do apresentador', async () => {
  const { httpServer, url } = await subirServidor();
  const { display, codigo } = await novaSala(url);
  const ana = conectar(url);
  const joao = conectar(url);
  const bia = conectar(url);
  const leo = conectar(url);
  try {
    await emitir(ana, 'entrar', { sala: codigo, nome: 'Ana', dupla: 1 });
    await emitir(joao, 'entrar', { sala: codigo, nome: 'João', dupla: 1 });
    await emitir(bia, 'entrar', { sala: codigo, nome: 'Bia', dupla: 2 });
    await emitir(leo, 'entrar', { sala: codigo, nome: 'Leo', dupla: 2 });
    ana.emit('iniciarPartida');
    await esperarEstado(ana, (e) => e.fase === 'rodada');
    ana.emit('comecarRodada');
    await esperarEstado(ana, (e) => e.rodada.fase === 'emAndamento');
    ana.emit('trocarMusica');
    const e = await esperarEstado(ana, (est) => est.rodada.valorAtual === 80);
    assert.notStrictEqual(e.voce.musica.titulo, 'Musica Numero 0');
  } finally {
    for (const c of [ana, joao, bia, leo, display]) c.close();
    httpServer.close();
  }
});

test('palpite certo da plateia rouba pontos e anuncia sem o título', async () => {
  const { httpServer, url } = await subirServidor();
  const { display, codigo } = await novaSala(url);
  const ana = conectar(url);
  const joao = conectar(url);
  const bia = conectar(url);
  const leo = conectar(url);
  try {
    await emitir(ana, 'entrar', { sala: codigo, nome: 'Ana', dupla: 1 });
    await emitir(joao, 'entrar', { sala: codigo, nome: 'João', dupla: 1 });
    await emitir(bia, 'entrar', { sala: codigo, nome: 'Bia', dupla: 2 });
    await emitir(leo, 'entrar', { sala: codigo, nome: 'Leo', dupla: 2 });
    ana.emit('iniciarPartida');
    await esperarEstado(ana, (e) => e.fase === 'rodada');
    ana.emit('comecarRodada');
    await esperarEstado(bia, (e) => e.rodada.fase === 'emAndamento');
    // Os dois escutas são armados antes do palpite: o broadcast com o valor já
    // roubado sai junto com o anúncio, e esperar por ele depois perderia a carona.
    const anuncio = new Promise((resolve) => display.once('roubo', resolve));
    const estadoRoubado = esperarEstado(display, (est) => est.rodada.valorAtual === 95);
    bia.emit('palpitar', 'musica numero 0');
    const evento = await anuncio;
    assert.strictEqual(evento.nome, 'Bia');
    assert.strictEqual(evento.valor, 5);
    assert.ok(!('titulo' in evento), 'o anúncio não pode revelar o título');
    const e = await estadoRoubado;
    assert.strictEqual(e.duplas.find((d) => d.numero === 2).pontos, 3);
  } finally {
    for (const c of [ana, joao, bia, leo, display]) c.close();
    httpServer.close();
  }
});

test('palpite em rajada é barrado pelo intervalo mínimo', async () => {
  const configRapido = { ...CONFIG, plateia: { palpite: true, rouboFracao: 0.05, bonusFracao: 0.5, votacao: true, votacaoSegundos: 10, palpiteIntervaloMs: 5000 } };
  const { httpServer } = criarServidor({ config: configRapido, banco: bancoFalso, rng: () => 0 });
  await new Promise((r) => httpServer.listen(0, r));
  const url = `http://localhost:${httpServer.address().port}`;
  const { display, codigo } = await novaSala(url);
  const ana = conectar(url);
  const joao = conectar(url);
  const bia = conectar(url);
  const leo = conectar(url);
  try {
    await emitir(ana, 'entrar', { sala: codigo, nome: 'Ana', dupla: 1 });
    await emitir(joao, 'entrar', { sala: codigo, nome: 'João', dupla: 1 });
    await emitir(bia, 'entrar', { sala: codigo, nome: 'Bia', dupla: 2 });
    await emitir(leo, 'entrar', { sala: codigo, nome: 'Leo', dupla: 2 });
    ana.emit('iniciarPartida');
    await esperarEstado(ana, (e) => e.fase === 'rodada');
    ana.emit('comecarRodada');
    await esperarEstado(bia, (e) => e.rodada.fase === 'emAndamento');
    // O primeiro palpite erra e já devolve um erro; é preciso consumi-lo antes
    // de armar o próximo escuta, senão o teste leria a recusa errada.
    const erroDoPrimeiro = esperarErro(bia);
    bia.emit('palpitar', 'nada a ver');
    assert.match(await erroDoPrimeiro, /Não foi dessa vez/);
    const erro = esperarErro(bia);
    bia.emit('palpitar', 'outra coisa');
    assert.match(await erro, /Espere um pouco/);
  } finally {
    for (const c of [ana, joao, bia, leo, display]) c.close();
    httpServer.close();
  }
});

test('"eu acertei" abre votação, a plateia aprova e o timer pausa', async () => {
  const { httpServer, url } = await subirServidor({ resultadoMs: 30 });
  const { display, codigo } = await novaSala(url);
  const clientes = Array.from({ length: 6 }, () => conectar(url));
  const [ana, joao, bia, leo, carol, gui] = clientes;
  try {
    await emitir(ana, 'entrar', { sala: codigo, nome: 'Ana', dupla: 1 });
    await emitir(joao, 'entrar', { sala: codigo, nome: 'João', dupla: 1 });
    await emitir(bia, 'entrar', { sala: codigo, nome: 'Bia', dupla: 2 });
    await emitir(leo, 'entrar', { sala: codigo, nome: 'Leo', dupla: 2 });
    await emitir(carol, 'entrar', { sala: codigo, nome: 'Carol', dupla: 3 });
    await emitir(gui, 'entrar', { sala: codigo, nome: 'Gui', dupla: 3 });
    ana.emit('iniciarPartida');
    await esperarEstado(ana, (e) => e.fase === 'rodada');
    ana.emit('comecarRodada');
    await esperarEstado(joao, (e) => e.rodada.fase === 'emAndamento');
    joao.emit('euAcertei');
    const emVotacao = await esperarEstado(display, (e) => e.rodada.fase === 'votacao');
    assert.strictEqual(emVotacao.rodada.votacao.origem, 'adivinhador');
    assert.strictEqual(emVotacao.rodada.votacao.eleitores.length, 4);
    bia.emit('votar', true);
    leo.emit('votar', true);
    carol.emit('votar', true);
    const fim = await esperarEstado(display, (e) => e.rodada.fase === 'resultado');
    assert.strictEqual(fim.rodada.pontosGanhos, 100);
  } finally {
    for (const c of clientes) c.close();
    display.close();
    httpServer.close();
  }
});

test('votação reprovada devolve a rodada ao andamento com o tempo de onde parou', async () => {
  const { httpServer, url } = await subirServidor();
  const { display, codigo } = await novaSala(url);
  const clientes = Array.from({ length: 6 }, () => conectar(url));
  const [ana, joao, bia, leo, carol, gui] = clientes;
  try {
    await emitir(ana, 'entrar', { sala: codigo, nome: 'Ana', dupla: 1 });
    await emitir(joao, 'entrar', { sala: codigo, nome: 'João', dupla: 1 });
    await emitir(bia, 'entrar', { sala: codigo, nome: 'Bia', dupla: 2 });
    await emitir(leo, 'entrar', { sala: codigo, nome: 'Leo', dupla: 2 });
    await emitir(carol, 'entrar', { sala: codigo, nome: 'Carol', dupla: 3 });
    await emitir(gui, 'entrar', { sala: codigo, nome: 'Gui', dupla: 3 });
    ana.emit('iniciarPartida');
    await esperarEstado(ana, (e) => e.fase === 'rodada');
    ana.emit('comecarRodada');
    await esperarEstado(joao, (e) => e.rodada.fase === 'emAndamento');
    joao.emit('euAcertei');
    await esperarEstado(display, (e) => e.rodada.fase === 'votacao');
    for (const c of [bia, leo, carol, gui]) c.emit('votar', false);
    const volta = await esperarEstado(display, (e) => e.rodada.fase === 'emAndamento');
    assert.ok(volta.tempoRestante > 0 && volta.tempoRestante <= 90);
  } finally {
    for (const c of clientes) c.close();
    display.close();
    httpServer.close();
  }
});

test('votação aberta por "euAcertei" expira sem quórum: rodada retoma sem resolver duas vezes nem duplicar o timer', async () => {
  const registrador = criarRegistrador();
  const configVotacaoRapida = {
    ...CONFIG,
    plateia: { palpite: true, rouboFracao: 0.05, bonusFracao: 0.5, votacao: true, votacaoSegundos: 1, palpiteIntervaloMs: 2000 },
  };
  const { httpServer } = criarServidor({ config: configVotacaoRapida, banco: bancoFalso, rng: () => 0, registrador });
  await new Promise((r) => httpServer.listen(0, r));
  const url = `http://localhost:${httpServer.address().port}`;
  const { display, codigo } = await novaSala(url);
  const clientes = Array.from({ length: 6 }, () => conectar(url));
  const [ana, joao, bia, leo, carol, gui] = clientes;
  try {
    await emitir(ana, 'entrar', { sala: codigo, nome: 'Ana', dupla: 1 });
    await emitir(joao, 'entrar', { sala: codigo, nome: 'João', dupla: 1 });
    await emitir(bia, 'entrar', { sala: codigo, nome: 'Bia', dupla: 2 });
    await emitir(leo, 'entrar', { sala: codigo, nome: 'Leo', dupla: 2 });
    await emitir(carol, 'entrar', { sala: codigo, nome: 'Carol', dupla: 3 });
    await emitir(gui, 'entrar', { sala: codigo, nome: 'Gui', dupla: 3 });
    ana.emit('iniciarPartida');
    await esperarEstado(ana, (e) => e.fase === 'rodada');
    ana.emit('comecarRodada');
    await esperarEstado(joao, (e) => e.rodada.fase === 'emAndamento');
    joao.emit('euAcertei');
    const emVotacao = await esperarEstado(display, (e) => e.rodada.fase === 'votacao');
    assert.strictEqual(emVotacao.rodada.votacao.origem, 'adivinhador');
    // ninguém vota — o prazo estoura sozinho, sem quórum
    const volta = await esperarEstado(display, (e) => e.rodada.fase === 'emAndamento');
    assert.ok(volta.tempoRestante > 0 && volta.tempoRestante <= 90);
    const ticksDepois = [];
    display.on('tick', (t) => ticksDepois.push(t));
    await new Promise((r) => setTimeout(r, 2200));
    // relógio único: ~2 ticks em 2.2s; o dobro (4+) indicaria timer duplicado
    assert.ok(ticksDepois.length >= 1 && ticksDepois.length <= 3, `ticks inesperados: ${ticksDepois}`);
    const resolucoes = registrador.recentes().filter((e) => e.tipo === 'votacaoResolvida');
    assert.strictEqual(resolucoes.length, 1, 'a votação só pode ser resolvida uma vez');
  } finally {
    for (const c of clientes) c.close();
    display.close();
    httpServer.close();
  }
});

// ---- Sugestões de músicas ----
const fsSug = require('fs');
const osSug = require('os');
const pathSug = require('path');

// appendFile é assíncrono: espera o arquivo aparecer com conteúdo em vez de dormir um tempo fixo
async function esperarArquivoSug(caminho) {
  for (let i = 0; i < 80; i++) {
    try {
      const txt = fsSug.readFileSync(caminho, 'utf8');
      if (txt.trim()) return txt;
    } catch {}
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`arquivo ${caminho} não foi gravado a tempo`);
}

test('POST /api/sugestoes grava JSONL e registra evento', async () => {
  const dir = fsSug.mkdtempSync(pathSug.join(osSug.tmpdir(), 'desafino-sug-'));
  const arquivo = pathSug.join(dir, 'sugestoes.jsonl');
  const registrador = criarRegistrador();
  const { httpServer, url } = await subirServidor({ sugestoesArquivo: arquivo, registrador, monitorToken: 'segredo' });
  try {
    const r = await fetch(`${url}/api/sugestoes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ titulo: 'Evidências', artista: 'Chitãozinho & Xororó', ano: 1990, genero: 'Sertanejo', sala: 'ABCD', sugeridoPor: 'Bia' }),
    });
    assert.strictEqual(r.status, 201);
    const linhas = (await esperarArquivoSug(arquivo)).trim().split('\n');
    assert.strictEqual(linhas.length, 1);
    const s = JSON.parse(linhas[0]);
    assert.strictEqual(s.titulo, 'Evidências');
    assert.strictEqual(s.artista, 'Chitãozinho & Xororó');
    assert.strictEqual(s.ano, 1990);
    assert.strictEqual(s.sala, 'ABCD');
    assert.strictEqual(s.sugeridoPor, 'Bia');
    assert.ok(!Number.isNaN(Date.parse(s.ts)));
    const ev = registrador.recentes().find((e) => e.tipo === 'musicaSugerida');
    assert.ok(ev, 'evento musicaSugerida registrado');
    assert.strictEqual(ev.nome, 'Bia');
    assert.match(ev.musica, /Evidências/);
  } finally { httpServer.close(); }
});

test('POST /api/sugestoes sem título → 400', async () => {
  const { httpServer, url } = await subirServidor();
  try {
    const r = await fetch(`${url}/api/sugestoes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ artista: 'Alguém' }),
    });
    assert.strictEqual(r.status, 400);
    assert.match((await r.json()).erro, /título/);
  } finally { httpServer.close(); }
});

test('GET /api/sugestoes exige token e devolve a lista', async () => {
  const dir = fsSug.mkdtempSync(pathSug.join(osSug.tmpdir(), 'desafino-sug-'));
  const arquivo = pathSug.join(dir, 'sugestoes.jsonl');
  const { httpServer, url } = await subirServidor({ sugestoesArquivo: arquivo, monitorToken: 'segredo' });
  try {
    await fetch(`${url}/api/sugestoes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ titulo: 'Aquarela' }),
    });
    await esperarArquivoSug(arquivo);
    assert.strictEqual((await fetch(`${url}/api/sugestoes`)).status, 403);
    const r = await fetch(`${url}/api/sugestoes?token=segredo`);
    assert.strictEqual(r.status, 200);
    const lista = await r.json();
    assert.strictEqual(lista.length, 1);
    assert.strictEqual(lista[0].titulo, 'Aquarela');
  } finally { httpServer.close(); }
});

test('trocar de sala solta a anterior: nada da sala velha chega mais', async () => {
  const { httpServer, url } = await subirServidor();
  const salaA = await novaSala(url);
  const salaB = await novaSala(url);
  const celular = conectar(url);
  const outro = conectar(url);
  try {
    await emitir(celular, 'entrar', { sala: salaA.codigo, nome: 'Ana', dupla: 1 });
    await emitir(celular, 'entrar', { sala: salaB.codigo, nome: 'Ana', dupla: 1 });
    const recebidos = [];
    celular.on('estado', (e) => recebidos.push(e.codigo));
    // Provoca broadcast só na sala A; o celular não deveria ouvir nada dela.
    await emitir(outro, 'entrar', { sala: salaA.codigo, nome: 'Zé', dupla: 2 });
    await new Promise((r) => setTimeout(r, 120));
    assert.deepStrictEqual(recebidos.filter((c) => c === salaA.codigo), [],
      'o celular continuou recebendo estado da sala que abandonou');
  } finally {
    celular.close(); outro.close();
    salaA.display.close(); salaB.display.close();
    httpServer.close();
  }
});

test('quem sai da sala deixa de contar como conectado e passa a liderança', async () => {
  const { httpServer, url } = await subirServidor();
  const salaA = await novaSala(url);
  const salaB = await novaSala(url);
  const lider = conectar(url);
  const segundo = conectar(url);
  try {
    await emitir(lider, 'entrar', { sala: salaA.codigo, nome: 'Ana', dupla: 1 });
    const r = await emitir(segundo, 'entrar', { sala: salaA.codigo, nome: 'João', dupla: 1 });
    assert.strictEqual(r.estado.liderNum, 1); // Ana lidera a sala A
    lider.emit('entrar', { sala: salaB.codigo, nome: 'Ana', dupla: 1 });
    const e = await esperarEstado(segundo, (est) => est.liderNum === 2);
    assert.strictEqual(e.liderNum, 2); // João assumiu ao ver Ana sair
    assert.strictEqual(e.jogadores.find((j) => j.num === 1).conectado, false);
  } finally {
    lider.close(); segundo.close();
    salaA.display.close(); salaB.display.close();
    httpServer.close();
  }
});

test('reiniciarPartida (líder) volta ao lobby sem desvincular os celulares', async () => {
  const { httpServer, url } = await subirServidor({ resultadoMs: 30 });
  const { display, codigo } = await novaSala(url);
  const ana = conectar(url);
  const joao = conectar(url);
  try {
    await emitir(ana, 'entrar', { sala: codigo, nome: 'Ana', dupla: 1 });
    await emitir(joao, 'entrar', { sala: codigo, nome: 'João', dupla: 1 });
    ana.emit('iniciarPartida');
    await esperarEstado(ana, (e) => e.fase === 'rodada');
    ana.emit('comecarRodada');
    await esperarEstado(joao, (e) => e.rodada.fase === 'emAndamento');
    ana.emit('acertou');
    await esperarEstado(display, (e) => e.rodada && e.rodada.fase === 'resultado');

    ana.emit('reiniciarPartida');
    const e = await esperarEstado(display, (est) => est.fase === 'lobby');
    assert.strictEqual(e.jogadores.length, 2, 'os jogadores continuam na sala');
    assert.strictEqual(e.liderNum, 1, 'a liderança não muda');
    assert.strictEqual(e.rodada, null, 'a rodada sumiu');
    assert.deepStrictEqual(e.duplas, [], 'o placar zerou');
    // E o celular segue vinculado: não recebeu 'removido'.
    const aindaDentro = await esperarEstado(ana, (est) => est.fase === 'lobby');
    assert.strictEqual(aindaDentro.voce.num, 1);
  } finally { ana.close(); joao.close(); display.close(); httpServer.close(); }
});

test('só o líder reinicia a partida', async () => {
  const { httpServer, url } = await subirServidor();
  const { display, codigo } = await novaSala(url);
  const lider = conectar(url);
  const outro = conectar(url);
  try {
    await emitir(lider, 'entrar', { sala: codigo, nome: 'Ana', dupla: 1 });
    await emitir(outro, 'entrar', { sala: codigo, nome: 'João', dupla: 1 });
    const erro = esperarErro(outro);
    outro.emit('reiniciarPartida');
    assert.match(await erro, /líder da sala/);
  } finally { lider.close(); outro.close(); display.close(); httpServer.close(); }
});

test('configurarSala vale no fim de jogo, mas não no meio da rodada', async () => {
  // Uma rodada só: passar já leva a partida ao fim, sem laço nenhum.
  const config = { ...CONFIG, rodada: { duracaoSegundos: 90, totalRodadas: 1 } };
  const { httpServer } = criarServidor({ config, banco: bancoFalso, rng: () => 0, resultadoMs: 20 });
  await new Promise((r) => httpServer.listen(0, r));
  const url = `http://localhost:${httpServer.address().port}`;
  const { display, codigo } = await novaSala(url);
  const ana = conectar(url);
  const joao = conectar(url);
  try {
    await emitir(ana, 'entrar', { sala: codigo, nome: 'Ana', dupla: 1 });
    await emitir(joao, 'entrar', { sala: codigo, nome: 'João', dupla: 1 });
    ana.emit('iniciarPartida');
    await esperarEstado(ana, (e) => e.fase === 'rodada');
    ana.emit('comecarRodada');
    await esperarEstado(joao, (e) => e.rodada.fase === 'emAndamento');

    const erro = esperarErro(ana);
    ana.emit('configurarSala', { duracaoSegundos: 30 });
    assert.match(await erro, /no meio da rodada/);

    ana.emit('passar');
    await esperarEstado(display, (e) => e.fase === 'fim');

    ana.emit('configurarSala', { duracaoSegundos: 45 });
    const e = await esperarEstado(display, (est) => est.configSala.duracaoSegundos === 45);
    assert.strictEqual(e.configSala.duracaoSegundos, 45);
  } finally { ana.close(); joao.close(); display.close(); httpServer.close(); }
});
