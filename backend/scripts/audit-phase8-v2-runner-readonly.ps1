# BE-02: READ-ONLY exact runner image identity audit.
# Usage from a Windows PowerShell terminal:
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\backend\scripts\audit-phase8-v2-runner-readonly.ps1
# This tool deliberately does not create files, Docker objects, containers, or approvals.
# Stdout can be copied to an operator-owned private report after review.
[CmdletBinding()]
param(
  [string]$DockerExe = 'docker'
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ExpectedDigest = 'sha256:b1b2cc386667fa68b5136c36f4c3ad8170035a203eb204f4be24edb4c82b0849'
$ExpectedRef = "stall-phase8-r2-runner@$ExpectedDigest"
$ExpectedConfig = 'sha256:abd8b7640f70fdd7d92d8c90496c5af4ee80d16e35f5d62c2d6a68389f77e29f'
$ExpectedBase = 'node@sha256:2dd9a4f758e173b65fee15388f7706af6fb01ef50cf7a2c0538711d67a6981ae'
$ExpectedBundle = 'f5164c3cf47dba291978b5745424d018266facb98a78c09b41b603f5ef68c289'

function Invoke-DockerReadOnly([string[]]$Arguments) {
  $out = & $DockerExe @Arguments 2>&1
  if ($LASTEXITCODE -ne 0) { throw ("Docker read-only command failed: " + ($Arguments -join ' ') + ". Check Docker Desktop, context, and availability. " + ($out -join ' ')) }
  return ($out -join "`n")
}

Write-Output 'BE-02 — runner identity audit (READ ONLY, does not approve)'
Write-Output "Timestamp UTC: $([DateTime]::UtcNow.ToString('o'))"
Write-Output "Expected reference: $ExpectedRef"
Write-Output "Recorded base digest: $ExpectedBase"
Write-Output "Recorded bundle SHA256: $ExpectedBundle"
Write-Output 'NOTE: Docker CLI might be pointed at an unexpected engine; do not change Docker contexts as part of this script.'

$context = Invoke-DockerReadOnly @('context','show')
Write-Output "Docker current context: $context"
$server = (Invoke-DockerReadOnly @('version','--format','{{.Server.Os}}/{{.Server.Arch}}')).Trim()
Write-Output "Docker server OS/Arch: $server"
if ($server -ne 'linux/amd64') { throw "Wrong engine: $server (expected linux/amd64). No further inspection." }

# Do not print Config.Env, mounts, labels beyond the bundle value, or file-system contents.
$json = Invoke-DockerReadOnly @('image','inspect',$ExpectedRef,'--format','{{json .}}')
$items = @(ConvertFrom-Json -InputObject $json)
if ($items.Count -ne 1) { throw 'Expected exactly one image object.' }
$i = $items[0]
if ($i.Os -ne 'linux' -or $i.Architecture -ne 'amd64') { throw 'Image platform mismatch.' }
$repoDigests = @($i.RepoDigests)
if (-not ($repoDigests -ccontains $ExpectedRef)) { throw 'Expected immutable RepoDigest missing.' }
# Docker image inspect .Id is OCI config digest on common Docker Engine versions.
$id = [string]$i.Id
Write-Output "Image ID (local config digest): $id"
Write-Output "RepoDigest exact match: true"
if ($id -cne $ExpectedConfig) { throw "Local config Image ID mismatch: expected $ExpectedConfig" }
$config = $i.Config
$user = [string]$config.User
$entry = @($config.Entrypoint) -join ' '
Write-Output "Image USER: $user"
Write-Output "Image Entrypoint: $entry"
if ($user -ne '1000:1000') { throw 'Image USER mismatch.' }
if ($entry -ne 'node /opt/phase8/backend/testing/phase8-v2/runner.mjs') { throw 'Image Entrypoint mismatch.' }
$labels = $config.Labels
$labelMatches = @($labels.PSObject.Properties | Where-Object { [string]$_.Value -eq $ExpectedBundle })
Write-Output "Recorded bundle digest present in image labels: $($labelMatches.Count -gt 0)"
if ($labelMatches.Count -eq 0) { throw 'Expected bundle digest absent from labels; inspect audit and label contract manually.' }
Write-Output 'PASS (limited): local expected RepoDigest, config ID, platform, USER, Entrypoint and bundle-label digest.'
Write-Output 'NOT VERIFIED: OCI manifest bytes/layers, archive allowlist, malicious content, secrets, B0 resource stability, Docker ACL/isolation, production readiness.'
Write-Output 'NOT AUTHORIZED: approval record edit, container run, database creation, migrations, deployment.'
