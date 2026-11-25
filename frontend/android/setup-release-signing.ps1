$ErrorActionPreference = "Stop"

$androidDirectory = $PSScriptRoot
$propertiesPath = Join-Path $androidDirectory "keystore.properties"
$keystoreDirectory = Join-Path $env:USERPROFILE ".android\ElectronicsPOS"
$keystorePath = Join-Path $keystoreDirectory "release-key.p12"
$keyAlias = "electronics-pos"

if (Test-Path $propertiesPath) {
    throw "Signing properties already exist at '$propertiesPath'. Do not overwrite an existing signing key."
}
if (Test-Path $keystorePath) {
    throw "A signing key already exists at '$keystorePath'. Do not overwrite it; verify and back up the existing key."
}

$keytool = $null
if ($env:JAVA_HOME) {
    $candidate = Join-Path $env:JAVA_HOME "bin\keytool.exe"
    if (Test-Path $candidate) {
        $keytool = $candidate
    }
}
if (-not $keytool) {
    $command = Get-Command "keytool.exe" -ErrorAction SilentlyContinue
    if ($command) {
        $keytool = $command.Source
    }
}
if (-not $keytool) {
    throw "Java keytool was not found. Install JDK 21 or set JAVA_HOME, then run this script again."
}

function ConvertTo-PlainText([Security.SecureString]$Secret) {
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secret)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    }
}

$password = Read-Host "Create a unique release-key password (use at least 24 letters/numbers)" -AsSecureString
$passwordConfirmation = Read-Host "Enter the release-key password again" -AsSecureString
$plainPassword = ConvertTo-PlainText $password
$plainConfirmation = ConvertTo-PlainText $passwordConfirmation

if ($plainPassword -notmatch '^[A-Za-z0-9]{24,}$') {
    throw "Use a unique password with at least 24 letters and numbers."
}
if ($plainPassword -cne $plainConfirmation) {
    throw "The entered passwords do not match."
}

New-Item -ItemType Directory -Path $keystoreDirectory -Force | Out-Null
$passwordFile = Join-Path $env:TEMP ("electronics-pos-key-" + [guid]::NewGuid().ToString("N") + ".txt")

try {
    [IO.File]::WriteAllText($passwordFile, $plainPassword, [Text.Encoding]::ASCII)
    $acl = Get-Acl $passwordFile
    $acl.SetAccessRuleProtection($true, $false)
    $rule = New-Object Security.AccessControl.FileSystemAccessRule(
        "$env:USERDOMAIN\$env:USERNAME",
        "FullControl",
        "Allow"
    )
    $acl.SetAccessRule($rule)
    Set-Acl -Path $passwordFile -AclObject $acl

    & $keytool -genkeypair `
        -v `
        -keystore $keystorePath `
        -storetype PKCS12 `
        -storepass:file $passwordFile `
        -keypass:file $passwordFile `
        -alias $keyAlias `
        -keyalg RSA `
        -keysize 2048 `
        -validity 10000 `
        -dname "CN=Electronics POS, OU=Software, O=Wheezy Systems and Innovation, C=KE"
    if ($LASTEXITCODE -ne 0) {
        throw "keytool failed to create the release signing key."
    }

    $escapedPath = $keystorePath.Replace("\", "\\")
    $properties = @(
        "storeFile=$escapedPath"
        "storePassword=$plainPassword"
        "keyAlias=$keyAlias"
        "keyPassword=$plainPassword"
    ) -join "`r`n"
    [IO.File]::WriteAllText(
        $propertiesPath,
        $properties + "`r`n",
        [Text.Encoding]::ASCII
    )

    $propertiesAcl = Get-Acl $propertiesPath
    $propertiesAcl.SetAccessRuleProtection($true, $false)
    $propertiesAcl.SetAccessRule($rule)
    Set-Acl -Path $propertiesPath -AclObject $propertiesAcl

    $keystoreAcl = Get-Acl $keystorePath
    $keystoreAcl.SetAccessRuleProtection($true, $false)
    $keystoreAcl.SetAccessRule($rule)
    Set-Acl -Path $keystorePath -AclObject $keystoreAcl
} finally {
    if (Test-Path $passwordFile) {
        Remove-Item -LiteralPath $passwordFile -Force
    }
    $plainPassword = $null
    $plainConfirmation = $null
}

Write-Output "Release key created outside the repository: $keystorePath"
Write-Output "Local signing properties saved and protected by Windows account permissions."
Write-Output "Back up the .p12 key and its password to a separate encrypted location. Losing either prevents future Android updates."
Write-Output "Build the signed APK with: .\gradlew.bat assembleRelease"
