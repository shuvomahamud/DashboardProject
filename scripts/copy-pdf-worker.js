"use strict";

const { createRequire } = require("module");
const fs = require("fs");
const path = require("path");

const requireFromProject = createRequire(path.join(process.cwd(), "package.json"));

function copyWorker() {
  try {
    const workerPath = requireFromProject.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs");
    const targetDir = path.join(process.cwd(), "public");
    const targetPath = path.join(targetDir, "pdf.worker.mjs");

    fs.mkdirSync(targetDir, { recursive: true });
    fs.copyFileSync(workerPath, targetPath);
    console.log(`[pdfjs] Copied worker to ${path.relative(process.cwd(), targetPath)}`);
  } catch (error) {
    console.warn("[pdfjs] Unable to copy pdf.worker.mjs:", error.message);
  }
}

copyWorker();
