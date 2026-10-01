# Give every release a new version so browsers fetch fresh files.
# Usage (PowerShell): .\bump-version.ps1   — then commit & push.
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$v = Get-Date -Format 'yyyyMMdd-HHmm'
# UTF-8 without BOM, so the Chinese text in index.html stays intact (PS 5.1 defaults to ANSI)
$utf8 = New-Object System.Text.UTF8Encoding $false

function Update-File($path, $pattern, $replacement) {
  $full = Join-Path $PSScriptRoot $path
  $text = [IO.File]::ReadAllText($full, $utf8)
  $new = [regex]::Replace($text, $pattern, $replacement)
  if ($new -eq $text -and $text -notmatch [regex]::Escape($v)) { throw "No version found in $path" }
  [IO.File]::WriteAllText($full, $new, $utf8)
}

Update-File 'index.html' '\?v=[0-9A-Za-z-]+' "?v=$v"
Update-File 'update.js' "(?m)^const APP_VERSION = '[^']*';" "const APP_VERSION = '$v';"
[IO.File]::WriteAllText((Join-Path $PSScriptRoot 'version.json'), "{ `"version`": `"$v`" }`n", $utf8)

Write-Host "Version -> $v"
