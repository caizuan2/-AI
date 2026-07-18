$ErrorActionPreference = "Stop"

$baseUrl = "http://localhost:3021"
$baseUri = [Uri]::new("$baseUrl/")
$routes = @(
  @{ Name = "login"; Url = "$baseUrl/ingest/login?app=ingest-admin&next=/admin-ingest"; Expected = @(200); RequireStyledHtml = $true },
  @{ Name = "register"; Url = "$baseUrl/ingest/register?app=ingest-admin&next=/ingest/activate"; Expected = @(200); RequireStyledHtml = $true },
  @{ Name = "activate"; Url = "$baseUrl/ingest/activate?app=ingest-admin&next=/admin-ingest"; Expected = @(200); RequireStyledHtml = $true },
  @{ Name = "admin-ingest"; Url = "$baseUrl/admin-ingest?app=ingest-admin&platform=web"; Expected = @(200, 307); RequireStyledHtml = $false }
)

function Invoke-RawRequest([string]$url) {
  $request = [System.Net.HttpWebRequest]::Create($url)
  $request.Method = "GET"
  $request.AllowAutoRedirect = $false
  $request.UserAgent = "worktree2-ui-health-check"

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

  $body = ""
  if ($response) {
    $stream = $response.GetResponseStream()
    if ($stream) {
      $reader = [System.IO.StreamReader]::new($stream)
      $body = $reader.ReadToEnd()
      $reader.Close()
    }
  }

  return [pscustomobject]@{
    StatusCode = [int]$response.StatusCode
    Content = $body
    Headers = $response.Headers
  }
}

