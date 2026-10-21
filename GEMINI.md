# Gemini Code Assistant Project Overview

## Project: neconv

This project is a command-line utility for converting the character encoding of subtitle files.

### Key Features

- Converts `.txt` and `.srt` files from CP1250, ISO-8859-2, and UTF-16 (LE/BE, e.g. from NapiProjekt) to clean UTF-8 encoding.
- Automatically transforms `.txt` subtitle formats (MicroDVD, MPL2, TMPlayer) into standard `.srt` format, preserving the original `.txt` file and saving the converted subtitles as `.srt`.
- Heals broken subtitle characters (`\uFFFD`) using local LM Studio with the Bielik model using full line context.
- Automatically manages LM Studio server lifecycle (starts server if needed, loads Bielik, and shuts down server upon completion).
- Provides an interactive interface to select files for conversion.
- Displays progress indicators during the conversion process.

### Technical Details

- **Language:** JavaScript (ESM)
- **Platform:** Node.js
- **Dependencies:**
  - `inquirer`: For user prompts.
  - `glob`: For file searching.
  - `iconv-lite`: For character encoding conversion.
  - `ora`: For loading spinners.
- **Testing:**
  - **Framework:** Node.js Built-in Test Runner (`node:test`, `node:assert`)
  - **Command:** `npm test` (or `npm run test:coverage`)
- **Linting:**
  - **Linter:** ESLint
  - **Configuration:** `neostandard`

### How to Use

1.  Run the application using the `neconv` command in your terminal.
2.  Select the files you want to convert from the list.
3.  The selected files will be converted in place.

### Workflow Guidelines

- Whenever a task or feature is completed, automatically bump the script version (in `package.json` and `package-lock.json`) and commit all changes to git with a clear, descriptive message.
