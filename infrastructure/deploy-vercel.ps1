param([string]$BackendUrl)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path $PSScriptRoot -Parent
if (-not $BackendUrl) {
    $addressFile = Join-Path $taskRoot '.tools/vercel-backend-url.txt'
    if (-not (Test-Path -LiteralPath $addressFile)) { throw 'Pass -BackendUrl with the backend HTTPS address.' }
    $BackendUrl = (Get-Content -LiteralPath $addressFile -Raw).Trim()
}
$BackendUrl = $BackendUrl.TrimEnd('/')
if ($BackendUrl -notmatch '^https://') { throw 'The Vercel backend address must use HTTPS.' }
$league = Invoke-RestMethod "$BackendUrl/api/v1/public" -TimeoutSec 20
if ($null -eq $league.teams) { throw 'The backend did not return league data.' }
Push-Location -LiteralPath (Join-Path $taskRoot 'frontend')
try {
    $taskPreviousAssetOrigin = $env:LEAGUE_ASSET_ORIGIN
    try {
        $env:LEAGUE_ASSET_ORIGIN = $BackendUrl
        npm run optimize:images
        if ($LASTEXITCODE -ne 0) { throw 'Failed to prepare optimized public images.' }
    } finally { $env:LEAGUE_ASSET_ORIGIN = $taskPreviousAssetOrigin }
    npx --yes vercel@latest env add BACKEND_URL --environment production --value $BackendUrl --no-sensitive --project hhcbasketballleague --yes --force
    if ($LASTEXITCODE -ne 0) { throw 'Failed to save the Vercel backend address.' }
    npx --yes vercel@latest env add NEXT_PUBLIC_REALTIME_URL --environment production --value "$BackendUrl/hubs/games" --no-sensitive --project hhcbasketballleague --yes --force
    if ($LASTEXITCODE -ne 0) { throw 'Failed to save the Vercel realtime address.' }
    npx --yes vercel@latest deploy --project hhcbasketballleague --create-if-missing --yes --prod --build-env "BACKEND_URL=$BackendUrl" --build-env "NEXT_PUBLIC_REALTIME_URL=$BackendUrl/hubs/games" --env "BACKEND_URL=$BackendUrl" --env "NEXT_PUBLIC_REALTIME_URL=$BackendUrl/hubs/games" --logs
    if ($LASTEXITCODE -ne 0) { throw 'Vercel deployment failed.' }
} finally { Pop-Location }
