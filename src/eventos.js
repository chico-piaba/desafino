'use strict';
const fs = require('fs');

// Registrador de eventos: linha JSONL em disco + ring buffer pro painel ao vivo.
function criarRegistrador({ arquivo = null, limiteMemoria = 300 } = {}) {
  const recentes = [];
  const assinantes = [];
  // Uma gravação por vez: dois appendFile em voo não têm ordem garantida e
  // embaralhariam as linhas do log, que só serve se estiver em ordem.
  let fila = Promise.resolve();

  function registrar(tipo, dados = {}) {
    const evento = { ts: new Date().toISOString(), tipo, ...dados };
    recentes.push(evento);
    if (recentes.length > limiteMemoria) recentes.shift();
    if (arquivo) {
      const linha = JSON.stringify(evento) + '\n';
      fila = fila
        .then(() => fs.promises.appendFile(arquivo, linha))
        .catch((err) => console.error('Falha ao gravar evento:', err.message));
    }
    for (const fn of assinantes) fn(evento);
    return evento;
  }

  return {
    registrar,
    recentes: () => [...recentes],
    aoRegistrar: (fn) => assinantes.push(fn),
  };
}

module.exports = { criarRegistrador };
