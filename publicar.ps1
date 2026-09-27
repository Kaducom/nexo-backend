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

Invoke-NexoStep -Command 'npm' -Arguments @('ci', '--no-audit', '--no-fund')
# The deploy output is captured below to extract its URL. Wrangler considers
# that non-interactive, so complete browser authentication before capturing it.
if (-not $env:CLOUDFLARE_API_TOKEN -and -not $env:CLOUDFLARE_API_KEY) {
    Write-Host 'Autorizando Cloudflare no navegador. Entre na conta que possui nexo-backend e clique em Allow/Permitir.'
    Invoke-NexoStep -Command 'npx' -Arguments @('wrangler', 'login')
}
Write-Host 'Publicando o agendador no Cloudflare.'
$previousPreference = $ErrorActionPreference
try {
    $ErrorActionPreference = 'Continue'
    $backendOutput = (& npx wrangler deploy 2>&1 | Out-String)
    $backendExit = $LASTEXITCODE
} finally { $ErrorActionPreference = $previousPreference }
Write-Host $backendOutput
if ($backendExit -ne 0) { throw 'Falha ao publicar o backend no Cloudflare. O frontend nao foi publicado.' }
$backendMatch = [regex]::Match($backendOutput, 'https://nexo-backend\.[a-zA-Z0-9-]+\.workers\.dev')
if (-not $backendMatch.Success) { throw 'Nao foi possivel identificar a URL workers.dev do backend. Confira a saida do Wrangler.' }
$env:VITE_NEXO_API_URL = $backendMatch.Value
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
