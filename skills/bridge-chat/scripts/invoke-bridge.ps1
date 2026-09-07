[CmdletBinding()]
param(
    [Parameter(Mandatory)][ValidateSet('status', 'exchange', 'finish')][string]$Operation,
    [Parameter(ValueFromPipeline)][string]$PayloadJson,
    [switch]$Stdin,
    [switch]$SingleRead,
    [string]$InstallRoot
)
begin {
    $ErrorActionPreference = 'Stop'
    if ($PSVersionTable.PSVersion.Major -lt 7) { throw 'POWERSHELL_7_REQUIRED: Run this helper in PowerShell 7 (pwsh), not Windows PowerShell.' }
    $OutputEncoding = [Console]::OutputEncoding = [Text.UTF8Encoding]::new()
    [Console]::InputEncoding = [Text.UTF8Encoding]::new()
    $env:PYTHONUTF8 = '1'
    $env:PYTHONIOENCODING = 'utf-8'
    $bridgeInputs = [Collections.Generic.List[string]]::new()
}
process { if ($PSBoundParameters.ContainsKey('PayloadJson')) { $bridgeInputs.Add($PayloadJson) } }
end {
    if ($Stdin) {
        if ($bridgeInputs.Count -ne 0) { throw 'BRIDGE_INPUT_COUNT: Choose PayloadJson/pipeline OR Stdin, not both.' }
        if (-not [Console]::IsInputRedirected) { throw 'BRIDGE_INPUT_COUNT: Stdin requires redirected process input.' }
        $bridgeInputs.Add([Console]::In.ReadToEnd())
    }
    if ($bridgeInputs.Count -ne 1) { throw 'BRIDGE_INPUT_COUNT: Provide one complete JSON object, not multiple requests.' }
    $bridgeJson = $bridgeInputs[0]
    if ([Text.Encoding]::UTF8.GetByteCount($bridgeJson) -gt 60KB) { throw 'REQUEST_TOO_LARGE: Leave space for the Loader envelope.' }
    try { $bridgePayload = ConvertFrom-Json -InputObject $bridgeJson -AsHashtable -Depth 64 }
    catch { throw 'INVALID_REQUEST: Input is not valid JSON.' }
    if ($bridgePayload -isnot [Collections.IDictionary]) { throw 'INVALID_REQUEST: Input must be one JSON object.' }
    if (-not $InstallRoot) { $InstallRoot = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'Programs/CodexScriptLoader' }
    $bridgeRoot = [IO.Path]::GetFullPath($InstallRoot)
    $bridgePointer = Join-Path $bridgeRoot 'active.json'
    try { $bridgePointerText = Get-Content -LiteralPath $bridgePointer -Raw -Encoding utf8 }
    catch [UnauthorizedAccessException] { throw 'LOADER_ACCESS_DENIED: No command was sent. Request tool approval to read the installed Loader and run this same helper.' }
    catch {
        if ($_.CategoryInfo.Category -eq 'PermissionDenied') { throw 'LOADER_ACCESS_DENIED: No command was sent. Request tool approval for this same helper.' }
        throw 'LOADER_UNAVAILABLE: The verified installation has no readable active pointer.'
    }
    try { $bridgeActive = ConvertFrom-Json -InputObject $bridgePointerText -AsHashtable }
    catch { throw 'LOADER_POINTER_INVALID: The active pointer is not valid JSON.' }
    if ($bridgeActive.version -cnotmatch '^\d+\.\d+\.\d+([-.][A-Za-z0-9.-]+)?$' -or $bridgeActive.rid -cnotmatch '^win-(x64|arm64)$') { throw 'LOADER_UNAVAILABLE: The active pointer contains unsupported values.' }
    $bridgeClient = [IO.Path]::GetFullPath((Join-Path $bridgeRoot "versions/$($bridgeActive.version)/$($bridgeActive.rid)/CodexScriptLoader.Command.exe"))
    if (-not $bridgeClient.StartsWith($bridgeRoot.TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $bridgeClient -PathType Leaf)) { throw 'LOADER_UNAVAILABLE: The active command client is missing.' }
    function Invoke-BridgeCommand {
    $bridgeStart = [Diagnostics.ProcessStartInfo]::new($bridgeClient)
    $bridgeStart.UseShellExecute = $false
    $bridgeStart.CreateNoWindow = $true
    $bridgeStart.RedirectStandardInput = $true
    $bridgeStart.RedirectStandardOutput = $true
    $bridgeStart.RedirectStandardError = $true
    $bridgeStart.StandardInputEncoding = [Text.UTF8Encoding]::new($false)
    $bridgeStart.StandardOutputEncoding = [Text.UTF8Encoding]::new($false)
    foreach ($argument in @('plugin', 'invoke', '--id', 'dev.codex-chat-bridge', '--operation', $Operation)) { $bridgeStart.ArgumentList.Add($argument) }
    $bridgeProcess = [Diagnostics.Process]::new()
    $bridgeProcess.StartInfo = $bridgeStart
    try {
        try { $bridgeStarted = $bridgeProcess.Start() }
        catch [System.ComponentModel.Win32Exception] {
            if ($_.Exception.NativeErrorCode -eq 5) { throw 'LOADER_ACCESS_DENIED: The client was not started. Request tool approval for this same helper.' }
            throw 'COMMAND_FAILED: The command client did not start.'
        }
        if (-not $bridgeStarted) { throw 'COMMAND_FAILED: The command client did not start.' }
        $bridgeStdout = $bridgeProcess.StandardOutput.ReadToEndAsync()
        $bridgeStderr = $bridgeProcess.StandardError.ReadToEndAsync()
        $bridgeProcess.StandardInput.Write($bridgeJson)
        $bridgeProcess.StandardInput.Close()
        if (-not $bridgeProcess.WaitForExit(145000)) {
            # Only this helper's own client is terminated; the Loader and App are untouched.
            $bridgeProcess.Kill()
            throw 'COMMAND_TIMEOUT: Sending state may be uncertain. Do not automatically resend.'
        }
        $bridgeOutput = $bridgeStdout.GetAwaiter().GetResult().Trim()
        $null = $bridgeStderr.GetAwaiter().GetResult()
        if (-not $bridgeOutput -or [Text.Encoding]::UTF8.GetByteCount($bridgeOutput) -gt 64KB) { throw 'COMMAND_RESPONSE_INVALID: Missing or oversized response.' }
        try { $bridgeEnvelope = ConvertFrom-Json -InputObject $bridgeOutput -AsHashtable -Depth 64 }
        catch { throw 'COMMAND_RESPONSE_INVALID: No valid JSON envelope. Do not resend.' }
        if ($bridgeEnvelope -isnot [Collections.IDictionary] -or $bridgeEnvelope.version -ne 1 -or $bridgeEnvelope.ok -isnot [bool] -or $bridgeEnvelope.requestId -isnot [string] -or -not $bridgeEnvelope.requestId) { throw 'COMMAND_RESPONSE_INVALID: Invalid command envelope.' }
        if ($bridgeEnvelope.ok -and ($bridgeProcess.ExitCode -ne 0 -or -not $bridgeEnvelope.Contains('result'))) { throw 'COMMAND_RESPONSE_INVALID: Contradictory command result.' }
        if (-not $bridgeEnvelope.ok -and $bridgeEnvelope.error.code -isnot [string]) { throw 'COMMAND_RESPONSE_INVALID: Missing stable error code.' }
        Write-Output $bridgeOutput
    }
    finally { $bridgeProcess.Dispose() }
    }
    if ($Operation -eq 'exchange' -and -not $SingleRead) {
        . (Join-Path $PSScriptRoot 'wait-turn.ps1')
        Invoke-BridgeTurn { Invoke-BridgeCommand }
    } else { Invoke-BridgeCommand }
}