function Get-CssUrls([string]$html) {
  $urls = New-Object System.Collections.Generic.List[string]
  $linkMatches = [regex]::Matches($html, '<link\b[^>]*>', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)

  foreach ($match in $linkMatches) {
    $tag = $match.Value
    if ($tag -notmatch '\.css' -and $tag -notmatch 'stylesheet') {
      continue
    }

    $hrefMatch = [regex]::Match($tag, 'href=["'']([^"'']+)["'']', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
    if (-not $hrefMatch.Success) {
      continue
    }

    $href = $hrefMatch.Groups[1].Value
    if ($href -notmatch '\.css') {
      continue
    }

    $absolute = if ($href -match '^https?://') { $href } else { ([Uri]::new($baseUri, $href)).AbsoluteUri }
    $urls.Add($absolute)
  }

  return @($urls | Select-Object -Unique)
}

function Test-NativeHtml([string]$name, [string]$html) {
  $buttonMatches = [regex]::Matches($html, '<button\b([^>]*)>', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
  $buttonWithClass = 0
  foreach ($button in $buttonMatches) {
    if ($button.Groups[1].Value -match 'class=') {
      $buttonWithClass++
    }
  }

  $classCount = [regex]::Matches($html, 'class=["''][^"'']+["'']', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase).Count
  $styleTokens = @('rounded', 'flex', 'grid', 'bg-', 'text-', 'shadow', 'border', 'min-h', 'px-', 'py-', 'items-center', 'justify-center')
  $tokenHits = 0
  foreach ($token in $styleTokens) {
    if ($html.Contains($token)) {
      $tokenHits++
    }
  }

  $hasAuthPortal = $html.Contains('data-ui-health="ingest-auth-portal"') -or $html.Contains("data-ui-health='ingest-auth-portal'")
  $hasAuthCard = $html.Contains('data-ui-health="ingest-auth-card"') -or $html.Contains("data-ui-health='ingest-auth-card'")
  $nativeLikely = $false
  $reasons = New-Object System.Collections.Generic.List[string]

  if ($classCount -lt 20) {
    $nativeLikely = $true
    $reasons.Add("too few class attributes: $classCount")
  }

  if ($tokenHits -lt 6) {
    $nativeLikely = $true
    $reasons.Add("too few Tailwind-like tokens: $tokenHits")
  }

  if ($buttonMatches.Count -gt 0 -and $buttonWithClass -eq 0) {
    $nativeLikely = $true
    $reasons.Add("buttons exist but no button class")
  }

  if ($name -in @('login', 'register', 'activate') -and (-not $hasAuthPortal -or -not $hasAuthCard)) {
    $nativeLikely = $true
    $reasons.Add("auth SaaS wrapper missing")
  }

  return [pscustomobject]@{
    Name = $name
    ClassCount = $classCount
    ButtonCount = $buttonMatches.Count
    ButtonWithClass = $buttonWithClass
    TailwindTokenHits = $tokenHits
    NativeLikely = $nativeLikely
    Reasons = @($reasons)
  }
}

function Invoke-BrowserComputedStyleCheck([string]$url) {
  $nodeB64Parts = @(
    "aW1wb3J0IHsgc3Bhd24gfSBmcm9tICJub2RlOmNoaWxkX3Byb2Nlc3MiOwppbXBvcnQgZnMgZnJvbSAibm9kZTpmcyI7CmltcG9ydCBvcyBmcm9tICJub2RlOm9zIjsKaW1wb3J0IHBhdGggZnJvbSAibm9kZTpwYXRoIjsKaW1wb3J0IGh0dHAgZnJvbSAibm9kZTpodHRwIjsKCmNvbnN0IHVybCA9IHByb2Nlc3MuYXJndlsyXTsKY29uc3QgY2FuZGlkYXRlcyA9IFsKICBwcm9jZXNzLmVudi5XT1JLVFJFRTJfQlJPV1NFUiwKICAiQzpcXFByb2dyYW0gRmlsZXNcXE1pY3Jvc29mdFxcRWRnZVxcQXBwbGljYXRpb25cXG1zZWRnZS5leGUiLAogICJDOlxcUHJvZ3JhbSBGaWxlcyAoeDg2KVxcTWljcm9zb2Z0XFxFZGdlXFxBcHBsaWNhdGlvblxcbXNlZGdlLmV4ZSIsCiAgIkM6XFxQcm9ncmFtIEZpbGVzXFxHb29nbGVcXENocm9tZVxcQXBwbGljYXRpb25cXGNocm9tZS5leGUiLAogICJDOlxcUHJvZ3JhbSBGaWxlcyAoeDg2KVxcR29vZ2xlXFxDaHJvbWVcXEFwcGxpY2F0aW9uXFxjaHJvbWUuZXhlIgpdLmZpbHRlcihCb29sZWFuKTsKCmZ1bmN0aW9uIHByaW50KHZhbHVlKSB7CiAgY29uc29sZS5sb2coSlNPTi5zdHJpbmdpZnkodmFsdWUpKTsKfQoKaWYgKHR5cGVvZiBXZWJTb2NrZXQgPT09ICJ1bmRlZmluZWQiKSB7CiAgcHJpbnQoeyBhdmFpbGFibGU6IGZhbHNlLCByZWFzb246ICJOb2RlIFdlYlNvY2tldCB1bmF2YWlsYWJsZSIgfSk7CiAgcHJvY2Vzcy5leGl0KDApOwp9Cgpjb25zdCBicm93c2VyUGF0aCA9IGNhbmRp"
    "ZGF0ZXMuZmluZCgoY2FuZGlkYXRlKSA9PiBmcy5leGlzdHNTeW5jKGNhbmRpZGF0ZSkpOwppZiAoIWJyb3dzZXJQYXRoKSB7CiAgcHJpbnQoeyBhdmFpbGFibGU6IGZhbHNlLCByZWFzb246ICJObyBFZGdlL0Nocm9tZSBleGVjdXRhYmxlIGZvdW5kIiB9KTsKICBwcm9jZXNzLmV4aXQoMCk7Cn0KCmNvbnN0IHBvcnQgPSA5MzMxICsgTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogNTAwKTsKY29uc3QgcHJvZmlsZURpciA9IGZzLm1rZHRlbXBTeW5jKHBhdGguam9pbihvcy50bXBkaXIoKSwgInd0Mi11aS1icm93c2VyLSIpKTsKY29uc3QgYnJvd3NlciA9IHNwYXduKGJyb3dzZXJQYXRoLCBbCiAgYC0tcmVtb3RlLWRlYnVnZ2luZy1wb3J0PSR7cG9ydH1gLAogIGAtLXVzZXItZGF0YS1kaXI9JHtwcm9maWxlRGlyfWAsCiAgIi0taGVhZGxlc3M9bmV3IiwKICAiLS1kaXNhYmxlLWdwdSIsCiAgIi0tbm8tZmlyc3QtcnVuIiwKICAiLS1uby1kZWZhdWx0LWJyb3dzZXItY2hlY2siLAogICJhYm91dDpibGFuayIKXSwgeyBzdGRpbzogImlnbm9yZSIsIHdpbmRvd3NIaWRlOiB0cnVlIH0pOwoKZnVuY3Rpb24gc2xlZXAobXMpIHsKICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgbXMpKTsKfQoKZnVuY3Rpb24gcmVxdWVzdEpzb24obWV0aG9kLCByZXF1ZXN0UGF0aCkgewogIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7CiAgICBjb25zdCByZXEgPSBo"
    "dHRwLnJlcXVlc3QoeyBob3N0bmFtZTogIjEyNy4wLjAuMSIsIHBvcnQsIHBhdGg6IHJlcXVlc3RQYXRoLCBtZXRob2QgfSwgKHJlcykgPT4gewogICAgICBsZXQgZGF0YSA9ICIiOwogICAgICByZXMub24oImRhdGEiLCAoY2h1bmspID0+IHsgZGF0YSArPSBjaHVuazsgfSk7CiAgICAgIHJlcy5vbigiZW5kIiwgKCkgPT4gewogICAgICAgIGlmICgocmVzLnN0YXR1c0NvZGUgfHwgNTAwKSA+PSA0MDApIHsKICAgICAgICAgIHJlamVjdChuZXcgRXJyb3IoYEhUVFAgJHtyZXMuc3RhdHVzQ29kZX06ICR7ZGF0YS5zbGljZSgwLCAxMjApfWApKTsKICAgICAgICAgIHJldHVybjsKICAgICAgICB9CiAgICAgICAgdHJ5IHsKICAgICAgICAgIHJlc29sdmUoSlNPTi5wYXJzZShkYXRhKSk7CiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHsKICAgICAgICAgIHJlamVjdChlcnJvcik7CiAgICAgICAgfQogICAgICB9KTsKICAgIH0pOwogICAgcmVxLm9uKCJlcnJvciIsIHJlamVjdCk7CiAgICByZXEuZW5kKCk7CiAgfSk7Cn0KCmFzeW5jIGZ1bmN0aW9uIHdhaXRGb3JDZHAoKSB7CiAgZm9yIChsZXQgaSA9IDA7IGkgPCA2MDsgaSsrKSB7CiAgICB0cnkgewogICAgICByZXR1cm4gYXdhaXQgcmVxdWVzdEpzb24oIkdFVCIsICIvanNvbi92ZXJzaW9uIik7CiAgICB9IGNhdGNoIHsKICAgICAgYXdhaXQgc2xlZXAoMjUwKTsKICAgIH0KICB9CiAgdGhyb3cgbmV3IEVycm9yKCJicm93c2VyIHJlbW90ZSBkZWJ1Z2dpbmcgZW5kcG9pbnQg"
    "bm90IHJlYWR5Iik7Cn0KCmZ1bmN0aW9uIGNvbm5lY3Qod3NVcmwpIHsKICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4gewogICAgY29uc3Qgd3MgPSBuZXcgV2ViU29ja2V0KHdzVXJsKTsKICAgIGNvbnN0IHBlbmRpbmcgPSBuZXcgTWFwKCk7CiAgICBsZXQgaWQgPSAxOwoKICAgIHdzLmFkZEV2ZW50TGlzdGVuZXIoIm9wZW4iLCAoKSA9PiB7CiAgICAgIHJlc29sdmUoewogICAgICAgIHNlbmQobWV0aG9kLCBwYXJhbXMgPSB7fSkgewogICAgICAgICAgY29uc3QgbWVzc2FnZUlkID0gaWQrKzsKICAgICAgICAgIGNvbnN0IHBheWxvYWQgPSBKU09OLnN0cmluZ2lmeSh7IGlkOiBtZXNzYWdlSWQsIG1ldGhvZCwgcGFyYW1zIH0pOwogICAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChtZXNzYWdlUmVzb2x2ZSwgbWVzc2FnZVJlamVjdCkgPT4gewogICAgICAgICAgICBwZW5kaW5nLnNldChtZXNzYWdlSWQsIHsgcmVzb2x2ZTogbWVzc2FnZVJlc29sdmUsIHJlamVjdDogbWVzc2FnZVJlamVjdCB9KTsKICAgICAgICAgICAgd3Muc2VuZChwYXlsb2FkKTsKICAgICAgICAgIH0pOwogICAgICAgIH0sCiAgICAgICAgY2xvc2UoKSB7CiAgICAgICAgICB3cy5jbG9zZSgpOwogICAgICAgIH0KICAgICAgfSk7CiAgICB9LCB7IG9uY2U6IHRydWUgfSk7CgogICAgd3MuYWRkRXZlbnRMaXN0ZW5lcigibWVzc2FnZSIsIChldmVudCkgPT4gewogICAgICBjb25zdCBtZXNzYWdlID0gSlNPTi5wYXJzZShl"
    "dmVudC5kYXRhKTsKICAgICAgaWYgKCFtZXNzYWdlLmlkIHx8ICFwZW5kaW5nLmhhcyhtZXNzYWdlLmlkKSkgewogICAgICAgIHJldHVybjsKICAgICAgfQogICAgICBjb25zdCBoYW5kbGVycyA9IHBlbmRpbmcuZ2V0KG1lc3NhZ2UuaWQpOwogICAgICBwZW5kaW5nLmRlbGV0ZShtZXNzYWdlLmlkKTsKICAgICAgaWYgKG1lc3NhZ2UuZXJyb3IpIHsKICAgICAgICBoYW5kbGVycy5yZWplY3QobmV3IEVycm9yKG1lc3NhZ2UuZXJyb3IubWVzc2FnZSB8fCAiQ0RQIGVycm9yIikpOwogICAgICB9IGVsc2UgewogICAgICAgIGhhbmRsZXJzLnJlc29sdmUobWVzc2FnZS5yZXN1bHQpOwogICAgICB9CiAgICB9KTsKCiAgICB3cy5hZGRFdmVudExpc3RlbmVyKCJlcnJvciIsICgpID0+IHJlamVjdChuZXcgRXJyb3IoIldlYlNvY2tldCBjb25uZWN0aW9uIGZhaWxlZCIpKSwgeyBvbmNlOiB0cnVlIH0pOwogIH0pOwp9Cgp0cnkgewogIGF3YWl0IHdhaXRGb3JDZHAoKTsKICBsZXQgdGFiOwogIHRyeSB7CiAgICB0YWIgPSBhd2FpdCByZXF1ZXN0SnNvbigiUFVUIiwgYC9qc29uL25ldz8ke2VuY29kZVVSSUNvbXBvbmVudCh1cmwpfWApOwogIH0gY2F0Y2ggewogICAgY29uc3QgdGFicyA9IGF3YWl0IHJlcXVlc3RKc29uKCJHRVQiLCAiL2pzb24iKTsKICAgIHRhYiA9IHRhYnNbMF07CiAgfQoKICBpZiAoIXRhYj8ud2ViU29ja2V0RGVidWdnZXJVcmwpIHsKICAgIHRocm93IG5ldyBFcnJvcigiTm8gcGFnZSB3ZWJzb2NrZXQgVVJM"
    "IGF2YWlsYWJsZSIpOwogIH0KCiAgY29uc3QgY2xpZW50ID0gYXdhaXQgY29ubmVjdCh0YWIud2ViU29ja2V0RGVidWdnZXJVcmwpOwogIGF3YWl0IGNsaWVudC5zZW5kKCJQYWdlLmVuYWJsZSIpOwogIGF3YWl0IGNsaWVudC5zZW5kKCJSdW50aW1lLmVuYWJsZSIpOwogIGF3YWl0IGNsaWVudC5zZW5kKCJQYWdlLm5hdmlnYXRlIiwgeyB1cmwgfSk7CiAgYXdhaXQgc2xlZXAoNjUwMCk7CgogIGNvbnN0IGV4cHJlc3Npb24gPSBgKCgpID0+IHsKICAgIGNvbnN0IHZpc2libGUgPSAoZWwpID0+ICEhZWwgJiYgZWwub2Zmc2V0UGFyZW50ICE9PSBudWxsOwogICAgY29uc3QgcmFkaXVzTnVtYmVyID0gKHZhbHVlKSA9PiBOdW1iZXIucGFyc2VGbG9hdCh2YWx1ZSB8fCAiMCIpIHx8IDA7CiAgICBjb25zdCBidXR0b24gPSBBcnJheS5mcm9tKGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoImJ1dHRvbiIpKS5maW5kKHZpc2libGUpIHx8IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoImJ1dHRvbiIpOwogICAgY29uc3QgaW5wdXQgPSBBcnJheS5mcm9tKGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoImlucHV0LCB0ZXh0YXJlYSIpKS5maW5kKHZpc2libGUpIHx8IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoImlucHV0LCB0ZXh0YXJlYSIpOwogICAgY29uc3QgY2FyZCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLXVpLWhlYWx0aD0iaW5nZXN0LWF1dGgtY2FyZCJdJyk7CiAgICBjb25zdCBwb3J0YWwgPSBkb2N1bWVudC5x"
    "dWVyeVNlbGVjdG9yKCdbZGF0YS11aS1oZWFsdGg9ImluZ2VzdC1hdXRoLXBvcnRhbCJdJyk7CiAgICBjb25zdCBib2R5U3R5bGUgPSBnZXRDb21wdXRlZFN0eWxlKGRvY3VtZW50LmJvZHkpOwogICAgY29uc3QgYnV0dG9uU3R5bGUgPSBidXR0b24gPyBnZXRDb21wdXRlZFN0eWxlKGJ1dHRvbikgOiBudWxsOwogICAgY29uc3QgaW5wdXRTdHlsZSA9IGlucHV0ID8gZ2V0Q29tcHV0ZWRTdHlsZShpbnB1dCkgOiBudWxsOwogICAgY29uc3QgY2FyZFN0eWxlID0gY2FyZCA/IGdldENvbXB1dGVkU3R5bGUoY2FyZCkgOiBudWxsOwogICAgY29uc3QgcG9ydGFsU3R5bGUgPSBwb3J0YWwgPyBnZXRDb21wdXRlZFN0eWxlKHBvcnRhbCkgOiBudWxsOwogICAgY29uc3QgY2xhc3NDb3VudCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoIltjbGFzc10iKS5sZW5ndGg7CiAgICBjb25zdCBidXR0b25SYWRpdXMgPSBidXR0b25TdHlsZT8uYm9yZGVyUmFkaXVzIHx8IG51bGw7CiAgICBjb25zdCBpbnB1dFJhZGl1cyA9IGlucHV0U3R5bGU/LmJvcmRlclJhZGl1cyB8fCBudWxsOwogICAgY29uc3QgY2FyZFJhZGl1cyA9IGNhcmRTdHlsZT8uYm9yZGVyUmFkaXVzIHx8IG51bGw7CiAgICBjb25zdCBuYXRpdmVMaWtlbHkgPSAhY2FyZCB8fCAhcG9ydGFsIHx8IGNsYXNzQ291bnQgPCAyMCB8fCByYWRpdXNOdW1iZXIoYnV0dG9uUmFkaXVzKSA8IDggfHwgcmFkaXVzTnVtYmVyKGlucHV0UmFkaXVzKSA8IDggfHwgcmFkaXVzTnVtYmVy"
    "KGNhcmRSYWRpdXMpIDwgMTY7CiAgICByZXR1cm4gewogICAgICBocmVmOiBsb2NhdGlvbi5ocmVmLAogICAgICByZWFkeVN0YXRlOiBkb2N1bWVudC5yZWFkeVN0YXRlLAogICAgICBjbGFzc0NvdW50LAogICAgICBjYXJkRm91bmQ6ICEhY2FyZCwKICAgICAgcG9ydGFsRm91bmQ6ICEhcG9ydGFsLAogICAgICBib2R5QmFja2dyb3VuZDogYm9keVN0eWxlLmJhY2tncm91bmRDb2xvciwKICAgICAgcG9ydGFsQmFja2dyb3VuZDogcG9ydGFsU3R5bGU/LmJhY2tncm91bmRDb2xvciB8fCBudWxsLAogICAgICBjYXJkQm9yZGVyUmFkaXVzOiBjYXJkUmFkaXVzLAogICAgICBidXR0b25Cb3JkZXJSYWRpdXM6IGJ1dHRvblJhZGl1cywKICAgICAgaW5wdXRCb3JkZXJSYWRpdXM6IGlucHV0UmFkaXVzLAogICAgICBidXR0b25CYWNrZ3JvdW5kOiBidXR0b25TdHlsZT8uYmFja2dyb3VuZENvbG9yIHx8IG51bGwsCiAgICAgIGlucHV0QmFja2dyb3VuZDogaW5wdXRTdHlsZT8uYmFja2dyb3VuZENvbG9yIHx8IG51bGwsCiAgICAgIG5hdGl2ZUxpa2VseQogICAgfTsKICB9KSgpYDsKCiAgY29uc3QgZXZhbFJlc3VsdCA9IGF3YWl0IGNsaWVudC5zZW5kKCJSdW50aW1lLmV2YWx1YXRlIiwgeyBleHByZXNzaW9uLCBhd2FpdFByb21pc2U6IHRydWUsIHJldHVybkJ5VmFsdWU6IHRydWUgfSk7CiAgY2xpZW50LmNsb3NlKCk7CiAgcHJpbnQoeyBhdmFpbGFibGU6IHRydWUsIGJyb3dzZXJQYXRoLCAuLi5ldmFsUmVzdWx0LnJlc3VsdC52"
    "YWx1ZSB9KTsKfSBjYXRjaCAoZXJyb3IpIHsKICBwcmludCh7IGF2YWlsYWJsZTogZmFsc2UsIHJlYXNvbjogZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBTdHJpbmcoZXJyb3IpIH0pOwp9IGZpbmFsbHkgewogIHRyeSB7IGJyb3dzZXIua2lsbCgpOyB9IGNhdGNoIHt9CiAgdHJ5IHsgZnMucm1TeW5jKHByb2ZpbGVEaXIsIHsgcmVjdXJzaXZlOiB0cnVlLCBmb3JjZTogdHJ1ZSB9KTsgfSBjYXRjaCB7fQp9"
  )
  $nodeB64 = ($nodeB64Parts -join "")
  $nodeScript = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($nodeB64))
  $scriptPath = Join-Path $env:TEMP "worktree2-browser-style-check.mjs"
  Set-Content -LiteralPath $scriptPath -Value $nodeScript -Encoding UTF8
  $output = & node $scriptPath $url 2>&1
  $jsonLine = @($output | Where-Object { $_ -match '^\s*\{' } | Select-Object -Last 1)

  if (-not $jsonLine) {
    return [pscustomobject]@{ available = $false; reason = ($output -join "`n") }
  }

  return $jsonLine | ConvertFrom-Json
}

$failures = New-Object System.Collections.Generic.List[string]
$results = @{}
$htmlByRoute = @{}
$cssUrlSet = New-Object System.Collections.Generic.HashSet[string]
$nativeReports = @()

foreach ($route in $routes) {
  $response = Invoke-RawRequest $route.Url
  $statusCode = [int]$response.StatusCode
  $results[$route.Name] = $statusCode

  if ($route.Expected -notcontains $statusCode) {
    $failures.Add("$($route.Name) unexpected status: $statusCode")
  }

  $content = [string]$response.Content
  $htmlByRoute[$route.Name] = $content

  if ($content) {
    foreach ($cssUrl in Get-CssUrls $content) {
      [void]$cssUrlSet.Add($cssUrl)
    }
  }

  if ($route.RequireStyledHtml -and $statusCode -eq 200) {
    $report = Test-NativeHtml $route.Name $content
    $nativeReports += $report
    if ($report.NativeLikely) {
      $failures.Add("$($route.Name) native HTML suspected: $($report.Reasons -join '; ')")
    }
  }

  if ($route.Name -eq "admin-ingest" -and $statusCode -eq 200) {
    $report = Test-NativeHtml $route.Name $content
    $nativeReports += $report
    if ($report.NativeLikely) {
      $failures.Add("admin-ingest native HTML suspected: $($report.Reasons -join '; ')")
    }
  }
}

$cssUrls = @($cssUrlSet)
$cssAll200 = $true
$tailwindCssHit = $false
$cssStatuses = @()
$tailwindNeedles = @("--tw-", ".flex", ".rounded", ".bg-", ".text-", "box-sizing:border-box", "tailwind")

if ($cssUrls.Count -eq 0) {
  $cssAll200 = $false
  $failures.Add("CSS file count is 0")
}

foreach ($cssUrl in $cssUrls) {
  try {
    $cssResponse = Invoke-RawRequest $cssUrl
    $status = [int]$cssResponse.StatusCode
    $content = [string]$cssResponse.Content
    $length = $content.Length
    $cssStatuses += [pscustomobject]@{ Url = $cssUrl; Status = $status; Length = $length }

    if ($status -ne 200) {
      $cssAll200 = $false
      $failures.Add("CSS not 200: $cssUrl -> $status")
      continue
    }

    if ($length -le 0) {
      $cssAll200 = $false
      $failures.Add("CSS empty: $cssUrl")
      continue
    }

    foreach ($needle in $tailwindNeedles) {
      if ($content.Contains($needle)) {
        $tailwindCssHit = $true
        break
      }
    }
  } catch {
    $cssAll200 = $false
    $cssStatuses += [pscustomobject]@{ Url = $cssUrl; Status = "ERROR"; Length = 0 }
    $failures.Add("CSS request failed: $cssUrl")
  }
}

if (-not $tailwindCssHit) {
  $failures.Add("No Tailwind-like marker found in loaded CSS")
}

$browserCheck = Invoke-BrowserComputedStyleCheck "$baseUrl/ingest/login?app=ingest-admin&next=/admin-ingest"
if ($browserCheck.available -eq $true) {
  if ($browserCheck.nativeLikely -eq $true) {
    $failures.Add("Browser computed style indicates native HTML")
  }
}

Write-Host "login status code: $($results['login'])"
Write-Host "register status code: $($results['register'])"
Write-Host "activate status code: $($results['activate'])"
Write-Host "admin-ingest status code: $($results['admin-ingest'])"
Write-Host "css file count: $($cssUrls.Count)"
Write-Host "css all 200: $cssAll200"
Write-Host "css contains Tailwind: $tailwindCssHit"
foreach ($cssStatus in $cssStatuses) {
  Write-Host "css: $($cssStatus.Status) len=$($cssStatus.Length) $($cssStatus.Url)"
}

$nativeAny = $false
foreach ($report in $nativeReports) {
  if ($report.NativeLikely) { $nativeAny = $true }
  Write-Host "native html check [$($report.Name)]: suspected=$($report.NativeLikely) classes=$($report.ClassCount) buttons=$($report.ButtonWithClass)/$($report.ButtonCount) tailwindTokens=$($report.TailwindTokenHits)"
  if ($report.Reasons.Count -gt 0) {
    Write-Host "native html reasons [$($report.Name)]: $($report.Reasons -join '; ')"
  }
}
Write-Host "native html suspected: $nativeAny"

if ($browserCheck.available -eq $true) {
  Write-Host "browser computed style: available=true nativeLikely=$($browserCheck.nativeLikely) cardRadius=$($browserCheck.cardBorderRadius) buttonRadius=$($browserCheck.buttonBorderRadius) inputRadius=$($browserCheck.inputBorderRadius) classCount=$($browserCheck.classCount)"
  Write-Host "browser body background: $($browserCheck.bodyBackground); portal background: $($browserCheck.portalBackground)"
} else {
  Write-Host "browser computed style: available=false reason=$($browserCheck.reason)"
  Write-Host "browser computed style unavailable; HTTP/CSS/HTML structure checks completed."
}

if ($failures.Count -gt 0) {
  Write-Host "UI health check failed:" -ForegroundColor Red
  foreach ($failure in $failures) {
    Write-Host "- $failure" -ForegroundColor Red
  }
  exit 1
}

Write-Host "UI health check passed: CSS loads, Tailwind CSS is present, pages are not native HTML." -ForegroundColor Green
