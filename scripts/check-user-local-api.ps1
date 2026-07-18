$ErrorActionPreference = "Stop"

Write-Host "=== Check 3051 local API ==="

function Invoke-LocalWebRequest {
  param(
    [Parameter(Mandatory = $true)]
    [hashtable] $Request
  )

  try {
    return Invoke-WebRequest @Request
  } catch [System.Net.WebException] {
    $response = $_.Exception.Response
    if ($null -eq $response) {
      throw
    }

    $reader = New-Object System.IO.StreamReader($response.GetResponseStream())
    $content = $reader.ReadToEnd()

    return [PSCustomObject]@{
      StatusCode = [int] $response.StatusCode
      Headers = @{
        "Content-Type" = $response.ContentType
      }
      Content = $content
    }
  }
}

$loginPage = Invoke-LocalWebRequest -Request @{
  Uri = "http://127.0.0.1:3051/login"
  UseBasicParsing = $true
}
Write-Host "GET /login Status=$($loginPage.StatusCode) Content-Type=$($loginPage.Headers["Content-Type"])"

$body = @{
  phone = "13360587600"
  username = "13360587600"
  password = "12345678"
} | ConvertTo-Json

$res = Invoke-LocalWebRequest -Request @{
  Uri = "http://127.0.0.1:3051/api/auth/login"
  Method = "Post"
  ContentType = "application/json"
  Headers = @{ Accept = "application/json" }
  Body = $body
  UseBasicParsing = $true
}

Write-Host "POST /api/auth/login Status=$($res.StatusCode)"
Write-Host "Content-Type=$($res.Headers["Content-Type"])"
Write-Host "Body=$($res.Content)"

if ($res.Headers["Content-Type"] -notmatch "application/json") {
  Write-Host "ERROR: login API did not return JSON."
  exit 1
}

if ($res.Content -match "INVALID_DATABASE_URL") {
  Write-Host "ERROR: DATABASE_URL is still invalid."
  exit 1
}

if ($res.Content -match "<!DOCTYPE html>") {
  Write-Host "ERROR: API returned HTML."
  exit 1
}

Write-Host "Local API check passed. You can open the EXE for testing."
