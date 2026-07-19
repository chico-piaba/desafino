'use strict';
const socket = io();
const $ = (id) => document.getElementById(id);
const NOME_MODO = { cantarolar: 'CANTAROLANDO 🎤', mimica: 'MÍMICA 🎭' };
const NOME_DICA = { cantor: 'Cantor', ano: 'Ano', quantidadePalavras: 'Nº de palavras' };

fetch('/api/entrada').then((r) => r.json()).then(({ url, qr }) => {
  $('qr').src = qr;
  $('url-entrada').textContent = url;
});

$('btn-iniciar').onclick = () => socket.emit('iniciarPartida');
socket.on('erro', (msg) => mostrarEvento(`⚠️ ${msg}`));
socket.on('tick', (t) => {
  $('tempo').textContent = t;
  $('timer').classList.toggle('urgente', t <= 15);
});

let dicasVistas = 0;
socket.on('estado', (e) => {
  $('aviso').classList.toggle('oculto', !e.aviso);
  $('aviso').textContent = e.aviso || '';
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
    const nomes = e.jogadores.filter((j) => j.dupla === n).map((j) => j.nome);
    return nomes.length ? `<p><b>Dupla ${n}:</b> ${nomes.join(' & ')}</p>` : '';
  });
  $('lobby-duplas').innerHTML = porDupla.join('') || '<p>Aguardando jogadores…</p>';
}

function renderRodada(e) {
  mostrarTela('tela-rodada');
  const r = e.rodada;
  $('rodada-info').textContent = `Rodada ${r.numero} de ${e.totalRodadas} — Dupla ${r.dupla}`;
  $('modo').textContent = r.fase === 'aguardandoInicio' ? 'PREPARANDO…' : NOME_MODO[r.modo];
  $('modo').className = `pill modo ${r.modo}`;
  $('apresentador').textContent = r.apresentador;
  $('adivinhador').textContent = r.adivinhador;
  $('valor').textContent = `${r.valorAtual} pts`;
  if (r.fase === 'aguardandoInicio') $('tempo').textContent = e.duracaoSegundos;
  if (r.dicasCompradas.length > dicasVistas) {
    const d = r.dicasCompradas[r.dicasCompradas.length - 1];
    mostrarEvento(`💡 Dica comprada: ${NOME_DICA[d.tipo]} (−${d.custo} pts)`);
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
  $('resultado-pontos').textContent = `+${r.pontosGanhos} pts para a Dupla ${r.dupla}`;
}

function renderFim(e) {
  mostrarTela('tela-fim');
  const ordenadas = [...e.duplas].sort((a, b) => b.pontos - a.pontos);
  const melhor = ordenadas[0].pontos;
  const campeas = ordenadas.filter((d) => d.pontos === melhor);
  $('podio').innerHTML = campeas.length > 1
    ? `Empate! ${campeas.map((d) => `Dupla ${d.numero}`).join(' e ')} com ${melhor} pts`
    : `Campeã: Dupla ${campeas[0].numero} com ${melhor} pts 🏆`;
}

function renderRanking(e) {
  if (e.fase === 'lobby') renderLobbyDuplas(e);
  const nomes = (n) => e.jogadores.filter((j) => j.dupla === n).map((j) => j.nome).join(' & ');
  $('ranking').innerHTML = [...e.duplas]
    .sort((a, b) => b.pontos - a.pontos)
    .map((d) => `<li>${nomes(d.numero) || `Dupla ${d.numero}`} — <b>${d.pontos}</b></li>`)
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
