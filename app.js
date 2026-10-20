#!/usr/bin/env node

import inquirer from 'inquirer';
import iconvlite from 'iconv-lite';
import path from 'path';
import ora from 'ora';
import { isUtf8 } from 'node:buffer';
import { readFile, writeFile, rename, unlink } from 'fs/promises';
import { glob } from 'glob';
import jschardet from 'jschardet';

const CONFIDENCE_THRESHOLD = 0.8;
const SUPPORTED_ENCODINGS = new Set(['CP1250', 'WINDOWS-1250', 'ISO-8859-2']);

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
  if (isUtf8(data)) {
    return 'UTF-8';
  }

  const detected = jschardet.detect(data);
  if (detected && detected.encoding && detected.confidence >= CONFIDENCE_THRESHOLD) {
    const enc = detected.encoding.toUpperCase();
    if (SUPPORTED_ENCODINGS.has(enc) && iconvlite.encodingExists(enc)) {
      return detected.encoding;
    }
  }

  return 'CP1250';
}

export async function processFile (file) {
  const spinner = ora({
    text: `${path.basename(file)} - processing...`,
    spinner: 'dots2'
  }).start();

  const tempFile = `${file}.tmp.${Date.now()}`;

  try {
    const data = await readFile(file);
    const sourceEncoding = detectSourceEncoding(data);

    if (sourceEncoding === 'UTF-8') {
      spinner.info(`${path.basename(file)} - already UTF-8 (skipped)`);
      return data.toString('utf8');
    }

    spinner.text = `${path.basename(file)} - processing [${sourceEncoding}]...`;

    const converted = iconvlite.decode(data, sourceEncoding);

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

  let failures = 0;
  for (const file of answers.files) {
    const result = await processFile(file);
    if (result === null) {
      failures += 1;
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
