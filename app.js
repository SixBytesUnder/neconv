#!/usr/bin/env node

import inquirer from 'inquirer';
import iconvlite from 'iconv-lite';
import path from 'path';
import ora from 'ora';
import { isUtf8 } from 'node:buffer';
import { readFile, writeFile, rename, unlink } from 'fs/promises';
import { glob } from 'glob';
import jschardet from 'jschardet';
import {
  isServerRunning,
  startServer,
  stopServer,
  loadBielikModel,
  repairBrokenLinesWithBielik
} from './lmstudio.js';

const CONFIDENCE_THRESHOLD = 0.8;
const SUPPORTED_ENCODINGS = new Set([
  'CP1250',
  'WINDOWS-1250',
  'ISO-8859-2',
  'UTF-16LE',
  'UTF-16BE',
  'UTF-16'
]);

export async function getFiles () {
  return glob('*.{txt,srt}', { nocase: true, nodir: true });
}

export async function promptUser (files) {
  return inquirer.prompt({
    type: 'checkbox',
    name: 'files',
    message: 'Select files to convert',
    pageSize: 30,
    choices: files
  });
}

export function detectSourceEncoding (data) {
  // 1. Detect Byte Order Marks (BOM)
  if (data.length >= 2 && data[0] === 0xFF && data[1] === 0xFE) {
    return 'UTF-16LE';
  }
  if (data.length >= 2 && data[0] === 0xFE && data[1] === 0xFF) {
    return 'UTF-16BE';
  }
  if (data.length >= 3 && data[0] === 0xEF && data[1] === 0xBB && data[2] === 0xBF) {
    return 'UTF-8';
  }

  // 2. Check if already valid UTF-8
  if (isUtf8(data)) {
    return 'UTF-8';
  }

  // 3. Fallback to charset detection
  const detected = jschardet.detect(data);
  if (detected && detected.encoding && detected.confidence >= CONFIDENCE_THRESHOLD) {
    const enc = detected.encoding.toUpperCase();
    if (SUPPORTED_ENCODINGS.has(enc) && iconvlite.encodingExists(enc)) {
      return detected.encoding;
    }
  }

  return 'CP1250';
}

export async function processFile (file, lmContext = null) {
  const spinner = ora({
    text: `${path.basename(file)} - processing...`,
    spinner: 'dots2'
  }).start();

  const tempFile = `${file}.tmp.${Date.now()}`;

  try {
    const data = await readFile(file);
    const sourceEncoding = detectSourceEncoding(data);

    let converted;
    let needsWrite = false;

    if (sourceEncoding === 'UTF-8') {
      converted = data.toString('utf8');
      // Strip UTF-8 BOM if present
      if (converted.charCodeAt(0) === 0xFEFF) {
        converted = converted.slice(1);
        needsWrite = true;
      }
    } else {
      spinner.text = `${path.basename(file)} - converting [${sourceEncoding} -> UTF-8]...`;
      converted = iconvlite.decode(data, sourceEncoding, { stripBOM: true });
      needsWrite = true;
    }

    if (converted.includes('\uFFFD')) {
      spinner.text = `${path.basename(file)} - checking LM Studio server...`;

      if (lmContext) {
        await lmContext.ensureReady(spinner, file);
      } else {
        const isRunning = await isServerRunning();
        if (!isRunning) {
          spinner.text = `${path.basename(file)} - starting LM Studio server...`;
          await startServer();
        }
        spinner.text = `${path.basename(file)} - loading Bielik model...`;
        await loadBielikModel();
      }

      spinner.text = `${path.basename(file)} - repairing broken lines with Bielik...`;
      converted = await repairBrokenLinesWithBielik(converted, undefined, (done, total) => {
        spinner.text = `${path.basename(file)} - Bielik repairing lines (${done}/${total})...`;
      });
      needsWrite = true;
    }

    if (!needsWrite) {
      spinner.info(`${path.basename(file)} - already UTF-8 (skipped)`);
      return converted;
    }

    await writeFile(tempFile, converted, 'utf8');
    await rename(tempFile, file);

    spinner.succeed(`${path.basename(file)} - DONE`);
    return converted;
  } catch (error) {
    try {
      await unlink(tempFile);
    } catch {
      // Ignore cleanup error if tempFile was never created
    }
    spinner.fail(`${path.basename(file)} - failed`);
    console.error(`Error processing ${path.basename(file)}:`, error);
    return null;
  } finally {
    spinner.stop();
  }
}

export async function run () {
  const foundFiles = await getFiles();

  if (foundFiles.length === 0) {
    console.log('No .txt or .srt files found in the current directory.');
    return;
  }

  let answers;
  try {
    answers = await promptUser(foundFiles);
  } catch (error) {
    if (error.name === 'ExitPromptError') {
      console.log('Operation cancelled.');
      return;
    }
    throw error;
  }

  if (!answers || !answers.files || answers.files.length === 0) {
    console.log('No files selected.');
    return;
  }

  let lmStudioUsed = false;
  const lmContext = {
    async ensureReady (spinner, file) {
      if (!lmStudioUsed) {
        const isRunning = await isServerRunning();
        if (!isRunning) {
          if (spinner) {
            spinner.text = `${path.basename(file)} - starting LM Studio server...`;
          }
          await startServer();
        }
        if (spinner) {
          spinner.text = `${path.basename(file)} - loading Bielik model...`;
        }
        await loadBielikModel();
        lmStudioUsed = true;
      }
    }
  };

  let failures = 0;
  try {
    for (const file of answers.files) {
      const result = await processFile(file, lmContext);
      if (result === null) {
        failures += 1;
      }
    }
  } finally {
    if (lmStudioUsed) {
      const shutdownSpinner = ora('Shutting down LM Studio server...').start();
      try {
        await stopServer();
        shutdownSpinner.succeed('LM Studio server shut down.');
      } catch (err) {
        shutdownSpinner.fail(`Failed to stop LM Studio server: ${err.message}`);
      }
    }
  }

  if (failures > 0) {
    process.exitCode = 1;
  }
}

if (process.env.NODE_ENV !== 'test') {
  run().catch((error) => {
    console.error('An unexpected error occurred:', error);
    process.exit(1);
  });
}
