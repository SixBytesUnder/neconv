#!/usr/bin/env node

import inquirer from 'inquirer';
import encoding from 'encoding';
import iconvlite from 'iconv-lite';
import path from 'path';
import ora from 'ora';
import { readFile, writeFile } from 'fs/promises';
import { glob } from 'glob';
import jschardet from 'jschardet';

export async function getFiles () {
  return glob('*.{txt,srt}', { nocase: true });
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

export async function processFile (file) {
  const spinner = ora({
    text: `${path.basename(file)} - processing...`,
    spinner: 'dots2'
  }).start();

  try {
    const data = await readFile(file);
    const isPureUTF8 = Buffer.compare(Buffer.from(data.toString('utf8'), 'utf8'), data) === 0;

    let sourceEncoding = 'CP1250';
    if (isPureUTF8) {
      sourceEncoding = 'UTF-8';
    } else {
      const detected = jschardet.detect(data);
      if (detected && detected.encoding) {
        const enc = detected.encoding.toUpperCase();
        if (enc !== 'UTF-8' && enc !== 'ASCII' && enc !== 'WINDOWS-1252') {
          sourceEncoding = detected.encoding;
        }
      }
    }

    spinner.text = `${path.basename(file)} - processing [${sourceEncoding}]...`;

    const translated = encoding.convert(data, 'UTF-8', sourceEncoding);
    const converted = iconvlite.encode(translated, 'utf8').toString();

    await writeFile(file, converted);
    spinner.succeed(`${path.basename(file)} - DONE`);
    return converted;
  } catch (error) {
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

  const answers = await promptUser(foundFiles);

  if (answers && answers.files && answers.files.length > 0) {
    for (const file of answers.files) {
      await processFile(file);
    }
  }
}

// This allows the script to be executed directly, but also imported for testing.
if (process.env.NODE_ENV !== 'test') {
  run().catch((error) => {
    console.error('An unexpected error occurred:', error);
    process.exit(1);
  });
}
