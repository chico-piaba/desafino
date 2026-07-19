'use strict';
const crypto = require('crypto');

function criarJogo(config, musicas, rng = Math.random) {
  return {
    config,
    musicas,
    rng,
    fase: 'lobby',
    jogadores: [],
    duplas: {},
    duplasAtivas: [],
    rodada: null,
    rodadasJogadas: 0,
    musicasUsadas: [],
    aviso: null,
  };
}

function entrarJogador(jogo, nome, duplaNumero, id = crypto.randomUUID()) {
  if (jogo.fase !== 'lobby') throw new Error('A partida já começou');
  if (!nome || !String(nome).trim()) throw new Error('Nome obrigatório');
  if (![1, 2, 3, 4].includes(duplaNumero)) throw new Error('Dupla inválida');
  if (jogo.jogadores.filter((j) => j.dupla === duplaNumero).length >= 2) {
    throw new Error('Dupla cheia');
  }
  const jogador = { id, nome: String(nome).trim(), dupla: duplaNumero };
  jogo.jogadores.push(jogador);
  return jogador;
}

function iniciarPartida(jogo) {
  if (jogo.fase !== 'lobby') throw new Error('Partida já iniciada');
  const numeros = [...new Set(jogo.jogadores.map((j) => j.dupla))].sort();
  const completas = numeros.filter(
    (n) => jogo.jogadores.filter((j) => j.dupla === n).length === 2
  );
  if (completas.length < 2) throw new Error('São necessárias pelo menos 2 duplas completas');
  if (completas.length !== numeros.length) throw new Error('Há dupla incompleta');
  jogo.duplasAtivas = completas;
  for (const n of completas) jogo.duplas[n] = { numero: n, pontos: 0 };
  if (jogo.config.rodada.totalRodadas % completas.length !== 0) {
    jogo.aviso =
      'As rodadas não dividem igualmente entre as duplas — ajuste totalRodadas no config.json';
  }
  jogo.fase = 'rodada';
  prepararRodada(jogo);
}

function sortearMusica(jogo) {
  const disponiveis = jogo.musicas.filter((m) => !jogo.musicasUsadas.includes(m.id));
  if (disponiveis.length === 0) return null;
  const musica = disponiveis[Math.floor(jogo.rng() * disponiveis.length)];
  jogo.musicasUsadas.push(musica.id);
  return musica;
}

function prepararRodada(jogo) {
  const musica = sortearMusica(jogo);
  if (!musica) {
    jogo.fase = 'fim';
    jogo.rodada = null;
    jogo.aviso = 'Banco de músicas esgotado — partida encerrada mais cedo';
    return;
  }
  const n = jogo.rodadasJogadas;
  const duplaNumero = jogo.duplasAtivas[n % jogo.duplasAtivas.length];
  const membros = jogo.jogadores.filter((j) => j.dupla === duplaNumero);
  const vez = Math.floor(n / jogo.duplasAtivas.length) % 2;
  jogo.rodada = {
    numero: n + 1,
    fase: 'aguardandoInicio',
    dupla: duplaNumero,
    apresentadorId: membros[vez].id,
    adivinhadorId: membros[1 - vez].id,
    musica,
    modo: 'cantarolar',
    dicasCompradas: [],
    pontosGanhos: null,
  };
}

function exigirRodada(jogo, fase) {
  if (jogo.fase !== 'rodada' || !jogo.rodada || jogo.rodada.fase !== fase) {
    throw new Error('Ação inválida nesta fase do jogo');
  }
  return jogo.rodada;
}

function valorAtual(jogo) {
  const r = jogo.rodada;
  const v0 = jogo.config.modos[r.modo];
  const gasto = r.dicasCompradas.reduce((soma, d) => soma + d.custo, 0);
  return Math.max(0, v0 - gasto);
}

function comecarRodada(jogo, jogadorId) {
  const r = exigirRodada(jogo, 'aguardandoInicio');
  if (jogadorId !== r.apresentadorId) throw new Error('Só o apresentador inicia a rodada');
  r.fase = 'emAndamento';
}

function mudarParaMimica(jogo, jogadorId) {
  const r = exigirRodada(jogo, 'emAndamento');
  if (jogadorId !== r.apresentadorId) throw new Error('Só o apresentador muda o modo');
  if (r.modo === 'mimica') throw new Error('A rodada já está em mímica');
  r.modo = 'mimica';
}

function conteudoDica(musica, tipo) {
  if (tipo === 'cantor') return musica.artista;
  if (tipo === 'ano') return String(musica.ano);
  if (tipo === 'quantidadePalavras') {
    return `${musica.titulo.trim().split(/\s+/).length} palavras`;
  }
  throw new Error('Dica desconhecida');
}

function comprarDica(jogo, jogadorId, tipo) {
  const r = exigirRodada(jogo, 'emAndamento');
  if (jogadorId !== r.adivinhadorId) throw new Error('Só o adivinhador compra dicas');
  const custo = jogo.config.dicas[tipo];
  if (custo === undefined) throw new Error('Dica desconhecida');
  if (r.dicasCompradas.some((d) => d.tipo === tipo)) throw new Error('Dica já comprada');
  const dica = { tipo, custo, conteudo: conteudoDica(r.musica, tipo) };
  r.dicasCompradas.push(dica);
  return dica;
}

function encerrarRodada(jogo, pontos) {
  const r = jogo.rodada;
  r.pontosGanhos = pontos;
  jogo.duplas[r.dupla].pontos += pontos;
  r.fase = 'resultado';
  jogo.rodadasJogadas += 1;
}

function acertou(jogo, jogadorId) {
  const r = exigirRodada(jogo, 'emAndamento');
  if (jogadorId !== r.apresentadorId) throw new Error('Só o apresentador confirma o acerto');
  encerrarRodada(jogo, valorAtual(jogo));
}

function passar(jogo, jogadorId) {
  const r = exigirRodada(jogo, 'emAndamento');
  if (jogadorId !== r.apresentadorId) throw new Error('Só o apresentador passa');
  encerrarRodada(jogo, 0);
}

function tempoEsgotado(jogo) {
  exigirRodada(jogo, 'emAndamento');
  encerrarRodada(jogo, 0);
}

function proximaRodada(jogo) {
  exigirRodada(jogo, 'resultado');
  if (jogo.rodadasJogadas >= jogo.config.rodada.totalRodadas) {
    jogo.fase = 'fim';
    jogo.rodada = null;
    return;
  }
  prepararRodada(jogo);
}

module.exports = {
  criarJogo,
  entrarJogador,
  iniciarPartida,
  comecarRodada,
  mudarParaMimica,
  comprarDica,
  acertou,
  passar,
  tempoEsgotado,
  proximaRodada,
  valorAtual,
};
