import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "export");
const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
const zipPath = path.join(outDir, `solopulse-netlify-${stamp}.zip`);
const readyPath = path.join(outDir, "solopulse-netlify-READY.zip");
const stage = path.join(outDir, "solopulse-src");

const INCLUDE = [
  "src",
  "public",
  "scripts",
  "package.json",
  "package-lock.json",
  "next.config.ts",
  "tsconfig.json",
  "tailwind.config.ts",
  "postcss.config.mjs",
  "next-env.d.ts",
  "netlify.toml",
  ".gitignore",
  ".eslintrc.json",
  "README.md",
  "NETLIFY.md",
  "DEPLOY_NETLIFY.txt",
  "UPDATE.md",
  "start-solopulse.bat",
  "start-miner-tunnel.bat",
  "deploy-netlify.bat",
  "update-and-deploy.bat",
];

function rmrf(p) {
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
}

function copyRecursive(src, dest) {
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const name of fs.readdirSync(src)) {
      if (["node_modules", ".next", ".git", "export", ".netlify"].includes(name)) continue;
      if (name === "run-miner-tunnel-hidden.bat") continue;
      if (name === "pack-simple.mjs") continue;
      copyRecursive(path.join(src, name), path.join(dest, name));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

console.log("root=", root);
fs.mkdirSync(outDir, { recursive: true });
rmrf(stage);
fs.mkdirSync(stage, { recursive: true });

for (const rel of INCLUDE) {
  const src = path.join(root, rel);
  if (!fs.existsSync(src)) {
    console.warn("skip", rel);
    continue;
  }
  console.log("copy", rel);
  copyRecursive(src, path.join(stage, rel));
}

fs.writeFileSync(
  path.join(stage, "PACKAGE_MANIFEST.json"),
  JSON.stringify(
    {
      name: "solopulse",
      purpose: "Netlify permanent source package",
      createdAt: new Date().toISOString(),
      build: "npm run build",
      node: ">=20",
    },
    null,
    2
  )
);

const must = ["package.json", "src", "netlify.toml", "DEPLOY_NETLIFY.txt"];
for (const r of must) {
  if (!fs.existsSync(path.join(stage, r))) {
    console.error("FATAL missing", r);
    process.exit(1);
  }
}

if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

// Use .NET ZipFile from PowerShell with -LiteralPath for unicode home paths
const stageEsc = stage.replace(/'/g, "''");
const zipEsc = zipPath.replace(/'/g, "''");
const ps = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
if (Test-Path -LiteralPath '${zipEsc}') { Remove-Item -LiteralPath '${zipEsc}' -Force }
$zip = [System.IO.Compression.ZipFile]::Open('${zipEsc}', 'Create')
function Add-Dir($dir, $base) {
  Get-ChildItem -LiteralPath $dir -Force | ForEach-Object {
    $rel = $_.FullName.Substring($base.Length).TrimStart('\\','/')
    $rel = $rel -replace '\\\\','/'
    if ($_.PSIsContainer) {
      [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile
      # add directory marker optional
      Add-Dir $_.FullName $base
    } else {
      [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $rel, 'Optimal') | Out-Null
    }
  }
}
$base = (Resolve-Path -LiteralPath '${stageEsc}').Path
if (-not $base.EndsWith('\\')) { $base = $base + '\\' }
Add-Dir $base.TrimEnd('\\') $base
$zip.Dispose()
Write-Host "ZIP_OK"
`;

try {
  execFileSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps], {
    stdio: "inherit",
    windowsHide: true,
  });
} catch (e) {
  console.error("zip failed, fallback Compress-Archive");
  execFileSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      `Compress-Archive -Path (Join-Path '${stageEsc}' '*') -DestinationPath '${zipEsc}' -Force`,
    ],
    { stdio: "inherit", windowsHide: true }
  );
}

if (!fs.existsSync(zipPath) || fs.statSync(zipPath).size < 1000) {
  console.error("zip missing or too small");
  process.exit(1);
}

fs.copyFileSync(zipPath, readyPath);

const docs = path.join(os.homedir(), "Documents", "solopulse-export");
try {
  fs.mkdirSync(docs, { recursive: true });
  fs.copyFileSync(readyPath, path.join(docs, "solopulse-netlify-READY.zip"));
  fs.copyFileSync(zipPath, path.join(docs, path.basename(zipPath)));
  console.log("docs=", docs);
} catch (e) {
  console.warn("docs copy failed", e.message);
}

// verify essentials by extracting list via PowerShell
const listPs = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$z=[IO.Compression.ZipFile]::OpenRead('${readyPath.replace(/'/g, "''")}')
$names=@($z.Entries | ForEach-Object { $_.FullName })
$z.Dispose()
$need=@('package.json','src/app/page.tsx','netlify.toml','UPDATE.md')
foreach($n in $need){
  $ok = $false
  $target = $n.Replace('\\','/')
  foreach($e in $names){
    $ee = ($e -replace '\\\\','/')
    if($ee -eq $target -or $ee.EndsWith('/' + $target) -or $ee.Contains($target)){ $ok=$true; break }
  }
  if(-not $ok){ throw "missing $n" }
}
Write-Host ('entries=' + $names.Count)
exit 0
`;
try {
  execFileSync("powershell.exe", ["-NoProfile", "-Command", listPs], {
    stdio: "inherit",
    windowsHide: true,
  });
} catch (e) {
  console.error("verify failed", e.message);
  process.exit(1);
}

rmrf(stage);
console.log("READY", readyPath, (fs.statSync(readyPath).size / 1024).toFixed(1) + "KB");
console.log("STAMPED", zipPath);
console.log("\nDeploy: deploy-netlify.bat  |  update later: update-and-deploy.bat");
console.log("Board on Netlify: start-miner-tunnel.bat → paste URL in device field");
process.exit(0);
