'use strict';
const crypto = require('crypto');

function criarJogo(config, musicas, rng = Math.random) {
  return {
    config,
    musicas,
    rng,
    fase: 'lobby',
    modo: 'duplas',
    jogadores: [],
    duplas: {},
    pontosJogadores: {},
    duplasAtivas: [],
    rodada: null,
    rodadasJogadas: 0,
    musicasUsadas: [],
    aviso: null,
    proximoNum: 0,
  };
}

const PECAS_AVATAR = ['fundo', 'rosto', 'olhos', 'boca', 'acessorio'];

function sanearAvatar(avatar) {
  const saneado = {};
  for (const chave of PECAS_AVATAR) {
    const valor = avatar && typeof avatar === 'object' ? Number(avatar[chave]) : NaN;
    saneado[chave] = Number.isInteger(valor) && valor >= 0 && valor <= 99 ? valor : 0;
  }
  return saneado;
}

function entrarJogador(jogo, nome, duplaNumero, id = crypto.randomUUID(), avatar = null) {
  if (jogo.fase !== 'lobby') throw new Error('A partida já começou');
  if (!nome || !String(nome).trim()) throw new Error('Nome obrigatório');
  if (![1, 2, 3, 4].includes(duplaNumero)) throw new Error('Dupla inválida');
  if (jogo.jogadores.filter((j) => j.dupla === duplaNumero).length >= 2) {
    throw new Error('Dupla cheia');
  }
  jogo.proximoNum += 1;
  const jogador = {
    id,
    num: jogo.proximoNum,
    nome: String(nome).trim(),
    dupla: duplaNumero,
    avatar: sanearAvatar(avatar),
  };
  jogo.jogadores.push(jogador);
  return jogador;
}

function removerJogador(jogo, num) {
  if (jogo.fase !== 'lobby') throw new Error('Só é possível remover jogadores no lobby');
  const indice = jogo.jogadores.findIndex((j) => j.num === num);
  if (indice === -1) throw new Error('Jogador não encontrado');
  jogo.jogadores.splice(indice, 1);
}

function iniciarPartida(jogo) {
  if (jogo.fase !== 'lobby') throw new Error('Partida já iniciada');
  const numeros = [...new Set(jogo.jogadores.map((j) => j.dupla))].sort();
  const completas = numeros.filter(
    (n) => jogo.jogadores.filter((j) => j.dupla === n).length === 2
  );
  if (completas.length !== numeros.length) throw new Error('Há dupla incompleta');
  if (completas.length === 0) {
    throw new Error('É preciso pelo menos uma dupla completa para começar');
  }
  jogo.duplasAtivas = completas;
  // Uma dupla sozinha joga um contra o outro (x1); duas ou mais, modo clássico.
  jogo.modo = completas.length === 1 ? 'x1' : 'duplas';
  if (jogo.modo === 'x1') {
    for (const j of jogo.jogadores) jogo.pontosJogadores[j.num] = 0;
  } else {
    for (const n of completas) jogo.duplas[n] = { numero: n, pontos: 0 };
    if (jogo.config.rodada.totalRodadas % completas.length !== 0) {
      jogo.aviso =
        'As rodadas não dividem igualmente entre as duplas — ajuste totalRodadas no config.json';
    }
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
    bonusApresentador: null,
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

function primeiraLetra(titulo) {
  const letra = [...String(titulo)].find((c) => /[\p{L}\p{N}]/u.test(c));
  return letra ? letra.toUpperCase() : '?';
}

function gerarForca(titulo, revelarInicial) {
  let primeira = true;
  return [...String(titulo).trim()]
    .map((c) => {
      if (/[\p{L}\p{N}]/u.test(c)) {
        const ehPrimeira = primeira;
        primeira = false;
        if (ehPrimeira && revelarInicial) return c.toUpperCase();
        return '_';
      }
      return c; // espaços e pontuação ficam visíveis, como na forca
    })
    .join(' ');
}

function conteudoDica(musica, tipo, dicasCompradas = []) {
  if (tipo === 'cantor') return musica.artista;
  if (tipo === 'ano') return String(musica.ano);
  if (tipo === 'decada') {
    const decada = Math.floor(musica.ano / 10) * 10;
    return decada >= 2000 ? `Anos ${decada}` : `Anos ${decada % 100}`;
  }
  if (tipo === 'genero') {
    if (!musica.genero) throw new Error('Dica indisponível para esta música');
    return musica.genero;
  }
  if (tipo === 'inicialDoTitulo') return `Começa com "${primeiraLetra(musica.titulo)}"`;
  if (tipo === 'forca') {
    const temInicial = dicasCompradas.some((d) => d.tipo === 'inicialDoTitulo');
    return gerarForca(musica.titulo, temInicial);
  }
  throw new Error('Dica desconhecida');
}

function dicasDisponiveis(config, musica) {
  return Object.fromEntries(
    Object.entries(config.dicas).filter(([tipo]) => tipo !== 'genero' || Boolean(musica.genero))
  );
}

function comprarDica(jogo, jogadorId, tipo) {
  const r = exigirRodada(jogo, 'emAndamento');
  if (jogadorId !== r.adivinhadorId) throw new Error('Só o adivinhador compra dicas');
  const custo = jogo.config.dicas[tipo];
  if (custo === undefined) throw new Error('Dica desconhecida');
  if (r.dicasCompradas.some((d) => d.tipo === tipo)) throw new Error('Dica já comprada');
  const dica = { tipo, custo, conteudo: conteudoDica(r.musica, tipo, r.dicasCompradas) };
  r.dicasCompradas.push(dica);
  // Comprar a inicial depois da forca preenche a primeira letra na forca já revelada.
  if (tipo === 'inicialDoTitulo') {
    const forca = r.dicasCompradas.find((d) => d.tipo === 'forca');
    if (forca) forca.conteudo = conteudoDica(r.musica, 'forca', r.dicasCompradas);
  }
  return dica;
}

function encerrarRodada(jogo, pontos) {
  const r = jogo.rodada;
  r.pontosGanhos = pontos;
  if (jogo.modo === 'x1') {
    // No duelo, o adivinhador leva o valor e o apresentador ganha um bônus no
    // acerto — sem isso, quem apresenta teria incentivo de sabotar a rodada.
    const fracao = jogo.config.x1 ? jogo.config.x1.bonusApresentador : 0.5;
    const adivinhador = jogo.jogadores.find((j) => j.id === r.adivinhadorId);
    const apresentador = jogo.jogadores.find((j) => j.id === r.apresentadorId);
    r.bonusApresentador = pontos > 0 ? Math.round(pontos * fracao) : 0;
    jogo.pontosJogadores[adivinhador.num] += pontos;
    jogo.pontosJogadores[apresentador.num] += r.bonusApresentador;
  } else {
    jogo.duplas[r.dupla].pontos += pontos;
  }
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
  removerJogador,
  iniciarPartida,
  comecarRodada,
  mudarParaMimica,
  comprarDica,
  acertou,
  passar,
  tempoEsgotado,
  proximaRodada,
  valorAtual,
  dicasDisponiveis,
  gerarForca,
};
