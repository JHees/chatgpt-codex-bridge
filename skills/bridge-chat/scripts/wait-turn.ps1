# Internal helper: short Loader calls stay separate; the plugin owns the total deadline.
function Invoke-BridgeTurn {
    param([Parameter(Mandatory)][scriptblock]$InvokeOnce)
    $bridgeReads = 0
    do {
        $bridgeOutput = & $InvokeOnce
        $bridgeReads++
        $bridgeResult = ConvertFrom-Json -InputObject $bridgeOutput -AsHashtable -Depth 64
        if ($bridgeResult.ok -ne $true) { return $bridgeOutput }
        $bridgeContinue = $bridgeResult.result.state -in @('waiting', 'repair-required')
        # Yield a valid state to the executor periodically, not a business pause or resend.
        if ($bridgeContinue -and $bridgeReads -ge 3) { return $bridgeOutput }
        # No tight loop if an adapter returns its short window early. No payload changes.
        if ($bridgeContinue) { Start-Sleep -Milliseconds 250 }
    } while ($bridgeContinue)
    return $bridgeOutput
}
