param(
  [Parameter(Mandatory = $true)][string] $VpsHost,
  [string] $User = "root",
  [int] $LocalPort = 27018
)
Write-Host "Tunnel: 127.0.0.1:$LocalPort -> VPS Mongo. Chiudi con Ctrl+C."
ssh -N -L "${LocalPort}:127.0.0.1:27017" "${User}@${VpsHost}"