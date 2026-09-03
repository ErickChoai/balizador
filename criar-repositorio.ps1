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

# o gh pode não estar no PATH da sessão logo após a instalação
$gh = (Get-Command gh -ErrorAction SilentlyContinue).Source
if (-not $gh) {
    foreach ($c in @("$env:ProgramFiles\GitHub CLI\gh.exe",
                     "$env:LOCALAPPDATA\Programs\GitHub CLI\gh.exe")) {
        if (Test-Path $c) { $gh = $c; break }
    }
}
if (-not $gh) {
    throw "o GitHub CLI não está instalado. Rode: winget install --id GitHub.cli"
}
Set-Alias gh $gh -Scope Script

# o PowerShell trata a saída de erro de um .exe como falha; aqui isso atrapalha,
# porque "repositório não encontrado" é uma resposta legítima
$ErrorActionPreference = "Continue"

& gh auth status *>$null
if ($LASTEXITCODE -ne 0) {
    throw "o GitHub CLI não está autenticado. Rode: gh auth login"
}

$conta = (& gh api user --jq .login)
Write-Host "conta autenticada: $conta" -ForegroundColor Cyan

& gh repo view "$conta/$Nome" *>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "o repositório $conta/$Nome já existe; vou apenas apontar para ele." -ForegroundColor Yellow
    & git remote remove origin *>$null
    & git remote add origin "https://github.com/$conta/$Nome.git"
    & git push -u origin main
} else {
    Write-Host "criando o repositório público $conta/$Nome..." -ForegroundColor Cyan
    & git remote remove origin *>$null
    & gh repo create $Nome --public --source=. --remote=origin --push `
        --description "Balizamento, papeletas e conferencia de erros para competicoes de natacao"
}
if ($LASTEXITCODE -ne 0) { throw "não consegui criar ou enviar o repositório." }

Write-Host "ligando o GitHub Pages..." -ForegroundColor Cyan
# o corpo vai por arquivo: o pipe do PowerShell corrompe o JSON na entrada do gh
$tmp = Join-Path $env:TEMP "balizador-pages.json"
[System.IO.File]::WriteAllText($tmp, '{"source":{"branch":"main","path":"/"}}',
                               (New-Object System.Text.UTF8Encoding($false)))
& gh api -X POST "repos/$conta/$Nome/pages" --input $tmp *>$null
if ($LASTEXITCODE -ne 0) {
    # já estava ligado: só atualiza a origem
    & gh api -X PUT "repos/$conta/$Nome/pages" --input $tmp *>$null
}
Remove-Item $tmp -ErrorAction SilentlyContinue
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
