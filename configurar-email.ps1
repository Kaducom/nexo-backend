param([string]$GoogleClientJson)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

# No credentials are written to the repository or printed to the console.
function Set-NexoSecret([string]$Name, [string]$Value) {
    $Value | & npx wrangler secret put $Name
    if ($LASTEXITCODE -ne 0) { throw "Nao foi possivel configurar $Name." }
}

$google = $null
if ($GoogleClientJson) {
    $google = (Get-Content -LiteralPath $GoogleClientJson -Raw | ConvertFrom-Json).web
    if (-not $google.client_id -or -not $google.client_secret) { throw 'Escolha o JSON de um cliente OAuth do tipo Aplicativo da Web.' }
    $redirects = @($google.redirect_uris | Where-Object { $_ -match '^https://nexo-backend\.[a-zA-Z0-9-]+\.workers\.dev/mail/gmail/callback$' })
    if ($redirects.Count -ne 1) { throw 'Cadastre exatamente um retorno https://nexo-backend.SEUSUBDOMINIO.workers.dev/mail/gmail/callback no cliente Google e baixe o JSON novamente.' }
}

Write-Host 'Configurando e-mails no backend NEXO. Use a conta Cloudflare que possui nexo-backend.'
$raw = & npx wrangler secret list --format json
if ($LASTEXITCODE -ne 0) { throw 'Entre no Cloudflare com npx wrangler login e execute novamente.' }
$secrets = ($raw -join "`n") | ConvertFrom-Json
if ('MAIL_ENCRYPTION_KEY' -notin @($secrets | ForEach-Object { $_.name })) {
    $bytes = New-Object byte[] 32
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    $key = ([BitConverter]::ToString($bytes)).Replace('-', '').ToLowerInvariant()
    Set-NexoSecret 'MAIL_ENCRYPTION_KEY' $key
    $key = $null
    [Array]::Clear($bytes, 0, $bytes.Length)
} else { Write-Host 'Chave de criptografia existente preservada.' }

if ($google) {
    Set-NexoSecret 'GMAIL_CLIENT_ID' $google.client_id
    Set-NexoSecret 'GMAIL_CLIENT_SECRET' $google.client_secret
    Set-NexoSecret 'GMAIL_REDIRECT_URI' $redirects[0]
    $google = $null
    Write-Host 'Gmail habilitado. Autorize sua conta em Configuracoes > E-mails no NEXO publicado.'
}
Write-Host 'iCloud habilitado. Conecte seu endereco e senha especifica de app em Configuracoes > E-mails.'
Write-Host 'Caso ainda nao tenha publicado esta versao, execute publicar.ps1.'
