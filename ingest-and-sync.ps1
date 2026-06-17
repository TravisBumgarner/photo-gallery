# Windows launcher — same as ./ingest-and-sync. Run: pwsh ./ingest-and-sync.ps1
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

# Native pipeline deps + the Ink orchestrator (NOT frontend). Docker is not
# required here; only faces/dogs need it, brought up by the orchestrator.
if (-not (Test-Path "node_modules/ink")) {
  Write-Host "Installing dependencies (first run)..."
  npm install -w shared -w backend -w offline-processing -w cli
}

npx tsx cli/src/index.tsx @args
