#!/usr/bin/env node
'use strict';

const inquirer = require('inquirer');
const encoding = require('encoding');
const iconvlite = require('iconv-lite');
const path = require('path');
const ora = require('ora');
const fs = require('fs');
const glob = require('glob');
var files = [];

function recode() {
	var promise = new Promise((resolve) => {
		var fileName = files.shift();
		var fileSingle = fs.readFileSync(fileName);
		var data = Buffer.from(fileSingle, 'ascii');
		var translated = encoding.convert(data, 'UTF-8', 'CP1250');
		var converted = iconvlite.encode(translated, 'utf8').toString();
		const spinner = ora({
			text: `${path.basename(fileName)} - processing...`,
			spinner: 'dots2'
		}).start();
		
		fs.writeFile(fileName, converted, function(err) {
			if (err) {
				spinner.fail(`${path.basename(fileName)} - failed`);
				console.log(err);
			} else {
				spinner.succeed(`${path.basename(fileName)} - DONE`);
			}
			resolve(files);
		});
	});

	return promise;
}

const loop = () => {
	return recode().then(() => {
		if (files.length > 0) {
			return loop();
		}
	});
};

glob('*.+(txt|srt)', {
	nocase: true
}, function(er, foundFiles) {
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
	.then(answers => {
		if (answers.range === 1) {
			loop().then(() => console.log('No more files to process or all files done.'));
		} else {
			inquirer
				.prompt({
					type: 'checkbox',
					name: 'files',
					message: 'Select files to convert',
					choices: files
				})
				.then(answers => {
					files = answers.files;
					loop().then(() => console.log('No more files to process or all files done.'));
				})
				.catch(error => {
					if (error.isTtyError) {
						console.log('Prompt couldn\'t be rendered in the current environment');
					} else {
						console.log('Something went wrong, please try again');
					}
				});
		}
	})
	.catch(error => {
		if (error.isTtyError) {
			console.log('Prompt couldn\'t be rendered in the current environment');
		} else {
			console.log('Something went wrong, please try again');
		}
	});
