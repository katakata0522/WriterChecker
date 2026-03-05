param(
    [string]$ProjectDir = "C:\Users\tomok\Desktop\マネタイズ\writer-checker",
    [string]$SshKeyPath = "C:\Users\tomok\.ssh\katakatalab_actions_ed25519",
    [string]$SshHost = "hajikkoroom.xsrv.jp",
    [int]$SshPort = 10022,
    [string]$SshUser = "hajikkoroom",
    [string]$RemoteDir = "/home/hajikkoroom/katakatalab.com/public_html/writer-checker",
    [string]$BaseUrl = "https://katakatalab.com/writer-checker/"
)

$ErrorActionPreference = "Stop"

if (!(Test-Path -LiteralPath $ProjectDir)) {
    throw "ProjectDir not found: $ProjectDir"
}
if (!(Test-Path -LiteralPath $SshKeyPath)) {
    throw "SshKeyPath not found: $SshKeyPath"
}

$items = @(
    "index.html",
    "style.css",
    "manifest.json",
    "sw.js",
    "robots.txt",
    "sitemap.xml",
    "guide",
    "privacy",
    "terms",
    "js",
    "vendor"
)

Push-Location $ProjectDir
try {
    $archiveCmd = "tar -cf - " + ($items -join " ")
    $remoteCmd = "tar -xf - -C $RemoteDir && find $RemoteDir -type d -exec chmod 755 {} \; && find $RemoteDir -type f -exec chmod 644 {} \; && chmod 755 $RemoteDir/js"
    $fullCmd = "$archiveCmd | ssh -i `"$SshKeyPath`" -p $SshPort $SshUser@$SshHost `"$remoteCmd`""

    Write-Host "Syncing files to Xserver..."
    Invoke-Expression $fullCmd

    Write-Host "Running production verify..."
    node "$ProjectDir/scripts/verify-production.mjs" $BaseUrl

    Write-Host "Deploy completed."
}
finally {
    Pop-Location
}
