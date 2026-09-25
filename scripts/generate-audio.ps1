$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
Add-Type -AssemblyName System.Speech
$speaker = New-Object System.Speech.Synthesis.SpeechSynthesizer
$speaker.SelectVoice('Microsoft Zira Desktop')
$speaker.Rate = -1
$format = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(22050, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
$manifest = Get-Content audio/manifest.json -Raw -Encoding UTF8 | ConvertFrom-Json
try {
 foreach ($entry in $manifest.PSObject.Properties) {
  $target = Join-Path (Get-Location) $entry.Value
  if (Test-Path -LiteralPath $target) { continue }
  $speaker.SetOutputToWaveFile($target, $format)
  $speaker.Speak($entry.Name)
  $speaker.SetOutputToNull()
 }
} finally { $speaker.Dispose() }
Write-Output 'Audio generation complete'
