
$ErrorActionPreference = "Stop"

# Project paths
$ProjectRoot = "C:\Users\admin\Pictures\Wheezy Don't Delete\ELECTRONICS_POS"
$BackupDir = Join-Path $ProjectRoot "database\backups"

# PostgreSQL configuration
$PgDump = "C:\Program Files\PostgreSQL\18\bin\pg_dump.exe"
$env:PGPASSFILE = Join-Path $env:APPDATA "postgresql\pgpass.conf"

$Database = "electronics_pos"
$Username = "electronics_pos_user"
$HostName = "127.0.0.1"
$Port = "5432"

# Create backup folder if missing
New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null

$LogFile = Join-Path $BackupDir "backup.log"
$Timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$BackupFile = Join-Path $BackupDir "electronics_pos_$Timestamp.dump"

try {
    Add-Content $LogFile "$(Get-Date): Starting database backup..."

    if (!(Test-Path $PgDump)) {
        throw "PostgreSQL pg_dump.exe was not found."
    }

    if (!(Test-Path $env:PGPASSFILE)) {
        throw "PostgreSQL password file was not found."
    }

    # Create PostgreSQL custom-format backup
    & $PgDump `
        --host=$HostName `
        --port=$Port `
        --username=$Username `
        --dbname=$Database `
        --format=custom `
        --no-password `
        --file="$BackupFile"

    if ($LASTEXITCODE -ne 0) {
        throw "pg_dump failed with exit code $LASTEXITCODE."
    }

    $BackupSize = [math]::Round((Get-Item $BackupFile).Length / 1MB, 2)

    Add-Content $LogFile "$(Get-Date): SUCCESS - $BackupFile ($BackupSize MB)"

    # Delete backups older than 30 days
    Get-ChildItem $BackupDir -Filter "electronics_pos_*.dump" |
        Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } |
        Remove-Item -Force

    Add-Content $LogFile "$(Get-Date): Old backup cleanup completed."
}
catch {
    if (Test-Path $BackupFile) {
        Remove-Item $BackupFile -Force
    }

    Add-Content $LogFile "$(Get-Date): FAILED - $($_.Exception.Message)"
    exit 1
}
