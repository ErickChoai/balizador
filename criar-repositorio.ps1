# Cria o repositório no GitHub, envia os arquivos e liga o GitHub Pages.
# Roda uma única vez. Depois disso, use o publicar.ps1.
#
#   .\criar-repositorio.ps1
#   .\criar-repositorio.ps1 -Nome outro-nome
#
# Exige o GitHub CLI já autenticado (gh auth login).

param([string]$Nome = "balizador")

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    throw "o GitHub CLI não está instalado. Rode: winget install --id GitHub.cli"
}

& gh auth status 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw "o GitHub CLI não está autenticado. Rode: gh auth login"
}

$conta = (& gh api user --jq .login)
Write-Host "conta autenticada: $conta" -ForegroundColor Cyan

$existe = & gh repo view "$conta/$Nome" 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "o repositório $conta/$Nome já existe; vou apenas apontar para ele." -ForegroundColor Yellow
    & git remote remove origin 2>$null
    & git remote add origin "https://github.com/$conta/$Nome.git"
    & git push -u origin main
} else {
    Write-Host "criando o repositório público $conta/$Nome..." -ForegroundColor Cyan
    & git remote remove origin 2>$null
    & gh repo create $Nome --public --source=. --remote=origin --push `
        --description "Balizamento, papeletas e conferência de erros para competições de natação"
}

Write-Host "ligando o GitHub Pages..." -ForegroundColor Cyan
$corpo = '{"source":{"branch":"main","path":"/"}}'
$corpo | & gh api -X POST "repos/$conta/$Nome/pages" --input - 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
    # já estava ligado: só atualiza a origem
    $corpo | & gh api -X PUT "repos/$conta/$Nome/pages" --input - 2>$null | Out-Null
}
if ($LASTEXITCODE -ne 0) {
    Write-Host "     não consegui ligar pela linha de comando." -ForegroundColor Yellow
    Write-Host "     Ligue em Settings > Pages: Branch = main, pasta = / (root)."
}

Write-Host ""
Write-Host "Pronto." -ForegroundColor Green
Write-Host "https://$conta.github.io/$Nome/"
Write-Host "A primeira publicação leva de um a três minutos para ficar no ar."
Write-Host ""
Write-Host "Daqui em diante, para publicar mudanças: .\publicar.ps1"
