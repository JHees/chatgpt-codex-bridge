# Internal helper: short Loader calls stay separate; the plugin owns the total deadline.
function Invoke-BridgeTurn {
    param([Parameter(Mandatory)][scriptblock]$InvokeOnce)
    $bridgeClock = [Diagnostics.Stopwatch]::StartNew()
    do {
        if ($bridgeClock.Elapsed.TotalMinutes -ge 61) { throw 'WAIT_LIMIT_REACHED: Read the exact turn status; do not start a replacement request.' }
        $bridgeOutput = & $InvokeOnce
        $bridgeResult = ConvertFrom-Json -InputObject $bridgeOutput -AsHashtable -Depth 64
        if ($bridgeResult.ok -ne $true) { return $bridgeOutput }
        $bridgeContinue = $bridgeResult.result.state -in @('waiting', 'repair-required')
        # No tight loop if an adapter returns its short window early. No payload changes.
        if ($bridgeContinue) { Start-Sleep -Milliseconds 250 }
    } while ($bridgeContinue)
    return $bridgeOutput
}
