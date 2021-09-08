#!/usr/bin/env node

import inquirer from 'inquirer';
import encoding from 'encoding';
import iconvlite from 'iconv-lite';
import path from 'path';
import ora from 'ora';
import fs from 'fs';
import glob from 'glob';

// Get all files from current directory
glob('*.+(txt|srt)', {
	nocase: true
}, (err, foundFiles) => {
	inquirer
		.prompt({
			type: 'checkbox',
			name: 'files',
			message: 'Select files to convert',
			pageSize: 30,
			choices: foundFiles
		})
		.then((answers) => {
			answers.files.reduce(async (previousPromise, nextFile) => {
				await previousPromise;
				return new Promise((resolve, reject) => {
					const fileSingle = fs.readFileSync(nextFile);
					const data = Buffer.from(fileSingle, 'ascii');
					const translated = encoding.convert(data, 'UTF-8', 'CP1250');
					const converted = iconvlite.encode(translated, 'utf8').toString();
					const spinner = ora({
						text: `${path.basename(nextFile)} - processing...`,
						spinner: 'dots2'
					}).start();

					fs.writeFile(nextFile, converted, (error) => {
						if (error) {
							spinner.fail(`${path.basename(nextFile)} - failed`);
							console.error(error);
							reject(error);
						} else {
							spinner.succeed(`${path.basename(nextFile)} - DONE`);
						}
						resolve(nextFile);
					});
				})
					.catch((error) => {
						console.error(error.message);
					});
			}, Promise.resolve());
		})
		.catch((error) => {
			if (error.isTtyError) {
				console.error('Prompt couldn\'t be rendered in the current environment');
			} else {
				console.error('Something went wrong, please try again');
			}
			console.error(error);
		});
});
