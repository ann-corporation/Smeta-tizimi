param([Parameter(Mandatory=$true)][string]$ImageDirectory,[Parameter(Mandatory=$true)][string]$Output)
$ErrorActionPreference='Stop'
if (Test-Path -LiteralPath $Output) { throw 'OUTPUT_EXISTS' }
Add-Type -AssemblyName System.Runtime.WindowsRuntime
[Windows.Storage.StorageFile,Windows.Storage,ContentType=WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.BitmapDecoder,Windows.Graphics.Imaging,ContentType=WindowsRuntime] | Out-Null
[Windows.Media.Ocr.OcrEngine,Windows.Foundation,ContentType=WindowsRuntime] | Out-Null
[Windows.Globalization.Language,Windows.Globalization,ContentType=WindowsRuntime] | Out-Null
function Await-WinRT($Operation,$ResultType) {
  $method=[System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethodDefinition -and $_.GetParameters().Count -eq 1 -and $_.GetGenericArguments().Count -eq 1 } | Select-Object -First 1
  $task=$method.MakeGenericMethod($ResultType).Invoke($null,@($Operation));$task.Wait();return $task.Result
}
$engine=[Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage([Windows.Globalization.Language]::new('ru'))
if (!$engine) {throw 'RUSSIAN_OCR_UNAVAILABLE'}
$pages=@()
foreach($png in (Get-ChildItem -LiteralPath $ImageDirectory -Filter '*.png' | Sort-Object Name)) {
  $file=Await-WinRT ([Windows.Storage.StorageFile]::GetFileFromPathAsync($png.FullName)) ([Windows.Storage.StorageFile])
  $stream=Await-WinRT ($file.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
  try {
    $decoder=Await-WinRT ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
    $bitmap=Await-WinRT ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
    try {
      $result=Await-WinRT ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
      $lines=@()
      foreach($line in $result.Lines) {
        $words=@();foreach($word in $line.Words) {$b=$word.BoundingRect;$words+=@{text=$word.Text;x=$b.X;y=$b.Y;width=$b.Width;height=$b.Height}}
        $lines+=@{text=$line.Text;words=$words}
      }
      $pages+=@{image=$png.Name;width=$bitmap.PixelWidth;height=$bitmap.PixelHeight;lines=$lines;text=$result.Text}
      Write-Host ('OCR '+$png.Name)
    } finally {$bitmap.Dispose()}
  } finally {$stream.Dispose()}
}
$json=ConvertTo-Json -InputObject @($pages) -Depth 12
[System.IO.File]::WriteAllText($Output,$json,[System.Text.UTF8Encoding]::new($false))
