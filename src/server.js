'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const QRCode = require('qrcode');
const game = require('./game');
const { criarBanco } = require('./bancoMusicas');
const wikipedia = require('./wikipedia');

function localIp() {
  for (const infos of Object.values(os.networkInterfaces())) {
    for (const i of infos || []) {
      if (i.family === 'IPv4' && !i.internal) return i.address;
    }
  }
  return 'localhost';
}

function criarServidor({ config, banco, rng = Math.random, resultadoMs = 6000 }) {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'public')));
  const httpServer = http.createServer(app);
  const io = new Server(httpServer);

  let jogo = game.criarJogo(config, banco.ler(), rng);
  const conectados = new Map(); // playerId -> socket.id
  let timer = null;
  let tempoRestante = null;
  let timeoutProxima = null;

  app.get('/api/entrada', async (req, res) => {
    const url = `http://${localIp()}:${req.socket.localPort}/jogar/`;
    res.json({ url, qr: await QRCode.toDataURL(url, { margin: 1, width: 280 }) });
  });

  app.get('/api/musicas', (req, res) => res.json(banco.ler()));

  app.post('/api/musicas', (req, res) => {
    try {
      res.status(201).json(banco.adicionar(req.body));
    } catch (e) {
      res.status(400).json({ erro: e.message });
    }
  });

  app.delete('/api/musicas/:id', (req, res) => {
    banco.remover(req.params.id);
    res.status(204).end();
  });

  app.get('/api/wikipedia', async (req, res) => {
    try {
      res.json(await wikipedia.buscar(String(req.query.q || '')));
    } catch (e) {
      res.status(502).json({ erro: `Busca indisponível: ${e.message}` });
    }
  });

  function nomeDe(id) {
    const j = jogo.jogadores.find((j) => j.id === id);
    return j ? j.nome : '?';
  }

  function estadoPublico() {
    const r = jogo.rodada;
    return {
      fase: jogo.fase,
      aviso: jogo.aviso,
      totalRodadas: config.rodada.totalRodadas,
      duracaoSegundos: config.rodada.duracaoSegundos,
      tempoRestante,
      jogadores: jogo.jogadores.map((j) => ({
        nome: j.nome, dupla: j.dupla, conectado: conectados.has(j.id),
      })),
      duplas: Object.values(jogo.duplas),
      rodada: r && {
        numero: r.numero,
        fase: r.fase,
        dupla: r.dupla,
        modo: r.modo,
        apresentador: nomeDe(r.apresentadorId),
        adivinhador: nomeDe(r.adivinhadorId),
        valorAtual: game.valorAtual(jogo),
        dicasCompradas: r.dicasCompradas.map((d) => ({ tipo: d.tipo, custo: d.custo })),
        pontosGanhos: r.pontosGanhos,
        musica: r.fase === 'resultado' ? r.musica : null,
      },
    };
  }

  function estadoPrivado(playerId) {
    const r = jogo.rodada;
    if (!r) return null;
    if (playerId === r.apresentadorId) return { papel: 'apresentador', musica: r.musica };
    if (playerId === r.adivinhadorId) {
      return { papel: 'adivinhador', dicas: r.dicasCompradas, precos: config.dicas };
    }
    return { papel: 'plateia' };
  }

  function broadcast() {
    const publico = estadoPublico();
    for (const [, socket] of io.of('/').sockets) {
      const pid = socket.data.playerId;
      socket.emit('estado', { ...publico, voce: pid ? estadoPrivado(pid) : null });
    }
  }

  function pararTimer() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  function pararProxima() {
    if (timeoutProxima) clearTimeout(timeoutProxima);
    timeoutProxima = null;
  }

  function iniciarTimer() {
    tempoRestante = config.rodada.duracaoSegundos;
    io.emit('tick', tempoRestante);
    timer = setInterval(() => {
      tempoRestante -= 1;
      io.emit('tick', tempoRestante);
      if (tempoRestante <= 0) {
        pararTimer();
        game.tempoEsgotado(jogo);
        agendarProxima();
        broadcast();
      }
    }, 1000);
    timer.unref();
  }

  function agendarProxima() {
    pararProxima();
    timeoutProxima = setTimeout(() => {
      timeoutProxima = null;
      if (jogo.fase !== 'rodada' || !jogo.rodada || jogo.rodada.fase !== 'resultado') return;
      game.proximaRodada(jogo);
      tempoRestante = null;
      broadcast();
    }, resultadoMs);
    timeoutProxima.unref();
  }

  io.on('connection', (socket) => {
    const guardar = (acao) => {
      try { acao(); broadcast(); } catch (e) { socket.emit('erro', e.message); }
    };
    const pid = () => socket.data.playerId;

    socket.on('entrar', (dados, cb = () => {}) => {
      try {
        const existente = dados.playerId && jogo.jogadores.find((j) => j.id === dados.playerId);
        if (existente) {
          socket.data.playerId = existente.id;
        } else {
          const jogador = game.entrarJogador(jogo, dados.nome, Number(dados.dupla));
          socket.data.playerId = jogador.id;
        }
        conectados.set(socket.data.playerId, socket.id);
        // O snapshot inicial vai direto no payload do ack: o cliente recebe seu
        // estado de forma atômica, sem depender de registrar o listener de
        // 'estado' antes que o broadcast() a seguir seja emitido.
        cb({ playerId: socket.data.playerId, estado: { ...estadoPublico(), voce: estadoPrivado(socket.data.playerId) } });
        broadcast();
      } catch (e) {
        cb({ erro: e.message });
      }
    });

    socket.on('iniciarPartida', () => guardar(() => game.iniciarPartida(jogo)));
    socket.on('comecarRodada', () => guardar(() => {
      const r = jogo.rodada;
      if (r && !conectados.has(r.adivinhadorId)) {
        throw new Error('O adivinhador está desconectado — aguarde a reconexão');
      }
      game.comecarRodada(jogo, pid());
      iniciarTimer();
    }));
    socket.on('mudarParaMimica', () => guardar(() => game.mudarParaMimica(jogo, pid())));
    socket.on('comprarDica', (tipo) => guardar(() => game.comprarDica(jogo, pid(), tipo)));
    socket.on('acertou', () => guardar(() => {
      game.acertou(jogo, pid());
      pararTimer();
      agendarProxima();
    }));
    socket.on('passar', () => guardar(() => {
      game.passar(jogo, pid());
      pararTimer();
      agendarProxima();
    }));

    socket.on('disconnect', () => {
      if (pid() && conectados.get(pid()) === socket.id) conectados.delete(pid());
      broadcast();
    });

    socket.emit('estado', { ...estadoPublico(), voce: null });
  });

  httpServer.on('close', () => {
    pararTimer();
    pararProxima();
  });

  return { app, httpServer, io };
}

if (require.main === module) {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config.json'), 'utf8'));
  const banco = criarBanco(path.join(__dirname, '..', 'data', 'musicas.json'));
  const { httpServer } = criarServidor({ config, banco });
  const porta = process.env.PORT || 3000;
  httpServer.listen(porta, () => {
    console.log('DESAFINO no ar!');
    console.log(`  Display:  http://localhost:${porta}/display/`);
    console.log(`  Celular:  http://${localIp()}:${porta}/jogar/`);
    console.log(`  Admin:    http://localhost:${porta}/admin/`);
  });
}

module.exports = { criarServidor, localIp };
