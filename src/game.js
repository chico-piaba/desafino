'use strict';
const crypto = require('crypto');
const dicas = require('./dicas');
const { mesclarPadroes } = require('./configSala');
const { pareceCerto } = require('./texto');

function criarJogo(config, musicas, rng = Math.random) {
  return {
    config: mesclarPadroes(config),
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
  const { maxDuplas, maxJogadores } = jogo.config.sala;
  if (!Number.isInteger(duplaNumero) || duplaNumero < 1 || duplaNumero > maxDuplas) {
    throw new Error(`Dupla inválida — esta sala vai até a dupla ${maxDuplas}`);
  }
  if (jogo.jogadores.length >= maxJogadores) throw new Error('Sala lotada');
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

// Volta ao lobby mantendo jogadores, duplas e avatares — só a partida zera.
// Diferente de criar uma sala nova, que devolve todo mundo para o login.
function reiniciarPartida(jogo) {
  jogo.fase = 'lobby';
  jogo.modo = 'duplas';
  jogo.duplas = {};
  jogo.pontosJogadores = {};
  jogo.duplasAtivas = [];
  jogo.rodada = null;
  jogo.rodadasJogadas = 0;
  jogo.musicasUsadas = [];
  jogo.aviso = null;
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
    acoes: [],
    roubos: [],
    duplasQueRoubaram: [],
    trocasUsadas: 0,
    votacao: null,
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
  const soma = (lista, campo) => lista.reduce((total, item) => total + item[campo], 0);
  const gasto = soma(r.dicasCompradas, 'custo') + soma(r.acoes, 'custo') + soma(r.roubos, 'valor');
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

function trocarMusica(jogo, jogadorId) {
  const r = exigirRodada(jogo, 'emAndamento');
  if (jogadorId !== r.apresentadorId) throw new Error('Só o apresentador troca a música');
  if (!jogo.config.troca.ligada) throw new Error('A troca de música está desligada nesta sala');
  if (r.trocasUsadas >= jogo.config.troca.porRodada) {
    throw new Error('Você já trocou a música nesta rodada');
  }
  const nova = sortearMusica(jogo);
  if (!nova) throw new Error('Não há outra música disponível');
  // Pote único que nunca reseta: o gasto em dicas da música antiga vira uma
  // ação e a lista zera, para que as dicas da música nova possam ser compradas.
  const gastoAnterior = r.dicasCompradas.reduce((total, d) => total + d.custo, 0);
  if (gastoAnterior > 0) r.acoes.push({ tipo: 'dicasAnteriores', custo: gastoAnterior });
  r.dicasCompradas = [];
  r.acoes.push({ tipo: 'troca', custo: jogo.config.troca.custo });
  r.trocasUsadas += 1;
  r.musica = nova;
  return nova;
}

function comprarDica(jogo, jogadorId, tipo) {
  const r = exigirRodada(jogo, 'emAndamento');
  if (jogadorId !== r.adivinhadorId) throw new Error('Só o adivinhador compra dicas');
  const custo = jogo.config.dicas[tipo];
  if (custo === undefined) throw new Error('Dica desconhecida');
  if (r.dicasCompradas.some((d) => d.tipo === tipo)) throw new Error('Dica já comprada');
  const dica = { tipo, custo, conteudo: dicas.conteudoDica(r.musica, tipo, r.dicasCompradas) };
  r.dicasCompradas.push(dica);
  // Comprar a inicial depois da forca preenche a primeira letra na forca já revelada.
  if (tipo === 'inicialDoTitulo') {
    const forca = r.dicasCompradas.find((d) => d.tipo === 'forca');
    if (forca) forca.conteudo = dicas.conteudoDica(r.musica, 'forca', r.dicasCompradas);
  }
  return dica;
}

function palpitar(jogo, jogadorId, texto) {
  const r = exigirRodada(jogo, 'emAndamento');
  if (!jogo.config.plateia.palpite) throw new Error('O palpite da plateia está desligado nesta sala');
  if (jogo.modo !== 'duplas') throw new Error('Sem plateia neste modo');
  if (jogadorId === r.apresentadorId || jogadorId === r.adivinhadorId) {
    throw new Error('Quem está jogando a rodada não palpita');
  }
  const jogador = jogo.jogadores.find((j) => j.id === jogadorId);
  if (!jogador) throw new Error('Jogador não encontrado');
  if (!texto || !String(texto).trim()) throw new Error('Palpite vazio');
  if (!pareceCerto(texto, r.musica.titulo)) return { certo: false };
  // Uma dupla só rouba uma vez por rodada: sem isso, dois membros da mesma
  // dupla drenariam o pote em sequência.
  if (r.duplasQueRoubaram.includes(jogador.dupla)) {
    return { certo: true, roubo: 0, bonus: 0, repetido: true };
  }
  const valor = Math.max(1, Math.round(valorAtual(jogo) * jogo.config.plateia.rouboFracao));
  const bonus = Math.round(valor * jogo.config.plateia.bonusFracao);
  r.roubos.push({ num: jogador.num, dupla: jogador.dupla, valor });
  r.duplasQueRoubaram.push(jogador.dupla);
  if (jogo.duplas[jogador.dupla]) jogo.duplas[jogador.dupla].pontos += bonus;
  return { certo: true, roubo: valor, bonus, nome: jogador.nome, repetido: false };
}

function abrirVotacao(jogo, origem, eleitores) {
  const r = exigirRodada(jogo, 'emAndamento');
  // Sem plateia conectada, ou com a votação desligada, o apresentador segue
  // sendo a única autoridade — é o caso do duelo x1.
  if (!jogo.config.plateia.votacao) return null;
  if (!eleitores || eleitores.length === 0) return null;
  r.fase = 'votacao';
  r.votacao = { origem, eleitores: [...eleitores], votos: {} };
  return r.votacao;
}

function adivinhadorAcertou(jogo, jogadorId, eleitores = []) {
  const r = exigirRodada(jogo, 'emAndamento');
  if (jogadorId !== r.adivinhadorId) throw new Error('Só o adivinhador avisa que acertou');
  return abrirVotacao(jogo, 'adivinhador', eleitores);
}

function fecharVotacao(jogo, aprovada) {
  const r = jogo.rodada;
  const { origem } = r.votacao;
  r.votacao = null;
  if (aprovada) {
    encerrarRodada(jogo, valorAtual(jogo));
    return { aprovada: true, origem };
  }
  if (origem === 'tempo') {
    encerrarRodada(jogo, 0);
    return { aprovada: false, origem };
  }
  r.fase = 'emAndamento';
  return { aprovada: false, origem };
}

function aprovouAcerto(votacao) {
  const sim = Object.values(votacao.votos).filter(Boolean).length;
  return sim * 2 > votacao.eleitores.length; // mais de 50%, empate não passa
}

function votar(jogo, jogadorNum, acertouMesmo) {
  const r = exigirRodada(jogo, 'votacao');
  if (!r.votacao.eleitores.includes(jogadorNum)) throw new Error('Você não vota nesta rodada');
  r.votacao.votos[jogadorNum] = Boolean(acertouMesmo);
  if (aprovouAcerto(r.votacao)) return fecharVotacao(jogo, true);
  if (Object.keys(r.votacao.votos).length >= r.votacao.eleitores.length) {
    return fecharVotacao(jogo, false);
  }
  return null;
}

function fecharVotacaoPorPrazo(jogo) {
  const r = exigirRodada(jogo, 'votacao');
  return fecharVotacao(jogo, aprovouAcerto(r.votacao));
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
  const r = jogo.rodada;
  // Vale em andamento e durante a votação: o apresentador que acorda no meio
  // da votação resolve na hora, sem esperar a plateia.
  if (jogo.fase !== 'rodada' || !r || !['emAndamento', 'votacao'].includes(r.fase)) {
    throw new Error('Ação inválida nesta fase do jogo');
  }
  if (jogadorId !== r.apresentadorId) throw new Error('Só o apresentador confirma o acerto');
  r.votacao = null;
  encerrarRodada(jogo, valorAtual(jogo));
}

function passar(jogo, jogadorId) {
  const r = exigirRodada(jogo, 'emAndamento');
  if (jogadorId !== r.apresentadorId) throw new Error('Só o apresentador passa');
  encerrarRodada(jogo, 0);
}

function tempoEsgotado(jogo, eleitores = []) {
  exigirRodada(jogo, 'emAndamento');
  if (abrirVotacao(jogo, 'tempo', eleitores)) return { votacao: true };
  encerrarRodada(jogo, 0);
  return { votacao: false };
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
  reiniciarPartida,
  comecarRodada,
  mudarParaMimica,
  trocarMusica,
  comprarDica,
  palpitar,
  acertou,
  passar,
  tempoEsgotado,
  adivinhadorAcertou,
  votar,
  fecharVotacaoPorPrazo,
  proximaRodada,
  valorAtual,
  dicasDisponiveis: dicas.dicasDisponiveis,
  gerarForca: dicas.gerarForca,
};
