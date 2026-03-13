param(
  [string] $Uri = $env:ATLAS_URI
)
$ErrorActionPreference = "Stop"
if ([string]::IsNullOrWhiteSpace($Uri)) {
  Write-Host 'Manca URI Atlas. Esempio:'
  Write-Host '  .\scripts\mongodump-atlas-docker.ps1 -Uri "mongodb+srv://user:pass@cluster.mongodb.net/"'
  exit 1
}
$Root = Split-Path $PSScriptRoot -Parent
$Out = Join-Path $Root "deploy\atlas-dump"
New-Item -ItemType Directory -Force -Path $Out | Out-Null
Get-ChildItem -Path $Out -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
Write-Host ('Output: ' + $Out)
$docker = Get-Command docker -ErrorAction SilentlyContinue
$mongodump = Get-Command mongodump -ErrorAction SilentlyContinue
if ($docker) {
  Write-Host 'Uso Docker (mongodump in container)...'
  & docker run --rm -u 0 -v "${Out}:/dump" mongo:7 mongodump --uri="$Uri" -o /dump
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} elseif ($mongodump) {
  Write-Host 'Docker non nel PATH: uso mongodump locale (MongoDB Database Tools)...'
  & mongodump --uri="$Uri" --out="$Out"
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} else {
  Write-Host 'ERRORE: ne Docker ne mongodump trovati.'
  Write-Host 'Opzione A: installa Docker Desktop, riapri PowerShell, riprova.'
  Write-Host 'Opzione B: scarica MongoDB Database Tools, aggiungi bin al PATH, riprova.'
  Write-Host 'La cartella atlas-dump e vuota finche uno dei due non funziona.'
  exit 1
}
$bson = @(Get-ChildItem -Path $Out -Recurse -Filter "*.bson" -ErrorAction SilentlyContinue)
if ($bson.Count -eq 0) {
  Write-Host 'ERRORE: nessun .bson, URI o password sbagliati.'
  exit 1
}
Write-Host ('OK: ' + $bson.Count + ' file .bson')
Write-Host ('Cartella: ' + $Out)