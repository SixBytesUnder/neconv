#!/usr/bin/env node

import inquirer from 'inquirer';
import encoding from 'encoding';
import iconvlite from 'iconv-lite';
import path from 'path';
import ora from 'ora';
import fs from 'fs';
import { glob } from 'glob';

async function run() {
  // Get all files from current directory
  const foundFiles = await glob('*.{txt,srt}', {
    nocase: true
  });

  inquirer
    .prompt({
      type: 'checkbox',
      name: 'files',
      message: 'Select files to convert',
      pageSize: 30,
      choices: foundFiles
    })
    .then((answers) => {
      const files = answers.files.map((file) => {
        return new Promise((resolve, reject) => {
          fs.readFile(file, (error, data) => {
            if (error) {
              reject(error);
            } else {
              const translated = encoding.convert(data, 'ASCII', 'CP1250');
              const converted = iconvlite.encode(translated, 'utf8').toString();
              const spinner = ora({
                text: `${path.basename(file)} - processing...`,
                spinner: 'dots2'
              }).start();

              fs.writeFile(file, converted, (errorFS) => {
                if (errorFS) {
                  spinner.fail(`${path.basename(file)} - failed`);
                  console.error(errorFS);
                } else {
                  spinner.succeed(`${path.basename(file)} - DONE`);
                }
                spinner.stop();
                resolve();
              });
            }
          });
        });
      });

      Promise.all(files).then(() => {
        // All files processed
        console.log('All files processed');
      }).catch((error) => {
        console.log(error);
      });
    })
    .catch((error) => {
      if (error.isTtyError) {
        console.error('Prompt couldn\'t be rendered in the current environment');
      } else {
        console.error('Something went wrong, please try again');
      }
      console.error(error);
    });
}

run();
