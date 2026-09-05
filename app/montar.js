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
  exemplos: ler("balizador.exemplos.js"),
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
  'family=Bricolage+Grotesque:opsz,wght@12..96,600..800&' +
  'family=Instrument+Sans:wght@400..600&' +
  'family=JetBrains+Mono:wght@400..500&display=swap">';

/* O ícone da aba, desenhado aqui mesmo e embutido como data URI: assim o
   arquivo continua sendo um só e funciona offline, sem o mundinho cinza que o
   navegador põe quando não acha ícone nenhum. É o mesmo quadradinho BZ da
   tela, com o azul de água do app. */
const ICONE =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
  '<rect width="64" height="64" rx="14" fill="#0B7285"/>' +
  '<text x="32" y="33" text-anchor="middle" dominant-baseline="central" ' +
  'font-family="Verdana,DejaVu Sans,sans-serif" font-weight="bold" ' +
  'font-size="27" fill="#ffffff">BZ</text></svg>';
const LINK_ICONE =
  '<link rel="icon" href="data:image/svg+xml,' + encodeURIComponent(ICONE) + '">' +
  '<link rel="apple-touch-icon" href="data:image/svg+xml,' +
  encodeURIComponent(ICONE) + '">' +
  '<meta name="theme-color" content="#0B7285">';

const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Balizador, natação</title>
${LINK_ICONE}
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
<script>${partes.exemplos}</script>
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
