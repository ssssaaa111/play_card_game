Add-Type -AssemblyName System.Speech

$root = if ($PSScriptRoot) { Split-Path -Parent $PSScriptRoot } else { (Get-Location).Path }
$outDir = Join-Path $root "assets\voice"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$voiceName = "Microsoft Huihui Desktop"
$lines = @(
  @{ File = "player-start.wav"; Rate = 0; Text64 = "5Yaz5paX5byA5aeL77yM5pif6a2C5Zue5bqU5oiR55qE5Y+s5ZSk44CC" },
  @{ File = "player-turn.wav"; Rate = 0; Text64 = "6L2u5Yiw5oiR5LqG77yM5oq95Y2h44CC" },
  @{ File = "player-draw.wav"; Rate = 1; Text64 = "5oq95Y2h77yM5paw55qE5Y+v6IO95oCn5p2l5LqG44CC" },
  @{ File = "player-summon.wav"; Rate = 0; Text64 = "5Zue5bqU5oiR55qE5ZG85ZSk77yM6ZmN5Li05oiY5Zy644CC" },
  @{ File = "player-ace.wav"; Rate = -1; Text64 = "546L54mM55m75Zy677yM5pKV5byA5oiY5bGA5ZCn44CC" },
  @{ File = "player-spell.wav"; Rate = 0; Text64 = "6a2U5rOV5Y+R5Yqo77yM5pif5YWJ5ZCs5oiR5Y+35Luk44CC" },
  @{ File = "player-trap.wav"; Rate = 0; Text64 = "6L+e6ZSB5Y+R5Yqo77yM5bCx5piv546w5Zyo44CC" },
  @{ File = "player-attack.wav"; Rate = -1; Text64 = "5YWo5Yqb5pS75Ye777yM6LSv56m/6Ziy57q/44CC" },
  @{ File = "player-direct.wav"; Rate = -1; Text64 = "55u05o6l5pS75Ye777yM6LSv56m/55Sf5ZG95YC844CC" },
  @{ File = "player-hit.wav"; Rate = 0; Text64 = "6L+Z54K55Yay5Ye777yM6L+Y5oyh5LiN5L2P5oiR44CC" },
  @{ File = "player-break.wav"; Rate = 0; Text64 = "5Ye756C055uu5qCH77yM57un57ut5Y6L5Yi244CC" },
  @{ File = "player-combo.wav"; Rate = -1; Text64 = "57uE5ZCI5oqA5Y+R5Yqo77yM5pif6ISJ6L+e5pC644CC" },
  @{ File = "player-shield.wav"; Rate = 0; Text64 = "5oqk55u+5bGV5byA77yM5a6I5L2P5oiY57q/44CC" },
  @{ File = "player-win.wav"; Rate = -1; Text64 = "6IOc5Yip5bGe5LqO5pif6a2C44CC" },
  @{ File = "player-lose.wav"; Rate = -1; Text64 = "6L+Y5rKh57uT5p2f77yM5oiR5Lya5YaN56uZ6LW35p2l44CC" },
  @{ File = "ai-turn.wav"; Rate = -2; Text64 = "6L2u5Yiw5oiR5LqG77yM5L2g55qE6IOc566X5q2j5Zyo5bSp5aGM44CC" },
  @{ File = "ai-draw.wav"; Rate = -1; Text64 = "5oq95Y2h77yM5ZG96L+Q56uZ5Zyo5oiR6L+Z6L6544CC" },
  @{ File = "ai-summon.wav"; Rate = -2; Text64 = "546w6Lqr5ZCn77yM5Y6L56KO5LuW55qE6Ziy57q/44CC" },
  @{ File = "ai-ace.wav"; Rate = -2; Text64 = "6L+Z5bCx5piv57uI57uT5oiY5bGA55qE546L54mM44CC" },
  @{ File = "ai-spell.wav"; Rate = -2; Text64 = "5Y+R5Yqo6a2U5rOV5Y2h77yM5bGA5Yq/5bey57uP5pS55Y+Y44CC" },
  @{ File = "ai-trap.wav"; Rate = -2; Text64 = "6Zm36Zix5bey57uP562J5L2g5b6I5LmF5LqG44CC" },
  @{ File = "ai-attack.wav"; Rate = -2; Text64 = "57KJ56KO55uu5qCH77yM5Yir57uZ5LuW5ZaY5oGv44CC" },
  @{ File = "ai-direct.wav"; Rate = -2; Text64 = "55u05o6l5pS75Ye777yM55Sf5ZG95YC85LiL6ZmN44CC" },
  @{ File = "ai-hit.wav"; Rate = -2; Text64 = "5ZO877yM6L+Y5beu5b6X6L+c44CC" },
  @{ File = "ai-break.wav"; Rate = -2; Text64 = "55uu5qCH56C05Z2P77yM5pS75Yq/57un57ut44CC" },
  @{ File = "ai-combo.wav"; Rate = -2; Text64 = "57uE5ZCI5oqA5Y+R5Yqo77yM5pqX5b2x5Y6L6L+r44CC" },
  @{ File = "ai-shield.wav"; Rate = -2; Text64 = "6Ziy57q/5bGV5byA77yM5L2g56qB56C05LiN5LqG44CC" },
  @{ File = "ai-win.wav"; Rate = -2; Text64 = "5Yaz5paX57uT5p2f77yM5L2g5bey57uP6L6T5LqG44CC" },
  @{ File = "ai-lose.wav"; Rate = -2; Text64 = "56uf54S26KKr5L2g6YCG6L2s5LqG44CC" },
  @{ File = "common-clash.wav"; Rate = -1; Text64 = "5Y+M5pa55oCq5YW95ZCM5b2S5LqO5bC944CC" },
  @{ File = "common-damage.wav"; Rate = -1; Text64 = "5Y+X5Yiw5Lyk5a6z44CC" },
  @{ File = "common-heal.wav"; Rate = 0; Text64 = "55Sf5ZG95YC85Zue5aSN44CC" }
)

foreach ($line in $lines) {
  $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
  $synth.Volume = 100
  $synth.Rate = $line.Rate
  try {
    $synth.SelectVoice($voiceName)
  } catch {
    # Fall back to any installed Chinese voice.
  }
  $path = Join-Path $outDir $line.File
  $text = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($line.Text64))
  $synth.SetOutputToWaveFile($path)
  $synth.Speak($text)
  $synth.SetOutputToNull()
  $synth.Dispose()
}

Write-Host "Generated $($lines.Count) voice files in $outDir"
