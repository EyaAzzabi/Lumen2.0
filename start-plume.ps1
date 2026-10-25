param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$runtimeDirectory = Join-Path $projectRoot 'backend\data\runtime'
New-Item -ItemType Directory -Force -Path $runtimeDirectory | Out-Null

function Test-PlumeEndpoint([string]$Url) {
    try { return (Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3).StatusCode -eq 200 }
    catch { return $false }
}
function Wait-PlumeEndpoint([string]$Url, [System.Diagnostics.Process]$Child, [string]$ErrorLog) {
    $deadline = [DateTime]::UtcNow.AddSeconds(25)
    while ([DateTime]::UtcNow -lt $deadline) {
        if (Test-PlumeEndpoint $Url) { return }
        $Child.Refresh()
        if ($Child.HasExited) { throw "PLUME process stopped. See $ErrorLog" }
        Start-Sleep -Milliseconds 250
    }
    throw "PLUME did not become ready. See $ErrorLog"
}

$backendUrl = 'http://127.0.0.1:8001/api/ready'
if (-not (Test-PlumeEndpoint $backendUrl)) {
    $pythonExecutable = Join-Path $projectRoot 'backend\.venv\Scripts\python.exe'
    if (-not (Test-Path -LiteralPath $pythonExecutable)) { throw 'Install backend dependencies in backend/.venv first; see README.md.' }
    $env:PLUME_DEMO_AUTH = 'true'
    $env:PLUME_ENV = 'development'
    $env:PYTHONUTF8 = '1'
    $backendErrorLog = Join-Path $runtimeDirectory 'backend.stderr.log'
    $backendProcess = Start-Process -FilePath $pythonExecutable -ArgumentList @('-m','uvicorn','plume.api:app','--host','127.0.0.1','--port','8001') -WorkingDirectory (Join-Path $projectRoot 'backend') -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtimeDirectory 'backend.stdout.log') -RedirectStandardError $backendErrorLog -PassThru
    $backendProcess.Id | Set-Content (Join-Path $runtimeDirectory 'backend.pid')
    Wait-PlumeEndpoint $backendUrl $backendProcess $backendErrorLog
}

$frontendUrl = 'http://127.0.0.1:5174/'
if (-not (Test-PlumeEndpoint $frontendUrl)) {
    $nodeExecutable = (Get-Command node.exe).Source
    $viteEntry = Join-Path $projectRoot 'frontend\node_modules\vite\bin\vite.js'
    if (-not (Test-Path -LiteralPath $viteEntry)) { throw 'Run npm ci in frontend first.' }
    $env:PLUME_API_TARGET = 'http://127.0.0.1:8001'
    $frontendErrorLog = Join-Path $runtimeDirectory 'frontend.stderr.log'
    # Launch Node directly: npm/cmd and the invoking terminal need not stay alive.
    $frontendProcess = Start-Process -FilePath $nodeExecutable -ArgumentList @(('"' + $viteEntry + '"'),'--host','127.0.0.1','--port','5174','--strictPort') -WorkingDirectory (Join-Path $projectRoot 'frontend') -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtimeDirectory 'frontend.stdout.log') -RedirectStandardError $frontendErrorLog -PassThru
    $frontendProcess.Id | Set-Content (Join-Path $runtimeDirectory 'frontend.pid')
    Wait-PlumeEndpoint $frontendUrl $frontendProcess $frontendErrorLog
}

if (-not (Test-PlumeEndpoint ($frontendUrl + 'api/ready'))) { throw 'Frontend responds, but its backend proxy is unavailable. See backend/data/runtime logs.' }
Write-Output 'PLUME ready: http://127.0.0.1:5174/#gateway'
Write-Output "Local logs: $runtimeDirectory"
if (-not $NoBrowser) { Start-Process 'http://127.0.0.1:5174/#gateway' }

