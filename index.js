#!/usr/bin/env node
'use strict';

const program = require('commander');
const encoding = require('encoding');
const iconvlite = require('iconv-lite');
const path = require('path');
const ora = require('ora');
const fs = require('fs');
const glob = require('glob');
var files = [];

program
	.version('1.4.0')
	.option('-a, --all', 'Process all txt files in current directory')
	.option('-f, --file <file>', 'Process only given file')
	.parse(process.argv);

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

if (program.all === true) {
	glob('**/*.+(txt|srt)', {
		nocase: true
	}, function(er, foundFiles) {
		files = foundFiles;
		loop().then(() => console.log('No more files to process or all files done.'));
	});
} else if (program.file !== undefined) {
	files.push(path.resolve(process.cwd(), program.file));
	loop().then(() => console.log('No more files to process or all files done.'));
} else {
	console.log('No input file specified!');
	console.log('Use option "-a" to convert all TXT files in current directory.');
	console.log('Use option "-f filename" to convert specified file only.');
}
