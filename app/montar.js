/* Monta o BALIZADOR.html: um arquivo único, com tudo embutido, que funciona
   offline com duplo clique.
       node montar.js
*/
const fs = require("fs");
const path = require("path");

const AQUI = __dirname;
const ler = (p) => fs.readFileSync(path.join(AQUI, p), "utf8");

const partes = {
  xlsx: ler("node_modules/xlsx/dist/xlsx.full.min.js"),
  jspdf: ler("node_modules/jspdf/dist/jspdf.umd.min.js"),
  core: ler("balizador.core.js"),
  dados: ler("balizador.dados.js"),
  saida: ler("balizador.saida.js"),
  app: ler("balizador.app.js"),
  css: ler("estilo.css"),
  corpo: ler("corpo.html"),
};

// as fontes são carregadas da internet quando houver; sem rede, cai no
// system-ui e o app continua funcionando igual
const FONTES =
  '<link rel="preconnect" href="https://fonts.googleapis.com">' +
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?' +
  'family=Archivo:wght@500;600;700&family=Asap:wght@400;500;600&' +
  'family=Roboto+Mono:wght@400;500&display=swap">';

const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Balizador, natação</title>
<meta name="description" content="Monta balizamento, papeletas de raia e confere erros de inscrição em competições de natação. Roda inteiramente no seu computador.">
${FONTES}
<style>
${partes.css}
</style>
</head>
<body>
${partes.corpo}
<script>${partes.xlsx}</script>
<script>${partes.jspdf}</script>
<script>${partes.core}</script>
<script>${partes.dados}</script>
<script>${partes.saida}</script>
<script>${partes.app}</script>
</body>
</html>`;

// o site publicado usa index.html; a cópia offline fica na pasta do projeto
const destinos = [path.join(AQUI, "..", "index.html")];
const offline = path.join(AQUI, "..", "..", "BALIZADOR.html");
if (fs.existsSync(path.dirname(offline))) destinos.push(offline);

for (const d of destinos) {
  fs.writeFileSync(d, html, "utf8");
  console.log(`${path.basename(d)}: ${(fs.statSync(d).size / 1024).toFixed(0)} KB`);
  console.log("   " + d);
}
