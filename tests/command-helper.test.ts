import { expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { commandResponseBytes } from "../packages/renderer-plugin/src/session.js";

const quote = (text: string): string => `'${text.replaceAll("'", "''")}'`;

it.skipIf(process.platform !== "win32")("budgets at least the actual Windows JSON encoder size for Unicode and escaped text", () => {
  const sample={text:'中😀<>+&`"\'\\\n'+String.fromCharCode(...Array.from({length:128},(_,i)=>i))};
  const result=spawnSync(pwsh,["-NoProfile","-Command",'[Console]::InputEncoding=[Text.UTF8Encoding]::new(); $value=[System.Text.Json.JsonDocument]::Parse([Console]::In.ReadToEnd()); [System.Text.Json.JsonSerializer]::Serialize[System.Text.Json.JsonElement]($value.RootElement)'],{encoding:"utf8",input:JSON.stringify(sample),timeout:10000,windowsHide:true});
  expect(result.status).toBe(0);
  expect(commandResponseBytes(sample)).toBeGreaterThanOrEqual(Buffer.byteLength(result.stdout.trim(),"utf8"));
});

it.skipIf(process.platform !== "win32")("continues identical waiting reads, but stops at pause, failure and lost transport", () => {
  const runner = resolve("skills/bridge-chat/scripts/wait-turn.ps1");
  const command = `
    $ErrorActionPreference='Stop'
    . ${quote(runner)}
    foreach ($states in @(@('waiting','reply'), @('waiting','paused'), @('failed'), @('waiting','waiting','waiting'))) {
      $queue=[Collections.Generic.Queue[string]]::new(); foreach($state in $states){$queue.Enqueue($state)}
      $result=Invoke-BridgeTurn { $state=$queue.Dequeue(); @{version=1;requestId='test';ok=$true;result=@{state=$state};error=@{code='SEND_UNCERTAIN'}} | ConvertTo-Json -Depth 8 -Compress }
      if($queue.Count -ne 0){throw 'Did not complete expected sequence'}
      $result
    }
    $calls=[Collections.Generic.List[int]]::new()
    try { Invoke-BridgeTurn { $calls.Add(1); throw 'COMMAND_RESPONSE_INVALID' } } catch { if($calls.Count -ne 1){throw 'Transport was retried'}; 'TRANSPORT_STOPPED' }
    $repair=[Collections.Generic.Queue[string]]::new(); $repair.Enqueue('repair-required'); $repair.Enqueue('reply')
    $result=Invoke-BridgeTurn { $state=$repair.Dequeue(); @{version=1;requestId='test';ok=$true;result=@{state=$state}} | ConvertTo-Json -Depth 8 -Compress }
    if(($result | ConvertFrom-Json -AsHashtable).result.state -ne 'repair-required' -or $repair.Count -ne 1){throw 'Unknown states must stop without another invocation'}
    'UNKNOWN_STATE_STOPPED'
  `;
  const result=spawnSync(pwsh,["-NoProfile","-Command",command],{encoding:"utf8",timeout:10000,windowsHide:true});
  expect(result.status).toBe(0);
  const lines=result.stdout.trim().split(/\r?\n/u);
  expect(lines.slice(0,3).map(line=>JSON.parse(line).result.state)).toEqual(["reply","paused","failed"]);
  expect(JSON.parse(lines[3]!).result.state).toBe("waiting");
  expect(lines[4]).toBe("TRANSPORT_STOPPED");
  expect(lines[5]).toBe("UNKNOWN_STATE_STOPPED");
});
it.skipIf(process.platform !== "win32")("supports direct, same-shell pipeline and explicit process stdin without guessing transport", () => {
  const directory = mkdtempSync(join(tmpdir(), "bridge-helper-"));
  writeFileSync(join(directory,"active.json"), JSON.stringify({version:"0.5.10",rid:"win-x64"}));
  const json = JSON.stringify({task:{hostId:"local",taskId:"test"}});
  try {
    const cases = [
      {args:["-File",helper,"-Operation","status","-PayloadJson",json,"-InstallRoot",directory]},
      {args:["-Command",`${quote(json)} | & ${quote(helper)} -Operation status -InstallRoot ${quote(directory)}`]},
      {args:["-File",helper,"-Operation","status","-Stdin","-InstallRoot",directory],input:json},
    ];
    for(const test of cases){const result=spawnSync(pwsh,["-NoProfile",...test.args],{encoding:"utf8",input:test.input,timeout:10000,windowsHide:true});expect(result.stderr).toContain("active command client is missing");expect(result.stdout).toBe("");}
  } finally { rmSync(directory,{recursive:true,force:true}); }
});
it.skipIf(process.platform !== "win32")("distinguishes permission denial from corrupt installation data", () => {
  const directory = mkdtempSync(join(tmpdir(), "bridge-helper-"));
  writeFileSync(join(directory,"active.json"), "{}");
  try {
    const command=`function Get-Content { throw [UnauthorizedAccessException]::new('private-path') }; & ${quote(helper)} -Operation status -PayloadJson '{}' -InstallRoot ${quote(directory)}`;
    const result=spawnSync(pwsh,["-NoProfile","-Command",command],{encoding:"utf8",timeout:10000,windowsHide:true});
    expect(result.stderr).toContain("LOADER_ACCESS_DENIED");expect(result.stderr).not.toContain("private-path");expect(result.stderr).not.toContain("pointer is invalid");
  } finally {rmSync(directory,{recursive:true,force:true});}
});
it.skipIf(process.platform !== "win32")("resolves the default installation from the user's local folder instead of the redirected process folder", () => {
  const directory = mkdtempSync(join(tmpdir(), "bridge-helper-"));
  const installation = join(directory, "Programs", "CodexScriptLoader");
  mkdirSync(installation, {recursive:true});
  writeFileSync(join(installation, "active.json"), JSON.stringify({version:"0.5.10",rid:"win-x64"}));
  try {
    const command = `
      function Get-ItemPropertyValue {
        param($LiteralPath,$Name)
        if($LiteralPath -ne 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders' -or $Name -ne 'Local AppData'){throw 'Wrong folder lookup'}
        ${quote(directory)}
      }
      & ${quote(helper)} -Operation status -PayloadJson '{}'
    `;
    const result=spawnSync(pwsh,["-NoProfile","-Command",command],{encoding:"utf8",timeout:10000,windowsHide:true});
    expect(result.stderr).toContain("active command client is missing");
    expect(result.stderr).not.toContain("no readable active pointer");
    expect(result.stdout).toBe("");
  } finally {rmSync(directory,{recursive:true,force:true});}
});
it.skipIf(process.platform !== "win32")("requests approval before starting a client from a redirected Windows process", () => {
  const directory=mkdtempSync(join(tmpdir(),"bridge-helper-"));
  const installation=join(directory,"Programs","CodexScriptLoader");
  const version=join(installation,"versions","0.5.10","win-x64");
  mkdirSync(version,{recursive:true});
  writeFileSync(join(installation,"active.json"),JSON.stringify({version:"0.5.10",rid:"win-x64"}));
  writeFileSync(join(version,"CodexScriptLoader.Command.exe"),"must not execute");
  try {
    for(const operation of ["status","exchange"]){
      const command=`function Get-ItemPropertyValue { ${quote(directory)} }; & ${quote(helper)} -Operation ${operation} -PayloadJson '{}'`;
      const result=spawnSync(pwsh,["-NoProfile","-Command",command],{encoding:"utf8",timeout:10000,windowsHide:true});
      expect(result.stderr).toContain("LOADER_ACCESS_DENIED");
      expect(result.stderr).toContain("No command was sent");
      expect(result.stderr).not.toContain("COMMAND_FAILED");
      expect(result.stdout).toBe("");
    }
  } finally {rmSync(directory,{recursive:true,force:true});}
});
it.skipIf(process.platform !== "win32")("rejects Windows PowerShell 5 before misleading JSON/count failures", () => {
  const legacy=join(process.env.SystemRoot??"C:/Windows","System32/WindowsPowerShell/v1.0/powershell.exe");
  const result=spawnSync(legacy,["-NoProfile","-ExecutionPolicy","Bypass","-File",helper,"-Operation","status","-PayloadJson","{}"],{encoding:"utf8",timeout:10000,windowsHide:true});
  expect(result.stderr).toContain("POWERSHELL_7_REQUIRED");
});

const pwsh = join(process.env.ProgramFiles ?? "C:\\Program Files", "PowerShell", "7", "pwsh.exe");
const helper = resolve("skills/bridge-chat/scripts/invoke-bridge.ps1");
it.skipIf(process.platform !== "win32")("rejects malformed, non-object and oversized input before resolving or starting a client", () => {
  for (const [input, code] of [["[]", "INVALID_REQUEST"], ["{broken", "INVALID_REQUEST"], [JSON.stringify({ text: "中".repeat(21000) }), "REQUEST_TOO_LARGE"]]) {
    const result = spawnSync(pwsh, ["-NoProfile", "-File", helper, "-Operation", "status", "-PayloadJson", input!, "-InstallRoot", join(tmpdir(), "bridge-intentionally-missing-installation")], { encoding: "utf8", timeout: 10_000, windowsHide: true });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(code);
    expect(result.stdout).toBe("");
  }
});
