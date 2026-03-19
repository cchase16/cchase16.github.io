param(
  [int]$Port = 8105
)

Set-Location $PSScriptRoot
py -3 -m http.server $Port
