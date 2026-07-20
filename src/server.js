'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const { Server } = require('socket.io');
const QRCode = require('qrcode');
const game = require('./game');
const { criarBanco } = require('./bancoMusicas');
const itunes = require('./itunes');

function localIp() {
  for (const infos of Object.values(os.networkInterfaces())) {
    for (const i of infos || []) {
      if (i.family === 'IPv4' && !i.internal) return i.address;
    }
  }
  return 'localhost';
}

// Sem I e O, que confundem com 1 e 0 na hora de digitar o código.
const ALFABETO_CODIGO = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

function criarServidor({
  config,
  banco,
  rng = Math.random,
  resultadoMs = 6000,
  lobbyLimpezaMs = 30000,
  salaExpiraMs = 3600000,
}) {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'public')));
  const httpServer = http.createServer(app);
  const io = new Server(httpServer);

  const salas = new Map(); // codigo -> sala

  function gerarCodigo() {
    // Aleatoriedade própria: o rng injetado é determinístico nos testes e
    // geraria sempre o mesmo código (loop infinito na segunda sala).
    let codigo;
    do {
      codigo = Array.from(
        { length: 4 },
        () => ALFABETO_CODIGO[crypto.randomInt(ALFABETO_CODIGO.length)]
      ).join('');
    } while (salas.has(codigo));
    return codigo;
  }

  function criarSala() {
    const sala = {
      codigo: gerarCodigo(),
      donoToken: crypto.randomUUID(),
      jogo: game.criarJogo(config, banco.ler(), rng),
      conectados: new Map(), // playerId -> socket.id
      limpezaLobby: new Map(), // playerId -> timeout de remoção do lobby
      socketsNaSala: new Set(), // todos os sockets (display + celulares)
      timer: null,
      tempoRestante: null,
      timeoutProxima: null,
      timeoutExpiracao: null,
    };
    salas.set(sala.codigo, sala);
    return sala;
  }

  function destruirSala(sala) {
    pararTimer(sala);
    pararProxima(sala);
    for (const t of sala.limpezaLobby.values()) clearTimeout(t);
    sala.limpezaLobby.clear();
    if (sala.timeoutExpiracao) clearTimeout(sala.timeoutExpiracao);
    salas.delete(sala.codigo);
  }

  function agendarExpiracao(sala) {
    if (sala.timeoutExpiracao) clearTimeout(sala.timeoutExpiracao);
    sala.timeoutExpiracao = setTimeout(() => {
      if (sala.socketsNaSala.size === 0) destruirSala(sala);
    }, salaExpiraMs);
    sala.timeoutExpiracao.unref();
  }

  function cancelarExpiracao(sala) {
    if (sala.timeoutExpiracao) {
      clearTimeout(sala.timeoutExpiracao);
      sala.timeoutExpiracao = null;
    }
  }

  function cancelarLimpezaLobby(sala, playerId) {
    const pendente = sala.limpezaLobby.get(playerId);
    if (pendente) {
      clearTimeout(pendente);
      sala.limpezaLobby.delete(playerId);
    }
  }

  function agendarLimpezaLobby(sala, playerId) {
    if (sala.jogo.fase !== 'lobby') return;
    cancelarLimpezaLobby(sala, playerId);
    const t = setTimeout(() => {
      sala.limpezaLobby.delete(playerId);
      if (!salas.has(sala.codigo)) return;
      if (sala.jogo.fase !== 'lobby' || sala.conectados.has(playerId)) return;
      const jogador = sala.jogo.jogadores.find((j) => j.id === playerId);
      if (!jogador) return;
      game.removerJogador(sala.jogo, jogador.num);
      broadcast(sala);
    }, lobbyLimpezaMs);
    t.unref();
    sala.limpezaLobby.set(playerId, t);
  }

  app.get('/api/entrada', async (req, res) => {
    const codigo = String(req.query.sala || '').trim().toUpperCase();
    const sufixo = codigo ? `?sala=${codigo}` : '';
    const url = `http://${localIp()}:${req.socket.localPort}/jogar/${sufixo}`;
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

  app.get('/api/buscar', async (req, res) => {
    try {
      res.json(await itunes.buscar(String(req.query.q || '')));
    } catch (e) {
      console.error('Busca no iTunes falhou:', e.message);
      res.status(502).json({ erro: 'Busca indisponível no momento — cadastre a música manualmente.' });
    }
  });

  function nomeDe(sala, id) {
    const j = sala.jogo.jogadores.find((j) => j.id === id);
    return j ? j.nome : '?';
  }

  function estadoPublico(sala) {
    const { jogo } = sala;
    const r = jogo.rodada;
    return {
      codigo: sala.codigo,
      fase: jogo.fase,
      aviso: jogo.aviso,
      totalRodadas: config.rodada.totalRodadas,
      duracaoSegundos: config.rodada.duracaoSegundos,
      tempoRestante: sala.tempoRestante,
      jogadores: jogo.jogadores.map((j) => ({
        num: j.num, nome: j.nome, dupla: j.dupla, conectado: sala.conectados.has(j.id),
      })),
      duplas: Object.values(jogo.duplas),
      rodada: r && {
        numero: r.numero,
        fase: r.fase,
        dupla: r.dupla,
        modo: r.modo,
        apresentador: nomeDe(sala, r.apresentadorId),
        adivinhador: nomeDe(sala, r.adivinhadorId),
        valorAtual: game.valorAtual(jogo),
        dicasCompradas: r.dicasCompradas.map((d) => ({ tipo: d.tipo, custo: d.custo })),
        pontosGanhos: r.pontosGanhos,
        musica: r.fase === 'resultado' ? r.musica : null,
      },
    };
  }

  function estadoPrivado(sala, playerId) {
    const r = sala.jogo.rodada;
    if (!r) return null;
    if (playerId === r.apresentadorId) return { papel: 'apresentador', musica: r.musica };
    if (playerId === r.adivinhadorId) {
      return {
        papel: 'adivinhador',
        dicas: r.dicasCompradas,
        precos: game.dicasDisponiveis(config, r.musica),
      };
    }
    return { papel: 'plateia' };
  }

  function broadcast(sala) {
    const publico = estadoPublico(sala);
    for (const socketId of sala.socketsNaSala) {
      const socket = io.of('/').sockets.get(socketId);
      if (!socket) continue;
      const pid = socket.data.playerId;
      socket.emit('estado', { ...publico, voce: pid ? estadoPrivado(sala, pid) : null });
    }
  }

  function pararTimer(sala) {
    if (sala.timer) clearInterval(sala.timer);
    sala.timer = null;
  }

  function pararProxima(sala) {
    if (sala.timeoutProxima) clearTimeout(sala.timeoutProxima);
    sala.timeoutProxima = null;
  }

  function iniciarTimer(sala) {
    sala.tempoRestante = config.rodada.duracaoSegundos;
    io.to(`sala:${sala.codigo}`).emit('tick', sala.tempoRestante);
    sala.timer = setInterval(() => {
      sala.tempoRestante -= 1;
      io.to(`sala:${sala.codigo}`).emit('tick', sala.tempoRestante);
      if (sala.tempoRestante <= 0) {
        pararTimer(sala);
        const { jogo } = sala;
        if (jogo.fase === 'rodada' && jogo.rodada && jogo.rodada.fase === 'emAndamento') {
          game.tempoEsgotado(jogo);
          agendarProxima(sala);
          broadcast(sala);
        }
      }
    }, 1000);
    sala.timer.unref();
  }

  function agendarProxima(sala) {
    pararProxima(sala);
    sala.timeoutProxima = setTimeout(() => {
      sala.timeoutProxima = null;
      const { jogo } = sala;
      if (jogo.fase !== 'rodada' || !jogo.rodada || jogo.rodada.fase !== 'resultado') return;
      game.proximaRodada(jogo);
      sala.tempoRestante = null;
      broadcast(sala);
    }, resultadoMs);
    sala.timeoutProxima.unref();
  }

  io.on('connection', (socket) => {
    const minhaSala = () => salas.get(socket.data.sala);
    const pid = () => socket.data.playerId;

    const guardar = (acao) => {
      try {
        const sala = minhaSala();
        if (!sala) throw new Error('Você não está numa sala');
        acao(sala);
        broadcast(sala);
      } catch (e) {
        socket.emit('erro', e.message);
      }
    };

    const exigirDono = () => {
      if (!socket.data.ehDono) throw new Error('Só o display dono da sala pode fazer isso');
    };

    function vincular(sala) {
      socket.data.sala = sala.codigo;
      socket.join(`sala:${sala.codigo}`);
      sala.socketsNaSala.add(socket.id);
      cancelarExpiracao(sala);
    }

    socket.on('criarSala', (dados = {}, cb = () => {}) => {
      try {
        let sala = dados.donoToken
          ? [...salas.values()].find((s) => s.donoToken === dados.donoToken)
          : null;
        if (!sala) sala = criarSala();
        socket.data.ehDono = true;
        vincular(sala);
        cb({
          codigo: sala.codigo,
          donoToken: sala.donoToken,
          estado: { ...estadoPublico(sala), voce: null },
        });
        broadcast(sala);
      } catch (e) {
        cb({ erro: e.message });
      }
    });

    socket.on('entrar', (dados, cb = () => {}) => {
      try {
        const codigo = String(dados.sala || '').trim().toUpperCase();
        const sala = salas.get(codigo);
        if (!sala) throw new Error('Sala não encontrada — confira o código');
        const existente = dados.playerId && sala.jogo.jogadores.find((j) => j.id === dados.playerId);
        socket.data.playerId = existente
          ? existente.id
          : game.entrarJogador(sala.jogo, dados.nome, Number(dados.dupla)).id;
        vincular(sala);
        sala.conectados.set(socket.data.playerId, socket.id);
        cancelarLimpezaLobby(sala, socket.data.playerId);
        // O snapshot inicial vai no ack: o cliente recebe seu estado de forma
        // atômica, sem corrida com o broadcast a seguir.
        cb({
          playerId: socket.data.playerId,
          sala: sala.codigo,
          estado: { ...estadoPublico(sala), voce: estadoPrivado(sala, socket.data.playerId) },
        });
        broadcast(sala);
      } catch (e) {
        cb({ erro: e.message });
      }
    });

    socket.on('iniciarPartida', () => guardar((sala) => {
      exigirDono();
      sala.jogo.musicas = banco.ler();
      game.iniciarPartida(sala.jogo);
    }));

    socket.on('comecarRodada', () => guardar((sala) => {
      const r = sala.jogo.rodada;
      if (r && !sala.conectados.has(r.adivinhadorId)) {
        throw new Error('O adivinhador está desconectado — aguarde a reconexão');
      }
      game.comecarRodada(sala.jogo, pid());
      iniciarTimer(sala);
    }));

    socket.on('mudarParaMimica', () => guardar((sala) => game.mudarParaMimica(sala.jogo, pid())));
    socket.on('comprarDica', (tipo) => guardar((sala) => game.comprarDica(sala.jogo, pid(), tipo)));

    socket.on('acertou', () => guardar((sala) => {
      game.acertou(sala.jogo, pid());
      pararTimer(sala);
      agendarProxima(sala);
    }));

    socket.on('passar', () => guardar((sala) => {
      game.passar(sala.jogo, pid());
      pararTimer(sala);
      agendarProxima(sala);
    }));

    socket.on('removerJogador', (num) => guardar((sala) => {
      exigirDono();
      const alvo = sala.jogo.jogadores.find((j) => j.num === Number(num));
      game.removerJogador(sala.jogo, Number(num));
      if (alvo) {
        const socketId = sala.conectados.get(alvo.id);
        sala.conectados.delete(alvo.id);
        cancelarLimpezaLobby(sala, alvo.id);
        const s = socketId && io.of('/').sockets.get(socketId);
        if (s) {
          s.data.playerId = undefined;
          s.emit('removido');
        }
      }
    }));

    socket.on('reiniciarSala', () => guardar((sala) => {
      exigirDono();
      pararTimer(sala);
      pararProxima(sala);
      for (const id of [...sala.limpezaLobby.keys()]) cancelarLimpezaLobby(sala, id);
      sala.jogo = game.criarJogo(config, banco.ler(), rng);
      sala.tempoRestante = null;
      for (const socketId of sala.socketsNaSala) {
        const s = io.of('/').sockets.get(socketId);
        if (s && s.data.playerId) {
          s.data.playerId = undefined;
          s.emit('removido');
        }
      }
      sala.conectados.clear();
    }));

    socket.on('disconnect', () => {
      const sala = minhaSala();
      if (!sala) return;
      sala.socketsNaSala.delete(socket.id);
      if (pid() && sala.conectados.get(pid()) === socket.id) {
        sala.conectados.delete(pid());
        agendarLimpezaLobby(sala, pid());
      }
      if (sala.socketsNaSala.size === 0) agendarExpiracao(sala);
      broadcast(sala);
    });
  });

  httpServer.on('close', () => {
    for (const sala of [...salas.values()]) destruirSala(sala);
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
