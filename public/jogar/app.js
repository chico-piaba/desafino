'use strict';

function esc(texto) {
  const div = document.createElement('div');
  div.textContent = String(texto);
  return div.innerHTML;
}

const socket = io();
const $ = (id) => document.getElementById(id);
const NOME_DICA = {
  cantor: '🎤 Cantor',
  ano: '📅 Ano',
  decada: '🕰 Década',
  genero: '🎶 Gênero',
  inicialDoTitulo: '🔤 Inicial do título',
  forca: '🪢 Forca',
};
let ultimoEstado = null;

function entrar(dados) {
  socket.emit('entrar', dados, (resposta) => {
    if (resposta.erro) {
      // Reconexão automática com sala/playerId de partida antiga: limpa e volta pra entrada
      if (dados.playerId && !dados.nome) {
        localStorage.removeItem('desafinoPlayerId');
        localStorage.removeItem('desafinoSala');
        if (ultimoEstado) render(ultimoEstado);
        return;
      }
      return mostrarErro(resposta.erro);
    }
    localStorage.setItem('desafinoPlayerId', resposta.playerId);
    localStorage.setItem('desafinoSala', resposta.sala);
    if (resposta.estado) {
      ultimoEstado = resposta.estado;
      render(resposta.estado);
    }
  });
}

const salaDaUrl = (new URLSearchParams(location.search).get('sala') || '').toUpperCase().slice(0, 4);
$('campo-sala').value = salaDaUrl || localStorage.getItem('desafinoSala') || '';

// ---- Perfil e builder de avatar ----
const PECAS = [
  ['fundo', '🎨 Fundo'], ['rosto', '🙂 Rosto'], ['olhos', '👀 Olhos'],
  ['boca', '👄 Boca'], ['acessorio', '🎩 Acessório'],
];
let perfil;
try { perfil = JSON.parse(localStorage.getItem('desafinoPerfil') || 'null'); } catch { perfil = null; }
if (!perfil || !perfil.avatar) perfil = { nome: '', avatar: DesafinoAvatar.avatarAleatorio() };
$('campo-nome').value = perfil.nome || '';

function renderAvatarPreview() {
  $('avatar-preview').innerHTML = DesafinoAvatar.avatarSvg(perfil.avatar);
}

$('builder').innerHTML = PECAS.map(([peca, rotulo]) =>
  `<div class="linha-peca"><span>${rotulo}</span><span>
    <button type="button" class="btn btn-peca" data-peca="${peca}" data-dir="-1">◀</button>
    <button type="button" class="btn btn-peca" data-peca="${peca}" data-dir="1">▶</button>
  </span></div>`
).join('') +
  '<button type="button" id="btn-sortear" class="btn btn-secondary" style="width:100%;margin-top:6px">🎲 Aleatório</button>';

for (const btn of $('builder').querySelectorAll('button[data-peca]')) {
  btn.onclick = () => {
    const peca = btn.dataset.peca;
    const n = DesafinoAvatar.TAMANHOS[peca];
    perfil.avatar[peca] = ((perfil.avatar[peca] || 0) + Number(btn.dataset.dir) + n) % n;
    renderAvatarPreview();
  };
}
$('btn-sortear').onclick = () => {
  perfil.avatar = DesafinoAvatar.avatarAleatorio();
  renderAvatarPreview();
};
renderAvatarPreview();

for (const btn of $('emotes').querySelectorAll('button[data-emote]')) {
  btn.onclick = () => socket.emit('emote', btn.dataset.emote);
}

socket.on('connect', () => {
  const playerId = localStorage.getItem('desafinoPlayerId');
  const sala = localStorage.getItem('desafinoSala');
  if (playerId && sala) entrar({ sala, playerId });
});

$('btn-entrar').onclick = () => {
  perfil.nome = $('campo-nome').value.trim();
  localStorage.setItem('desafinoPerfil', JSON.stringify(perfil));
  // Envia o playerId salvo: se este aparelho já entrou nesta sala, o servidor
  // reconecta em vez de criar um jogador duplicado.
  entrar({
    sala: $('campo-sala').value.trim().toUpperCase(),
    nome: perfil.nome,
    dupla: $('campo-dupla').value,
    avatar: perfil.avatar,
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
    $('emotes').classList.toggle('oculto', !entrou);
    $('espera-titulo').textContent = 'Você está dentro!';
    $('espera-texto').textContent = 'Aguardando a partida começar…';
    return mostrarTela(e.voce || entrou ? 'tela-espera' : 'tela-entrar');
  }
  $('emotes').classList.add('oculto');
  if (e.fase === 'fim') {
    $('espera-titulo').textContent = '🏆 Fim de jogo!';
    $('espera-texto').textContent = 'Veja o resultado no display.';
    return mostrarTela('tela-espera');
  }
  if (!e.voce) return mostrarTela('tela-entrar');
  if (e.rodada.fase === 'resultado') {
    const r = e.rodada;
    $('espera-titulo').textContent = r.pontosGanhos > 0 ? '🎉 Acertaram!' : '😅 Rodada encerrada';
    $('espera-texto').textContent = (e.modoJogo === 'x1'
      ? `+${r.pontosGanhos} pts ${r.adivinhador}` + (r.bonusApresentador ? ` e +${r.bonusApresentador} pts ${r.apresentador}` : '')
      : `+${r.pontosGanhos} pts para a Dupla ${r.dupla}`) + '. Próxima rodada já vem…';
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
        const rotulo = NOME_DICA[tipo] || tipo;
        if (comprada) {
          const classe = tipo === 'forca' ? 'pill forca-pill' : 'pill';
          return `<div class="dica"><b>${rotulo}:</b> <span class="${classe}">${esc(comprada.conteudo)}</span></div>`;
        }
        return `<div class="dica"><span>${rotulo}</span>
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
