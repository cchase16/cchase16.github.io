param(
  [int]$Port = 8105
)

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root
py -m http.server $Port --bind 127.0.0.1
