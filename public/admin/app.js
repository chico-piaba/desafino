'use strict';
const $ = (id) => document.getElementById(id);

function esc(texto) {
  const div = document.createElement('div');
  div.textContent = String(texto);
  return div.innerHTML;
}

async function carregar() {
  const musicas = await (await fetch('/api/musicas')).json();
  $('total').textContent = musicas.length;
  $('lista').innerHTML = musicas
    .map((m) => `<tr><td>${esc(m.titulo)}</td><td>${esc(m.artista)}</td><td>${m.ano}</td>
      <td><button class="btn btn-error" data-id="${m.id}" style="padding:6px 14px">Remover</button></td></tr>`)
    .join('');
  for (const btn of $('lista').querySelectorAll('button[data-id]')) {
    btn.onclick = async () => {
      await fetch(`/api/musicas/${btn.dataset.id}`, { method: 'DELETE' });
      carregar();
    };
  }
}

$('btn-adicionar').onclick = async () => {
  const resposta = await fetch('/api/musicas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      titulo: $('campo-titulo').value,
      artista: $('campo-artista').value,
      ano: $('campo-ano').value,
    }),
  });
  if (!resposta.ok) return mostrarErro((await resposta.json()).erro);
  $('campo-titulo').value = $('campo-artista').value = $('campo-ano').value = '';
  carregar();
};

$('btn-buscar').onclick = async () => {
  $('resultados-wiki').innerHTML = '<p>Buscando…</p>';
  const resposta = await fetch(`/api/wikipedia?q=${encodeURIComponent($('campo-busca').value)}`);
  if (!resposta.ok) {
    $('resultados-wiki').innerHTML = '';
    return mostrarErro((await resposta.json()).erro + ' — preencha o formulário manualmente.');
  }
  const resultados = await resposta.json();
  $('resultados-wiki').innerHTML = resultados
    .map((r, i) => `<div class="resultado-wiki">
      <span><b>${esc(r.titulo)}</b>${r.artista ? ` — ${esc(r.artista)}` : ''}${r.ano ? ` (${r.ano})` : ''}</span>
      <button class="btn" data-i="${i}" style="padding:6px 14px">Usar</button></div>`)
    .join('') || '<p>Nada encontrado.</p>';
  for (const btn of $('resultados-wiki').querySelectorAll('button[data-i]')) {
    btn.onclick = () => {
      const r = resultados[Number(btn.dataset.i)];
      $('campo-titulo').value = r.titulo;
      $('campo-artista').value = r.artista || '';
      $('campo-ano').value = r.ano || '';
    };
  }
};

let erroTimeout = null;
function mostrarErro(msg) {
  $('erro').textContent = msg;
  clearTimeout(erroTimeout);
  erroTimeout = setTimeout(() => { $('erro').textContent = ''; }, 6000);
}

carregar();
