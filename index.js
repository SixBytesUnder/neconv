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
	return new Promise((resolve) => {
		const fileName = files.shift();
		const fileSingle = fs.readFileSync(fileName);
		const data = Buffer.from(fileSingle, 'ascii');
		const translated = encoding.convert(data, 'UTF-8', 'CP1250');
		const converted = iconvlite.encode(translated, 'utf8').toString();
		const spinner = ora({
			text: `${path.basename(fileName)} - processing...`,
			spinner: 'dots2'
		}).start();

		fs.writeFile(fileName, converted, (err) => {
			if (err) {
				spinner.fail(`${path.basename(fileName)} - failed`);
				console.log(err);
			} else {
				spinner.succeed(`${path.basename(fileName)} - DONE`);
			}
			resolve(files);
		});
	});
}

const loop = () => {
	return recode().then(() => {
		if (files.length > 0) {
			return loop();
		}
	});
};

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
			loop().then(() => {
				console.log('No more files to process or all files done.');
			});
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
					loop().then(() => {
						console.log('No more files to process or all files done.');
					});
				})
				.catch((error) => {
					if (error.isTtyError) {
						console.log('Prompt couldn\'t be rendered in the current environment');
					} else {
						console.log('Something went wrong, please try again');
					}
				});
		}
	})
	.catch((error) => {
		if (error.isTtyError) {
			console.log('Prompt couldn\'t be rendered in the current environment');
		} else {
			console.log('Something went wrong, please try again');
		}
	});
