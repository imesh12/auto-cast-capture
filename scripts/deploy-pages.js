const fs = require("fs");
const path = require("path");

const root = process.cwd();
const outDir = path.join(root, ".pages-dist");

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);

  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
    return;
  }

  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

// publish only frontend static files
copyRecursive(path.join(root, "public", "capture"), path.join(outDir, "capture"));

// if hls.js is in public root, copy it too
const hlsSrc = path.join(root, "public", "hls.js");
if (fs.existsSync(hlsSrc)) {
  copyRecursive(hlsSrc, path.join(outDir, "hls.js"));
}

// prevent Jekyll processing
fs.writeFileSync(path.join(outDir, ".nojekyll"), "");

// optional: simple index redirect to capture page
fs.writeFileSync(
  path.join(outDir, "index.html"),
  `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="refresh" content="0; url=./capture/" />
    <title>Redirecting...</title>
  </head>
  <body>
    <p>Redirecting to <a href="./capture/">capture</a>...</p>
  </body>
</html>`
);

console.log("Pages build created at:", outDir);