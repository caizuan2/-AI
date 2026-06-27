$ErrorActionPreference = "Stop"

$baseUrl = "http://localhost:3021"
$saveUrl = "$baseUrl/api/admin/kb/save"

function Invoke-RawRequest($url, $method, $body) {
  $request = [System.Net.HttpWebRequest]::Create($url)
  $request.Method = $method
  $request.AllowAutoRedirect = $false
  $request.UserAgent = "worktree2-save-knowledge-check"

  if ($body) {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($body)
    $request.ContentType = "application/json"
    $request.ContentLength = $bytes.Length
    $stream = $request.GetRequestStream()
    $stream.Write($bytes, 0, $bytes.Length)
    $stream.Close()
  }

  $response = $null
  try {
    $response = $request.GetResponse()
  } catch [System.Net.WebException] {
    if ($_.Exception.Response) {
      $response = $_.Exception.Response
    } else {
      throw
    }
  }

  $content = ""
  if ($response) {
    $stream = $response.GetResponseStream()
    if ($stream) {
      $reader = [System.IO.StreamReader]::new($stream)
      $content = $reader.ReadToEnd()
      $reader.Close()
    }
  }

  return [pscustomobject]@{
    StatusCode = [int]$response.StatusCode
    Content = $content
    ContentType = $response.ContentType
  }
}

Write-Host "[save-check] checking UI health gate"
& (Join-Path $PSScriptRoot "check-worktree2-admin-ingest-ui.ps1")

$body = @{
  jobId = "codex-save-health-check"
  originalInput = "Codex save health check"
  structured = @{
    title = "Codex save self test"
    category = "self-test"
    tags = @("codex", "save-check")
    summary = "Checks whether the save API exists and returns auth or save result."
    qa_pairs = @(@{ q = "Does the save API exist?"; a = "It exists if it returns auth error or save result." })
    confidence = 80
    should_save = $true
  }
} | ConvertTo-Json -Depth 8

Write-Host "[save-check] probing save API: $saveUrl"
$response = Invoke-RawRequest $saveUrl "POST" $body
Write-Host "save api status code: $($response.StatusCode)"
Write-Host "save api response: $($response.Content)"

$json = $null
try {
  $json = $response.Content | ConvertFrom-Json
} catch {
  $json = $null
}

if ($response.StatusCode -eq 201 -and $json -and ($json.success -eq $true -or $json.ok -eq $true)) {
  $data = $json.data
  Write-Host "save api success: true"
  Write-Host "storedCount: $($data.storedCount)"
  Write-Host "indexedCount: $($data.indexedCount)"
  Write-Host "can judge save loop: api-only pass"
  exit 0
}

if ($response.StatusCode -in @(401, 403, 307)) {
  Write-Host "save api exists: true"
  Write-Host "requires login: true"
  Write-Host "need browser session: cannot directly API self-test save without authenticated cookies."
  Write-Host "can judge save loop: requires browser login click verification"
  exit 0
}

if ($response.StatusCode -eq 404) {
  Write-Host "save api exists: false" -ForegroundColor Red
  exit 1
}

Write-Host "save api check failed with unexpected status." -ForegroundColor Red
exit 1