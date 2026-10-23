param([string]$Email)
$ErrorActionPreference='Stop'
Set-Location -LiteralPath (Split-Path $PSScriptRoot -Parent)
if (-not $Email) { $Email=Read-Host 'Administrator email' }
$taskSecurePassword=Read-Host 'Administrator password (12+ characters, upper/lowercase, number, symbol)' -AsSecureString
$taskPointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($taskSecurePassword)
try {
    $env:ADMIN_EMAIL=$Email
    $env:ADMIN_PASSWORD=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($taskPointer)
    docker compose run --rm -e ADMIN_EMAIL -e ADMIN_PASSWORD backend bootstrap-admin
    if ($LASTEXITCODE -ne 0) { throw 'Administrator bootstrap failed.' }
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($taskPointer)
    Remove-Item Env:ADMIN_PASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:ADMIN_EMAIL -ErrorAction SilentlyContinue
}
