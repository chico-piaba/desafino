'use strict';
const path = require('path');
const express = require('express');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

if (require.main === module) {
  const porta = process.env.PORT || 3000;
  app.listen(porta, () => console.log(`DESAFINO no ar: http://localhost:${porta}/display/`));
}

module.exports = { app };
