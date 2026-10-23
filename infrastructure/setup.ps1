param([switch]$Demo)
$ErrorActionPreference='Stop'
$taskRoot = Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $taskRoot
if (-not (Test-Path -LiteralPath '.env')) {
    $taskDbPassword=[Convert]::ToHexString([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(24))
    $taskStoragePassword=[Convert]::ToHexString([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(24))
    [System.IO.File]::WriteAllLines((Join-Path $taskRoot '.env'),@("POSTGRES_PASSWORD=$taskDbPassword",'STORAGE_ACCESS_KEY=league-local',"STORAGE_SECRET_KEY=$taskStoragePassword"))
}
docker compose up -d --build
if ($LASTEXITCODE -ne 0) { throw 'Docker Compose failed.' }
if ($Demo) {
    docker compose run --rm backend seed-demo
    if ($LASTEXITCODE -ne 0) { throw 'Demo seeding failed; it requires an empty database.' }
}
Write-Host 'League app: http://localhost:3000'
Write-Host 'Run infrastructure/bootstrap-admin.ps1 to create an administrator.'
