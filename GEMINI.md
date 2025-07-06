# Gemini Code Assistant Project Overview

## Project: neconv

This project is a command-line utility for converting the character encoding of subtitle files.

### Key Features

- Converts `.txt` and `.srt` files from CP1250 to UTF-8 encoding.
- Provides an interactive interface to select files for conversion.
- Displays progress indicators during the conversion process.

### Technical Details

- **Language:** JavaScript (ESM)
- **Platform:** Node.js
- **Dependencies:**
  - `inquirer`: For user prompts.
  - `glob`: For file searching.
  - `encoding`, `iconv-lite`: For character encoding conversion.
  - `ora`: For loading spinners.
- **Testing:**
  - **Framework:** Jest
  - **Command:** `npm test`
- **Linting:**
  - **Linter:** ESLint
  - **Configuration:** `eslint-config-airbnb-base`

### How to Use

1.  Run the application using the `neconv` command in your terminal.
2.  Select the files you want to convert from the list.
3.  The selected files will be converted in place.
