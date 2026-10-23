param([ValidateSet('Api','Web','Test','SeedDemo','BootstrapAdmin')][string]$Mode='Api')
$ErrorActionPreference='Stop'
$taskRoot=Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $taskRoot
$taskLocalDotnet=Join-Path $taskRoot '.tools/dotnet/dotnet.exe'
$taskDotnet=if(Test-Path -LiteralPath $taskLocalDotnet){$taskLocalDotnet}else{'dotnet'}
$env:ASPNETCORE_ENVIRONMENT='Development'
switch($Mode){
  'Web' { Set-Location -LiteralPath (Join-Path $taskRoot 'frontend'); npm run dev }
  'Api' { & $taskDotnet run --project backend/League.Api/League.Api.csproj --urls http://localhost:5080 }
  'Test' { & $taskDotnet test backend/League.Tests/League.Tests.csproj }
  'SeedDemo' { & $taskDotnet run --project backend/League.Api/League.Api.csproj -- seed-demo }
  'BootstrapAdmin' { $env:ADMIN_EMAIL=Read-Host 'Administrator email';$taskPassword=Read-Host 'Administrator password' -AsSecureString;$taskPtr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($taskPassword);try{$env:ADMIN_PASSWORD=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($taskPtr);& $taskDotnet run --project backend/League.Api/League.Api.csproj -- bootstrap-admin}finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($taskPtr);Remove-Item Env:ADMIN_PASSWORD -ErrorAction SilentlyContinue} }
}
if($LASTEXITCODE -ne 0){throw "Command failed ($LASTEXITCODE)."}
