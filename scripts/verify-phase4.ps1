$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$functions = @(
  'login',
  'initDB',
  'importQuestions',
  'getQuestionBank',
  'managePlan',
  'managePractice',
  'generateAIAnalysis',
  'manageExperience',
  'submitFeedback',
  'migratePlanScopedStates'
)

foreach ($functionName in $functions) {
  $entry = Join-Path $projectRoot "cloudfunctions/$functionName/index.js"
  if (-not (Test-Path -LiteralPath $entry)) { throw "Missing cloud function entry: $entry" }
  node --check $entry
  if ($LASTEXITCODE -ne 0) { throw "Cloud function syntax check failed: $functionName" }
}

$sourceFiles = Get-ChildItem -Path $projectRoot -Recurse -File | Where-Object {
  $_.FullName -notmatch '[\\/]node_modules[\\/]' -and $_.FullName -notmatch '[\\/]\.git[\\/]'
}
$secretMatches = $sourceFiles | Select-String -Pattern 'sk-[A-Za-z0-9_-]{16,}' -List
if ($secretMatches) {
  $paths = $secretMatches | ForEach-Object { $_.Path }
  throw "Possible API key found. Move it to cloud function environment variables: $($paths -join ', ')"
}

Write-Output 'Pre-release static checks passed: cloud function syntax valid; no possible API key found.'
