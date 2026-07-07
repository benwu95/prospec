$ErrorActionPreference = 'Stop'

$Owner = "benwu95"
$Repo = "prospec"
$AssetName = "prospec-windows-x64.zip"
$InstallDir = "$Home\.prospec\bin"
$TargetPath = "$InstallDir\prospec.exe"

# Create installation directory if it doesn't exist
if (-not (Test-Path $InstallDir)) {
    New-Item -ItemType Directory -Path $InstallDir | Out-Null
}

$DownloadUrl = "https://github.com/$Owner/$Repo/releases/latest/download/$AssetName"

# Temporary path for the downloaded zip file
$TempZipPath = Join-Path $env:TEMP "prospec-windows-x64.zip"

Write-Host "Downloading $AssetName from latest release..."
try {
    # Download the zip file following redirects
    Invoke-WebRequest -Uri $DownloadUrl -OutFile $TempZipPath -UseBasicParsing
} catch {
    Write-Error "Failed to download $AssetName from $DownloadUrl"
    exit 1
}

Write-Host "Extracting prospec.exe to $InstallDir..."
try {
    # Extract the binary from the zip file, forcing overwrite of existing files
    Expand-Archive -Path $TempZipPath -DestinationPath $InstallDir -Force
} catch {
    Write-Error "Failed to extract prospec.exe from zip file"
    Remove-Item $TempZipPath -ErrorAction SilentlyContinue
    exit 1
} finally {
    # Clean up temporary zip file
    if (Test-Path $TempZipPath) {
        Remove-Item $TempZipPath
    }
}

Write-Host "Successfully installed prospec.exe to $TargetPath"

# Check and update PATH if not present
$UserPath = [Environment]::GetEnvironmentVariable("PATH", "User")
$PathSeparator = [IO.Path]::PathSeparator
$UserPathList = $UserPath -split [Regex]::Escape($PathSeparator)

if ($UserPathList -notcontains $InstallDir) {
    Write-Host "Adding $InstallDir to user PATH..."
    $NewUserPath = "$UserPath$PathSeparator$InstallDir"
    [Environment]::SetEnvironmentVariable("PATH", $NewUserPath, "User")
    # Update current session PATH
    $env:PATH = "$env:PATH$PathSeparator$InstallDir"
    Write-Host "PATH updated. Please restart your terminal/IDE for the changes to take full effect."
}

# Verify installation in the current session
Write-Host "Verifying installation..."
& prospec --version
