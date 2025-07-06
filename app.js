#!/usr/bin/env node

import inquirer from 'inquirer';
import encoding from 'encoding';
import iconvlite from 'iconv-lite';
import path from 'path';
import ora from 'ora';
import { readFile, writeFile } from 'fs';
import { glob } from 'glob';

export async function getFiles() {
  return glob('*.{txt,srt}', { nocase: true });
}

export async function promptUser(files) {
  return inquirer.prompt({
    type: 'checkbox',
    name: 'files',
    message: 'Select files to convert',
    pageSize: 30,
    choices: files
  });
}

export function processFile(file) {
  return new Promise((resolve, reject) => {
    readFile(file, (error, data) => {
      if (error) {
        reject(error);
      } else {
        const translated = encoding.convert(data, 'UTF-8', 'CP1250');
        const converted = iconvlite.encode(translated, 'utf8').toString();
        const spinner = ora({
          text: `${path.basename(file)} - processing...`,
          spinner: 'dots2'
        }).start();

        writeFile(file, converted, (errorFS) => {
          if (errorFS) {
            spinner.fail(`${path.basename(file)} - failed`);
            console.error(errorFS);
          } else {
            spinner.succeed(`${path.basename(file)} - DONE`);
          }
          spinner.stop();
          resolve(converted);
        });
      }
    });
  });
}

async function run() {
  const foundFiles = await getFiles();
  const answers = await promptUser(foundFiles);
  const files = answers.files.map(processFile);
  await Promise.all(files);
}

run();
