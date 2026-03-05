param(
    [string]$ProjectDir = "",
    [string]$SshKeyPath = "C:\Users\tomok\.ssh\katakatalab_actions_ed25519",
    [string]$SshHost = "hajikkoroom.xsrv.jp",
    [int]$SshPort = 10022,
    [string]$SshUser = "hajikkoroom",
    [string]$RemoteDir = "/home/hajikkoroom/katakatalab.com/public_html/writer-checker",
    [string]$BaseUrl = "https://katakatalab.com/writer-checker/"
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($ProjectDir)) {
    $ProjectDir = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
}

if (!(Test-Path -LiteralPath $ProjectDir)) {
    throw "ProjectDir not found: $ProjectDir"
}
if (!(Test-Path -LiteralPath $SshKeyPath)) {
    throw "SshKeyPath not found: $SshKeyPath"
}

$files = @(
    "index.html",
    "style.css",
    "manifest.json",
    "sw.js",
    "robots.txt",
    "sitemap.xml",
    "package.json"
)

$dirs = @(
    "guide",
    "privacy",
    "terms",
    "icons",
    "js",
    "vendor",
    "tests",
    "scripts"
)

Push-Location $ProjectDir
try {
    $remoteTarget = "${SshUser}@${SshHost}:$RemoteDir/"
    Write-Host "Syncing files to Xserver..."

    foreach ($file in $files) {
        & scp -i $SshKeyPath -P $SshPort $file $remoteTarget
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to upload file: $file"
        }
    }

    foreach ($dir in $dirs) {
        & scp -i $SshKeyPath -P $SshPort -r $dir $remoteTarget
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to upload directory: $dir"
        }
    }

    & ssh -i $SshKeyPath -p $SshPort "$SshUser@$SshHost" "find $RemoteDir -type d -exec chmod 755 {} \; && find $RemoteDir -type f -exec chmod 644 {} \; && chmod 755 $RemoteDir/js"
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to normalize permissions on remote host."
    }

    Write-Host "Running production verify..."
    node "$ProjectDir/scripts/verify-production.mjs" $BaseUrl

    Write-Host "Deploy completed."
}
finally {
    Pop-Location
}
