/* Monta o Balizador em arquivo único, com tudo embutido.
       node montar.js

   Sai em três lugares:
   - site/app/index.html, o app no GitHub Pages, sem IA (a página de entrada,
     site/index.html, é escrita à mão e este script não mexe nela)
   - BALIZADOR.html, a cópia offline da pasta do projeto, que abre com duplo
     clique e funciona sem internet
   - BALIZADOR-CLAUDE.html, a versão que é publicada como Artifact no
     claude.ai. É lá, e só lá, que a etapa de IA e a conversa funcionam, com
     a conta Claude de quem abre. Ela vai sem <html>, <head> e <body>,
     porque o claude.ai põe os dele em volta.
*/
const fs = require("fs");
const path = require("path");

const AQUI = __dirname;
// o BOM do começo de um arquivo vira uma linha vazia no HTML: no corpo.html, era uma faixa de 28 px acima do topo
const ler = (p) => fs.readFileSync(path.join(AQUI, p), "utf8").replace(/^﻿/, "");

const partes = {
  xlsx: ler("node_modules/xlsx/dist/xlsx.full.min.js"),
  jspdf: ler("node_modules/jspdf/dist/jspdf.umd.min.js"),
  core: ler("balizador.core.js"),
  dados: ler("balizador.dados.js"),
  saida: ler("balizador.saida.js"),
  exemplos: ler("balizador.exemplos.js"),
  ia: ler("balizador.ia.js"),
  regras: ler("balizador.regras.js"),
  app: ler("balizador.app.js"),
  conversa: ler("balizador.conversa.js"),
  css: ler("estilo.css"),
  corpo: ler("corpo.html"),
};

// um "</script" no meio do código fecharia a tag antes da hora; "<\/script"
// é o mesmo texto para o JavaScript e não fecha nada para o HTML
for (const k of Object.keys(partes)) {
  if (k !== "css" && k !== "corpo") partes[k] = partes[k].replace(/<\/script/gi, "<\\/script");
}

/* As tabelas de página de código do SheetJS trazem o caractere U+FFFD dentro
   de textos. O claude.ai recusa publicar um arquivo com ele cru, então ele vai
   escrito como �, que para o JavaScript é exatamente o mesmo caractere. */
partes.xlsx = partes.xlsx.replace(/�/g, "\\uFFFD");

// as fontes são carregadas da internet quando houver; sem rede, cai no
// system-ui e o app continua funcionando igual
const FONTES =
  '<link rel="preconnect" href="https://fonts.googleapis.com">' +
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?' +
  'family=Atkinson+Hyperlegible+Mono:wght@400;600&' +
  'family=Atkinson+Hyperlegible+Next:wght@400;600;700&' +
  'family=Big+Shoulders:wght@700;800&display=swap">';

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

const SCRIPTS = `<script>${partes.xlsx}</script>
<script>${partes.jspdf}</script>
<script>${partes.core}</script>
<script>${partes.dados}</script>
<script>${partes.saida}</script>
<script>${partes.exemplos}</script>
<script>${partes.ia}</script>
<script>${partes.regras}</script>
<script>${partes.app}</script>
<script>${partes.conversa}</script>`;

const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Balizador, natação</title>
${LINK_ICONE}
<meta name="description" content="Monta balizamento, papeletas de raia e confere erros de inscrição em competições de natação. Roda no navegador. No claude.ai, a etapa opcional de IA e a conversa usam a conta Claude de quem abre.">
${FONTES}
<style>
${partes.css}
</style>
</head>
<body>
${partes.corpo}
${SCRIPTS}
</body>
</html>`;

// o claude.ai procura o título nos primeiros 8 KB: ele vem antes de tudo
const artifact = `<title>Balizador</title>
<script>document.documentElement.classList.add("noite")</script>
${FONTES}
<style>
${partes.css}
</style>
${partes.corpo}
${SCRIPTS}
`;

// o app publicado fica em app/index.html; a cópia offline e a do claude.ai ficam na
// pasta do projeto, fora do repositório
const destinos = [[path.join(AQUI, "index.html"), html]];
const pasta = path.join(AQUI, "..", "..");
if (fs.existsSync(pasta)) {
  destinos.push([path.join(pasta, "BALIZADOR.html"), html]);
  destinos.push([path.join(pasta, "BALIZADOR-CLAUDE.html"), artifact]);
}

for (const [d, conteudo] of destinos) {
  fs.writeFileSync(d, conteudo, "utf8");
  console.log(`${path.basename(d)}: ${(fs.statSync(d).size / 1024).toFixed(0)} KB`);
  console.log("   " + d);
}
