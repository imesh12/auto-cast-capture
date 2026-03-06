const fs = require("fs");
const path = require("path");

function copyDir(src, dest) {
  if (!fs.existsSync(src)) {
    console.error("[copy-capture] Source not found:", src);
    process.exit(1);
  }
  fs.mkdirSync(dest, { recursive: true });

  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);

    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

const root = path.join(__dirname, "..");
const src = path.join(root, "public", "capture");
const dest = path.join(root, "build", "capture");

copyDir(src, dest);
console.log("[copy-capture] OK:", src, "->", dest);