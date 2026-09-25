param(
    [string]$ExpectedTag,
    [string]$ExpectedRepository
)
$ErrorActionPreference = 'Stop'
$OutputEncoding = [Console]::OutputEncoding = [Text.UTF8Encoding]::new()
[Console]::InputEncoding = [Text.UTF8Encoding]::new()
$env:PYTHONUTF8 = '1'
$env:PYTHONIOENCODING = 'utf-8'
$projectRoot = Split-Path -Parent $PSScriptRoot
$metadata = Get-Content -Raw -LiteralPath (Join-Path $projectRoot 'package.json') | ConvertFrom-Json
$manifest = Get-Content -Raw -LiteralPath (Join-Path $projectRoot 'packages/renderer-plugin/package/manifest.json') | ConvertFrom-Json
$version = [string]$metadata.version
if ($version -cnotmatch '^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$') { throw 'Only stable three-part release versions are supported.' }
$null = [version]$version
if ($manifest.version -cne $version) { throw 'Package and manifest versions differ.' }
if ($ExpectedTag -and $ExpectedTag -cne "v$version") { throw 'Release tag must match the package version.' }
if ($ExpectedRepository -and $manifest.update.repository -cne $ExpectedRepository) { throw 'Release repository must match the declared update source.' }
if ($manifest.update.provider -cne 'github-releases' -or $manifest.update.asset -cne 'bridge-{version}.zip') { throw 'Unsupported Loader update declaration.' }
$assetName = $manifest.update.asset.Replace('{version}', $version)
$archivePath = Join-Path $projectRoot "dist/$assetName"
$hash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
$checksum = (Get-Content -Raw -LiteralPath "$archivePath.sha256").TrimEnd("`r", "`n")
if ($checksum -cne "$hash  $assetName") { throw 'Release checksum must contain exactly one matching filename and SHA-256 record.' }

$archive = [IO.Compression.ZipFile]::OpenRead($archivePath)
try {
    $entries = @{}
    [long]$bytes = 0
    foreach ($entry in $archive.Entries) {
        $name = $entry.FullName.Replace('\', '/')
        if ($name.EndsWith('/')) { continue }
        if ($entries.ContainsKey($name) -or $name.StartsWith('/') -or $name.Contains('../') -or $name.Contains(':')) { throw 'Duplicate or unsafe archive entry.' }
        $entries[$name] = $entry
        $bytes += $entry.Length
    }
    if ($entries.Count -gt 256 -or $bytes -gt 8MB) { throw 'Package exceeds Loader limits.' }
    $skillPath = "skills/$($manifest.agentSkill)"
    foreach ($required in @('manifest.json', 'index.js', 'README.md', 'LICENSE', 'NOTICE.md', "$skillPath/SKILL.md", "$skillPath/references/protocol.md", "$skillPath/scripts/invoke-bridge.ps1", "$skillPath/scripts/wait-turn.ps1")) {
        if (-not $entries.ContainsKey($required)) { throw "Missing release file: $required" }
    }
    $reader = [IO.StreamReader]::new($entries['manifest.json'].Open(), [Text.Encoding]::UTF8)
    try { $packaged = $reader.ReadToEnd() | ConvertFrom-Json } finally { $reader.Dispose() }
    foreach ($field in @('id', 'version', 'schemaVersion', 'agentSkill')) {
        if ($packaged.$field -cne $manifest.$field) { throw "Packaged manifest differs: $field" }
    }
    foreach ($field in @('provider', 'repository', 'asset')) {
        if ($packaged.update.$field -cne $manifest.update.$field) { throw "Packaged update source differs: $field" }
    }
}
finally { $archive.Dispose() }
Write-Output "BRIDGE_RELEASE_PACKAGE_PASS $assetName"
