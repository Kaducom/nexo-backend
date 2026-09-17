param([switch]$SomenteVerificar)

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

function Invoke-NexoStep {
    param([string]$Command, [string[]]$Arguments)
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Falha em $Command. A publicacao foi interrompida; confira a mensagem acima." }
}

Write-Host 'NEXO: enviar o aplicativo ao GitHub e publicar no Firebase Hosting.'
Write-Host 'Destino: https://nexo-15b2c.web.app'

if (-not $SomenteVerificar) {
if (-not (Test-Path -LiteralPath 'frontend/.env.local')) {
    throw 'Configure frontend/.env.local com VITE_FIREBASE_VAPID_KEY antes de publicar. Use frontend/.env.example como modelo.'
}

Invoke-NexoStep -Command 'npm' -Arguments @('--prefix', 'frontend', 'ci', '--no-audit', '--no-fund')
Invoke-NexoStep -Command 'npm' -Arguments @('--prefix', 'frontend', 'run', 'build')
Invoke-NexoStep -Command 'git' -Arguments @('-c', "safe.directory=$PSScriptRoot", 'push', 'origin', 'main')
}

Push-Location -LiteralPath 'frontend'
try {
    if (-not $SomenteVerificar) {
    Invoke-NexoStep -Command 'firebase' -Arguments @('login')
    Invoke-NexoStep -Command 'firebase' -Arguments @('deploy', '--only', 'firestore:rules', '--project', 'nexo-15b2c')
    Invoke-NexoStep -Command 'firebase' -Arguments @('deploy', '--only', 'hosting', '--project', 'nexo-15b2c')
    }
    # Compare bytes, not decoded text: Windows PowerShell 5.1 reads UTF-8
    # without a BOM as ANSI with Get-Content, causing a false mismatch.
    $expectedHash = (Get-FileHash -LiteralPath 'dist/index.html' -Algorithm SHA256).Hash
    $downloadPath = [IO.Path]::GetTempFileName()
    try {
        Invoke-WebRequest -Uri 'https://nexo-15b2c.web.app/login' -Headers @{ 'Cache-Control' = 'no-cache' } -UseBasicParsing -OutFile $downloadPath
        $publishedHash = (Get-FileHash -LiteralPath $downloadPath -Algorithm SHA256).Hash
        if ($publishedHash -ne $expectedHash) { throw 'O HTML publicado difere do build local. Confira o deploy e o cache.' }
    } finally {
        Remove-Item -LiteralPath $downloadPath -ErrorAction SilentlyContinue
    }
    Write-Host 'Publicacao concluida: https://nexo-15b2c.web.app'
} finally {
    Pop-Location
}
