$targetDir = 'C:\Users\habib\nodejs24'
$zipPath = 'C:\Users\habib\AppData\Local\Temp\node-v24.12.0-win-x64.zip'
$nodeUrl = 'https://nodejs.org/dist/v24.12.0/node-v24.12.0-win-x64.zip'

New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
$wc = New-Object System.Net.WebClient
$wc.DownloadFile($nodeUrl, $zipPath)
Expand-Archive -Path $zipPath -DestinationPath $targetDir -Force
Get-ChildItem $targetDir -Directory | Select-Object -First 5 -ExpandProperty FullName
