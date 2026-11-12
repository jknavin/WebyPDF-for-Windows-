# WebyPDF for Windows (v2)
Desktop app: sidebar navigation, glassmorphism UI, animated processing for every tool.
Shortcuts: Ctrl+K search, Ctrl+O choose file, Ctrl+Enter run, Esc back to Home, drag files anywhere.

## Build the .exe files on GitHub
1. Create a repo and upload everything in this folder (keep `.github/workflows/build-exe.yml`; if the web uploader skips the hidden `.github` folder, add that file by hand).
2. Actions tab -> "Build Windows EXE" -> Run workflow.
3. Download artifact `WebyPDF-Windows`:
   - WebyPDF-Setup-2.0.0.exe     (installer, Start menu + desktop shortcut)
   - WebyPDF-Portable-2.0.0.exe  (single file, no install, run from a USB drive)

Windows SmartScreen may say "unknown publisher" because the app is not code-signed: More info -> Run anyway.

## Build on your own PC
Install Node 20, then: npm install && npm run dist   (files appear in dist/)
