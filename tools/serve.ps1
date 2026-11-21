# CIRCLO fallback static web server (used by run-circlo.bat when Python is not installed).
# Serves files from -Root on http://localhost:<Port>/ only (not reachable from other computers).
param([int]$Port = 8080, [string]$Root = (Split-Path -Parent $PSScriptRoot))
$ErrorActionPreference = 'Stop'
$Root = [System.IO.Path]::GetFullPath($Root).TrimEnd('\'); $RootSlash = $Root + '\'
$types = @{ '.html'='text/html; charset=utf-8'; '.css'='text/css; charset=utf-8'; '.js'='text/javascript; charset=utf-8'; '.json'='application/json';
  '.svg'='image/svg+xml'; '.png'='image/png'; '.jpg'='image/jpeg'; '.jpeg'='image/jpeg'; '.webp'='image/webp'; '.ico'='image/x-icon'; '.md'='text/plain; charset=utf-8' }
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
try { $listener.Start() } catch { Write-Host "[ERROR] Could not start on port $Port : $($_.Exception.Message)"; exit 1 }
Write-Host "Serving $Root on http://localhost:$Port/  (Ctrl+C or close the window to stop)"
try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext(); $req = $ctx.Request; $res = $ctx.Response
    try {
      $rel = [System.Uri]::UnescapeDataString($req.Url.AbsolutePath).TrimStart('/')
      if ($rel -eq '' -or $rel.EndsWith('/')) { $rel += 'index.html' }
      $path = [System.IO.Path]::GetFullPath((Join-Path $Root $rel))
      if ($path -ne $Root -and -not $path.StartsWith($RootSlash, [System.StringComparison]::OrdinalIgnoreCase)) { $res.StatusCode = 403 }
      elseif (Test-Path $path -PathType Container) { $res.StatusCode = 301; $res.RedirectLocation = $req.Url.AbsolutePath.TrimEnd('/') + '/' }
      elseif (Test-Path $path -PathType Leaf) {
        $bytes = [System.IO.File]::ReadAllBytes($path); $ext = [System.IO.Path]::GetExtension($path).ToLower()
        $res.ContentType = $(if ($types.ContainsKey($ext)) { $types[$ext] } else { 'application/octet-stream' })
        $res.Headers.Add('Cache-Control', 'no-store'); $res.ContentLength64 = $bytes.Length; $res.OutputStream.Write($bytes, 0, $bytes.Length)
      } else { $res.StatusCode = 404; $b = [Text.Encoding]::UTF8.GetBytes('Not found'); $res.OutputStream.Write($b, 0, $b.Length) }
      Write-Host ("{0} {1} {2}" -f (Get-Date -Format 'HH:mm:ss'), $res.StatusCode, $req.Url.AbsolutePath)
    } catch { $res.StatusCode = 500 } finally { $res.Close() }
  }
} finally { $listener.Stop() }
