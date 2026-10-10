# Renders narration segments to WAV files with the Windows speech engine.
# Usage: powershell -File tts.ps1 -Manifest segments.json -OutDir <dir> [-Voice "Microsoft Zira Desktop"] [-Rate 0]
param(
    [Parameter(Mandatory = $true)][string]$Manifest,
    [Parameter(Mandatory = $true)][string]$OutDir,
    [string]$Voice = "Microsoft Zira Desktop",
    [int]$Rate = 0
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Speech

$segments = Get-Content -Raw -Path $Manifest | ConvertFrom-Json
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
    $available = $synth.GetInstalledVoices() | ForEach-Object { $_.VoiceInfo.Name }
    if ($available -contains $Voice) { $synth.SelectVoice($Voice) }
    $synth.Rate = $Rate

    foreach ($seg in $segments) {
        $target = Join-Path $OutDir ("{0}.wav" -f $seg.id)
        $synth.SetOutputToWaveFile($target)
        $synth.Speak([string]$seg.say)
        $synth.SetOutputToNull()
        Write-Output $target
    }
}
finally {
    $synth.Dispose()
}
