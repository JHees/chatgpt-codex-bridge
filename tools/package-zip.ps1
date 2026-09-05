param(
    [Parameter(Mandatory)][string]$Source,
    [Parameter(Mandatory)][string]$Destination
)
$ErrorActionPreference = 'Stop'
$OutputEncoding = [Console]::OutputEncoding = [Text.UTF8Encoding]::new()
[Console]::InputEncoding = [Text.UTF8Encoding]::new()
$env:PYTHONUTF8 = '1'
$env:PYTHONIOENCODING = 'utf-8'
$packageSource = (Resolve-Path -LiteralPath $Source).Path
if (-not (Test-Path -LiteralPath (Join-Path $packageSource 'manifest.json') -PathType Leaf)) { throw 'Package manifest is missing.' }
Compress-Archive -LiteralPath (Get-ChildItem -LiteralPath $packageSource | ForEach-Object FullName) -DestinationPath $Destination -CompressionLevel Optimal
$packageHash = (Get-FileHash -LiteralPath $Destination -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText("$Destination.sha256", "$packageHash  $([IO.Path]::GetFileName($Destination))`n", [Text.UTF8Encoding]::new($false))
