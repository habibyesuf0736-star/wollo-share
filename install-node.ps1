$nodeDir = 'C:\Users\habib\nodejs'
$zipPath = 'C:\Users\habib\AppData\Local\Temp\node-v22.11.0-win-x64.zip'
$nodeUrl = 'https://nodejs.org/dist/v22.11.0/node-v22.11.0-win-x64.zip'

New-Item -ItemType Directory -Force -Path $nodeDir | Out-Null
$wc = New-Object System.Net.WebClient
$wc.DownloadFile($nodeUrl, $zipPath)
Expand-Archive -Path $zipPath -DestinationPath $nodeDir -Force
Get-ChildItem $nodeDir -Directory | Select-Object -First 5 -ExpandProperty FullName
