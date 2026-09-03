# Reconstrói o app e publica no GitHub Pages.
#
#   .\publicar.ps1                      -> mensagem automática
#   .\publicar.ps1 "corrige as raias"   -> mensagem própria
#
# Antes da primeira vez, rode o criar-repositorio.ps1.

param([string]$Mensagem = "")

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "1/3  reconstruindo o index.html..." -ForegroundColor Cyan
Set-Location "$PSScriptRoot\app"
if (-not (Test-Path "node_modules")) {
    Write-Host "     instalando dependências (só na primeira vez)..."
    & npm install --silent --no-audit --no-fund
}
& node montar.js
Set-Location $PSScriptRoot

Write-Host "2/3  registrando a mudança..." -ForegroundColor Cyan
& git add -A
$mudou = & git status --porcelain
if (-not $mudou) {
    Write-Host "     nada mudou desde a última publicação." -ForegroundColor Yellow
    exit 0
}
if (-not $Mensagem) {
    $Mensagem = "Atualiza o Balizador — " + (Get-Date -Format "dd/MM/yyyy HH:mm")
}
& git commit -q -m $Mensagem

Write-Host "3/3  enviando para o GitHub..." -ForegroundColor Cyan
& git push -q origin main
if ($LASTEXITCODE -ne 0) { throw "o push falhou — confira a autenticação com: gh auth status" }

$url = & git remote get-url origin
$usuario = ($url -replace '.*github\.com[:/]', '') -replace '/.*', ''
$repo = ($url -replace '.*/', '') -replace '\.git$', ''
Write-Host ""
Write-Host "Publicado." -ForegroundColor Green
Write-Host "https://$usuario.github.io/$repo/"
Write-Host "O GitHub leva de um a dois minutos para atualizar a página."
