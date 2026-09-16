$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

function Invoke-NexoStep {
    param([string]$Command, [string[]]$Arguments)
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Falha em $Command. A publicacao foi interrompida; confira a mensagem acima." }
}

Write-Host 'NEXO: enviar o aplicativo ao GitHub e publicar no Firebase Hosting.'
Write-Host 'Destino: https://nexo-15b2c.web.app'

if (-not (Test-Path -LiteralPath 'frontend/.env.local')) {
    throw 'Configure frontend/.env.local com VITE_FIREBASE_VAPID_KEY antes de publicar. Use frontend/.env.example como modelo.'
}

Invoke-NexoStep -Command 'npm' -Arguments @('--prefix', 'frontend', 'ci', '--no-audit', '--no-fund')
Invoke-NexoStep -Command 'npm' -Arguments @('--prefix', 'frontend', 'run', 'build')
Invoke-NexoStep -Command 'git' -Arguments @('-c', "safe.directory=$PSScriptRoot", 'push', 'origin', 'main')

Push-Location -LiteralPath 'frontend'
try {
    Invoke-NexoStep -Command 'firebase' -Arguments @('login')
    Invoke-NexoStep -Command 'firebase' -Arguments @('deploy', '--only', 'hosting', '--project', 'nexo-15b2c')
    $published = Invoke-WebRequest -Uri 'https://nexo-15b2c.web.app/login' -Headers @{ 'Cache-Control' = 'no-cache' } -UseBasicParsing
    if ($published.StatusCode -ne 200) { throw 'O deploy terminou, mas a verificacao HTTP falhou.' }
    $expected = Get-Content -LiteralPath 'dist/index.html' -Raw
    if ($published.Content.Trim() -ne $expected.Trim()) { throw 'O site respondeu, mas o HTML publicado ainda difere do build local. Confira o deploy e o cache.' }
    Write-Host 'Publicacao concluida: https://nexo-15b2c.web.app'
} finally {
    Pop-Location
}
