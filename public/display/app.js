'use strict';
const socket = io();
const $ = (id) => document.getElementById(id);
const NOME_MODO = { cantarolar: 'CANTAROLANDO 🎤', mimica: 'MÍMICA 🎭' };
const NOME_DICA = {
  cantor: 'Cantor', ano: 'Ano', decada: 'Década', genero: 'Gênero',
  inicialDoTitulo: 'Inicial do título', forca: 'Forca',
};

function esc(texto) {
  const div = document.createElement('div');
  div.textContent = String(texto);
  return div.innerHTML;
}

let codigoAtual = null;
socket.on('connect', () => {
  // Cria uma sala nova, ou reassume a sala deste display se o token ainda vale.
  socket.emit('criarSala', { donoToken: localStorage.getItem('desafinoDonoToken') || undefined }, (r) => {
    if (r.erro) return mostrarEvento(`⚠️ ${r.erro}`);
    localStorage.setItem('desafinoDonoToken', r.donoToken);
    if (r.codigo === codigoAtual) return; // reconexão na mesma sala: QR já está certo
    codigoAtual = r.codigo;
    $('codigo-sala').textContent = r.codigo;
    fetch(`/api/entrada?sala=${r.codigo}`).then((resp) => resp.json()).then(({ url, qr }) => {
      $('qr').src = qr;
      $('url-entrada').textContent = url;
    });
  });
});

$('btn-iniciar').onclick = () => socket.emit('iniciarPartida');
$('btn-reiniciar').onclick = () => {
  if (confirm('Reiniciar a sala? Todos os jogadores e pontos serão zerados.')) {
    socket.emit('reiniciarSala');
  }
};
socket.on('erro', (msg) => mostrarEvento(`⚠️ ${msg}`));
socket.on('tick', (t) => {
  $('tempo').textContent = t;
  $('timer').classList.toggle('urgente', t <= 15);
});

let dicasVistas = 0;
socket.on('estado', (e) => {
  $('aviso').classList.toggle('oculto', !e.aviso);
  $('aviso').textContent = e.aviso || '';
  renderPresenca(e);
  renderRanking(e);
  if (e.fase === 'lobby') return mostrarTela('tela-lobby', e);
  if (e.fase === 'fim') return renderFim(e);
  if (e.rodada.fase === 'resultado') return renderResultado(e);
  renderRodada(e);
});

function mostrarTela(id) {
  for (const s of document.querySelectorAll('.tela')) s.classList.add('oculto');
  $(id).classList.remove('oculto');
}

function renderLobbyDuplas(e) {
  const porDupla = [1, 2, 3, 4].map((n) => {
    const membros = e.jogadores.filter((j) => j.dupla === n);
    if (!membros.length) return '';
    const itens = membros.map((j) =>
      `<div class="card-jogador ${j.conectado ? '' : 'off'}" data-num="${j.num}"
            style="animation-delay:${(j.num % 7) * 0.4}s">
        <span class="mini-avatar">${DesafinoAvatar.avatarSvg(j.avatar)}</span>
        <span class="nome-jogador">${j.conectado ? '' : '🔴 '}${esc(j.nome)}</span>
        <button class="remover-jogador" data-num="${j.num}" title="Remover jogador">✕</button>
      </div>`
    ).join('');
    return `<div class="grupo-dupla"><b>Dupla ${n}</b><div class="fileira-avatares">${itens}</div></div>`;
  });
  $('lobby-duplas').innerHTML = porDupla.join('') || '<p>Aguardando jogadores…</p>';
  for (const btn of $('lobby-duplas').querySelectorAll('button[data-num]')) {
    btn.onclick = () => socket.emit('removerJogador', Number(btn.dataset.num));
  }
}

socket.on('emote', ({ num, tipo }) => {
  const card = document.querySelector(`.card-jogador[data-num="${num}"]`);
  if (!card) return;
  card.classList.remove('pulo');
  void card.offsetWidth; // reinicia a animação
  card.classList.add('pulo');
  const balao = document.createElement('span');
  balao.className = 'emote-flutuante';
  balao.textContent = tipo;
  card.appendChild(balao);
  setTimeout(() => balao.remove(), 1600);
});

function avatarDoNum(e, num) {
  const j = e.jogadores.find((x) => x.num === num);
  return j ? DesafinoAvatar.avatarSvg(j.avatar) : '';
}

function renderPresenca(e) {
  const duplaVez = e.fase === 'rodada' && e.rodada ? e.rodada.dupla : null;
  const offline = duplaVez
    ? e.jogadores.filter((j) => j.dupla === duplaVez && !j.conectado).map((j) => j.nome)
    : [];
  $('presenca').classList.toggle('oculto', offline.length === 0);
  $('presenca').textContent = offline.length ? `📵 Desconectado: ${offline.join(', ')}` : '';
}

