'use strict';

function esc(texto) {
  const div = document.createElement('div');
  div.textContent = String(texto);
  return div.innerHTML;
}

const socket = io();
const $ = (id) => document.getElementById(id);
const NOME_DICA = { cantor: '🎤 Cantor', ano: '📅 Ano', quantidadePalavras: '🔢 Nº de palavras' };
let ultimoEstado = null;

function entrar(dados) {
  socket.emit('entrar', dados, (resposta) => {
    if (resposta.erro) {
      // Reconexão automática com playerId de partida antiga: limpa e volta pra entrada
      if (dados.playerId && !dados.nome) {
        localStorage.removeItem('desafinoPlayerId');
        if (ultimoEstado) render(ultimoEstado);
        return;
      }
      return mostrarErro(resposta.erro);
    }
    localStorage.setItem('desafinoPlayerId', resposta.playerId);
    if (resposta.estado) {
      ultimoEstado = resposta.estado;
      render(resposta.estado);
    }
  });
}

const playerIdSalvo = localStorage.getItem('desafinoPlayerId');
socket.on('connect', () => {
  if (playerIdSalvo) entrar({ playerId: playerIdSalvo });
});

$('btn-entrar').onclick = () => {
  // Envia o playerId salvo: se este aparelho já entrou, o servidor reconecta
  // em vez de criar um jogador duplicado.
  entrar({
    nome: $('campo-nome').value,
    dupla: $('campo-dupla').value,
    playerId: localStorage.getItem('desafinoPlayerId') || undefined,
  });
};

socket.on('removido', () => {
  localStorage.removeItem('desafinoPlayerId');
  mostrarErro('Você saiu da sala — entre novamente.');
  if (ultimoEstado) render(ultimoEstado);
});

socket.on('erro', mostrarErro);
socket.on('tick', (t) => { $('tempo').textContent = t; });

socket.on('estado', (e) => {
  ultimoEstado = e;
  render(e);
});

function mostrarTela(id) {
  for (const s of document.querySelectorAll('.tela')) s.classList.add('oculto');
  $(id).classList.remove('oculto');
}

function render(e) {
  const entrou = Boolean(e.voce) || (e.fase === 'lobby' && localStorage.getItem('desafinoPlayerId') && e.jogadores.length > 0);
  const emRodada = e.fase === 'rodada' && e.rodada && e.rodada.fase !== 'resultado';
  $('timer-jogador').classList.toggle('oculto', !(emRodada && e.rodada.fase === 'emAndamento'));
  if (emRodada && e.rodada.fase === 'emAndamento' && e.tempoRestante != null) {
    $('tempo').textContent = e.tempoRestante;
  }

  if (e.fase === 'lobby') {
    return mostrarTela(e.voce || entrou ? 'tela-espera' : 'tela-entrar');
  }
  if (e.fase === 'fim') {
    $('espera-titulo').textContent = '🏆 Fim de jogo!';
    $('espera-texto').textContent = 'Veja o resultado no display.';
    return mostrarTela('tela-espera');
  }
  if (!e.voce) return mostrarTela('tela-entrar');
  if (e.rodada.fase === 'resultado') {
    $('espera-titulo').textContent = e.rodada.pontosGanhos > 0 ? '🎉 Acertaram!' : '😅 Rodada encerrada';
    $('espera-texto').textContent = `+${e.rodada.pontosGanhos} pts para a Dupla ${e.rodada.dupla}. Próxima rodada já vem…`;
    return mostrarTela('tela-espera');
  }
  if (e.voce.papel === 'apresentador') return renderApresentador(e);
  if (e.voce.papel === 'adivinhador') return renderAdivinhador(e);
  mostrarTela('tela-plateia');
}

function renderApresentador(e) {
  mostrarTela('tela-apresentador');
  $('musica-titulo').textContent = e.voce.musica.titulo;
  $('musica-artista').textContent = e.voce.musica.artista;
  const andamento = e.rodada.fase === 'emAndamento';
  $('btn-comecar').classList.toggle('oculto', andamento);
  $('btn-mimica').classList.toggle('oculto', !andamento || e.rodada.modo === 'mimica');
  $('btn-acertou').classList.toggle('oculto', !andamento);
  $('btn-passar').classList.toggle('oculto', !andamento);
}

function renderAdivinhador(e) {
  mostrarTela('tela-adivinhador');
  $('valor').textContent = e.rodada.valorAtual;
  const aguardando = e.rodada.fase === 'aguardandoInicio';
  $('lista-dicas').innerHTML = aguardando
    ? '<p>Aguarde o apresentador começar…</p>'
    : Object.entries(e.voce.precos).map(([tipo, custo]) => {
        const comprada = e.voce.dicas.find((d) => d.tipo === tipo);
        if (comprada) {
          return `<div class="dica"><b>${NOME_DICA[tipo]}:</b> <span class="pill">${esc(comprada.conteudo)}</span></div>`;
        }
        return `<div class="dica"><span>${NOME_DICA[tipo]}</span>
          <button class="btn btn-tertiary" data-tipo="${tipo}" style="padding:8px 16px">−${custo} pts</button></div>`;
      }).join('');
  for (const btn of $('lista-dicas').querySelectorAll('button[data-tipo]')) {
    btn.onclick = () => socket.emit('comprarDica', btn.dataset.tipo);
  }
}

$('btn-comecar').onclick = () => socket.emit('comecarRodada');
$('btn-mimica').onclick = () => socket.emit('mudarParaMimica');
$('btn-acertou').onclick = () => socket.emit('acertou');
$('btn-passar').onclick = () => socket.emit('passar');

let erroTimeout = null;
function mostrarErro(msg) {
  $('erro').textContent = msg;
  clearTimeout(erroTimeout);
  erroTimeout = setTimeout(() => { $('erro').textContent = ''; }, 4000);
}
