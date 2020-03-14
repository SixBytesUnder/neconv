#!/usr/bin/env node

const inquirer = require('inquirer');
const encoding = require('encoding');
const iconvlite = require('iconv-lite');
const path = require('path');
const ora = require('ora');
const fs = require('fs');
const glob = require('glob');

let files = [];

function recode() {
	files.reduce((accumulatorPromise, nextFile) => {
		return accumulatorPromise.then(() => {
			return new Promise((resolve) => {
				const fileSingle = fs.readFileSync(nextFile);
				const data = Buffer.from(fileSingle, 'ascii');
				const translated = encoding.convert(data, 'UTF-8', 'CP1250');
				const converted = iconvlite.encode(translated, 'utf8').toString();
				const spinner = ora({
					text: `${path.basename(nextFile)} - processing...`,
					spinner: 'dots2'
				}).start();

				fs.writeFile(nextFile, converted, (err) => {
					if (err) {
						spinner.fail(`${path.basename(nextFile)} - failed`);
						console.log(err);
					} else {
						spinner.succeed(`${path.basename(nextFile)} - DONE`);
					}
					resolve(nextFile);
				});
			});
		});
	}, Promise.resolve());
}

// Get all files from current directory
glob('*.+(txt|srt)', {
	nocase: true
}, (err, foundFiles) => {
	files = foundFiles;
});

inquirer
	.prompt([{
		type: 'list',
		name: 'range',
		message: 'Select range',
		choices: [{
			name: 'All files in current directory',
			value: 1
		}, {
			name: 'Select files manually',
			value: 2
		}]
	}])
	.then((answers) => {
		if (answers.range === 1) {
			recode();
		} else {
			inquirer
				.prompt({
					type: 'checkbox',
					name: 'files',
					message: 'Select files to convert',
					choices: files
				})
				.then((subAnswers) => {
					files = subAnswers.files;
					recode();
				})
				.catch((error) => {
					if (error.isTtyError) {
						console.log('Prompt couldn\'t be rendered in the current environment (2)');
					} else {
						console.log('Something went wrong, please try again (2)');
					}
				});
		}
	})
	.catch((error) => {
		if (error.isTtyError) {
			console.log('Prompt couldn\'t be rendered in the current environment (1)');
		} else {
			console.log(error);
			console.log('Something went wrong, please try again (1)');
		}
	});