function renderRodada(e) {
  mostrarTela('tela-rodada');
  const r = e.rodada;
  $('rodada-info').textContent = e.modoJogo === 'x1'
    ? `Rodada ${r.numero} de ${e.totalRodadas} — Duelo x1 ⚔️`
    : `Rodada ${r.numero} de ${e.totalRodadas} — Dupla ${r.dupla}`;
  $('modo').textContent = r.fase === 'aguardandoInicio' ? 'PREPARANDO…' : NOME_MODO[r.modo];
  $('modo').className = `pill modo ${r.modo}`;
  $('apresentador').textContent = r.apresentador;
  $('adivinhador').textContent = r.adivinhador;
  $('avatar-apresentador').innerHTML = avatarDoNum(e, r.apresentadorNum);
  $('avatar-adivinhador').innerHTML = avatarDoNum(e, r.adivinhadorNum);
  $('valor').textContent = `${r.valorAtual} pts`;
  if (r.fase === 'aguardandoInicio') {
    $('tempo').textContent = e.duracaoSegundos;
    $('timer').classList.remove('urgente');
  } else if (e.tempoRestante != null) {
    $('tempo').textContent = e.tempoRestante;
  }
  if (r.dicasCompradas.length > dicasVistas) {
    const d = r.dicasCompradas[r.dicasCompradas.length - 1];
    mostrarEvento(`💡 Dica comprada: ${NOME_DICA[d.tipo] || d.tipo} (−${d.custo} pts)`);
  }
  dicasVistas = r.dicasCompradas.length;
}

function renderResultado(e) {
  mostrarTela('tela-resultado');
  dicasVistas = 0;
  const r = e.rodada;
  const acertou = r.pontosGanhos > 0;
  $('resultado-titulo').textContent = acertou ? '🎉 Acertou!' : '😅 Não foi dessa vez…';
  $('resultado-musica').textContent = `A música era: "${r.musica.titulo}" — ${r.musica.artista} (${r.musica.ano})`;
  $('resultado-pontos').textContent = e.modoJogo === 'x1'
    ? `+${r.pontosGanhos} pts ${r.adivinhador}` + (r.bonusApresentador ? ` · +${r.bonusApresentador} pts ${r.apresentador}` : '')
    : `+${r.pontosGanhos} pts para a Dupla ${r.dupla}`;
}

function renderFim(e) {
  mostrarTela('tela-fim');
  if (e.modoJogo === 'x1') {
    const ordenados = [...e.jogadores].sort(
      (a, b) => (e.pontosJogadores[b.num] || 0) - (e.pontosJogadores[a.num] || 0)
    );
    const melhor = e.pontosJogadores[ordenados[0].num] || 0;
    const campeoes = ordenados.filter((j) => (e.pontosJogadores[j.num] || 0) === melhor);
    $('podio').innerHTML = campeoes.length > 1
      ? `Empate! ${campeoes.map((j) => esc(j.nome)).join(' e ')} com ${melhor} pts`
      : `Vencedor do duelo: ${esc(campeoes[0].nome)} com ${melhor} pts ⚔️🏆`;
    return;
  }
  const ordenadas = [...e.duplas].sort((a, b) => b.pontos - a.pontos);
  const melhor = ordenadas[0].pontos;
  const campeas = ordenadas.filter((d) => d.pontos === melhor);
  $('podio').innerHTML = campeas.length > 1
    ? `Empate! ${campeas.map((d) => `Dupla ${d.numero}`).join(' e ')} com ${melhor} pts`
    : `Campeã: Dupla ${campeas[0].numero} com ${melhor} pts 🏆`;
}

function renderRanking(e) {
  if (e.fase === 'lobby') renderLobbyDuplas(e);
  if (e.modoJogo === 'x1' && e.pontosJogadores) {
    $('ranking').innerHTML = [...e.jogadores]
      .sort((a, b) => (e.pontosJogadores[b.num] || 0) - (e.pontosJogadores[a.num] || 0))
      .map((j) => `<li><span class="avatar-ranking">${DesafinoAvatar.avatarSvg(j.avatar)}</span> ${esc(j.nome)} — <b>${e.pontosJogadores[j.num] || 0}</b></li>`)
      .join('');
    $('progresso').textContent = e.rodada
      ? `Rodada ${e.rodada.numero}/${e.totalRodadas} · x1` : `${e.totalRodadas} rodadas · x1`;
    return;
  }
  const nomes = (n) => e.jogadores.filter((j) => j.dupla === n).map((j) => esc(j.nome)).join(' & ');
  const avatares = (n) => e.jogadores.filter((j) => j.dupla === n)
    .map((j) => `<span class="avatar-ranking">${DesafinoAvatar.avatarSvg(j.avatar)}</span>`).join('');
  $('ranking').innerHTML = [...e.duplas]
    .sort((a, b) => b.pontos - a.pontos)
    .map((d) => `<li>${avatares(d.numero)} ${nomes(d.numero) || `Dupla ${d.numero}`} — <b>${d.pontos}</b></li>`)
    .join('');
  $('progresso').textContent = e.rodada
    ? `Rodada ${e.rodada.numero}/${e.totalRodadas}` : `${e.totalRodadas} rodadas`;
}

let eventoTimeout = null;
function mostrarEvento(texto) {
  $('evento').textContent = texto;
  clearTimeout(eventoTimeout);
  eventoTimeout = setTimeout(() => { $('evento').textContent = ''; }, 5000);
}
