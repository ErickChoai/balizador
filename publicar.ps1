# Reconstroi o app e publica no GitHub Pages.
#
#   .\publicar.ps1
#   .\publicar.ps1 "corrige as raias"
#
# Antes da primeira vez, rode o criar-repositorio.ps1.
# Sem acentos de proposito: o PowerShell 5.1 le .ps1 sem BOM como ANSI.

param([string]$Mensagem = "")

# o git escreve avisos na saida de erro; com "Stop" isso viraria falha fatal
$ErrorActionPreference = "Continue"
Set-Location $PSScriptRoot

Write-Host "1/3  reconstruindo o index.html..." -ForegroundColor Cyan
Set-Location "$PSScriptRoot\app"
if (-not (Test-Path "node_modules")) {
    Write-Host "     instalando dependencias (so na primeira vez)..."
    & npm install --silent --no-audit --no-fund
}
& node montar.js
if ($LASTEXITCODE -ne 0) { Write-Host "falhou ao montar o index.html" -ForegroundColor Red; exit 1 }
Set-Location $PSScriptRoot

Write-Host "2/3  registrando a mudanca..." -ForegroundColor Cyan
& git add -A
$mudou = & git status --porcelain
if (-not $mudou) {
    Write-Host "     nada mudou desde a ultima publicacao." -ForegroundColor Yellow
    exit 0
}
if (-not $Mensagem) {
    $agora = Get-Date -Format "dd/MM/yyyy HH:mm"
    $Mensagem = "Atualiza o Balizador - $agora"
}
& git commit -q -m $Mensagem
if ($LASTEXITCODE -ne 0) { Write-Host "falhou ao commitar" -ForegroundColor Red; exit 1 }

Write-Host "3/3  enviando para o GitHub..." -ForegroundColor Cyan
& git push -q origin main
if ($LASTEXITCODE -ne 0) { Write-Host "o push falhou - confira com: gh auth status" -ForegroundColor Red; exit 1 }

$url = & git remote get-url origin
$usuario = ($url -replace '.*github\.com[:/]', '') -replace '/.*', ''
$repo = ($url -replace '.*/', '') -replace '\.git$', ''
Write-Host ""
Write-Host "Publicado." -ForegroundColor Green
Write-Host "https://$usuario.github.io/$repo/"
Write-Host "O GitHub leva de um a dois minutos para atualizar a pagina."
