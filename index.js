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
	.version('1.3.0')
	.option('-a, --all', 'Process all txt files in current directory')
	.option('-f, --file <file>', 'Process only given file')
	.parse(process.argv);

function recode() {
	if (files.length > 0) {
		var fileName = files.shift();
		const spinner = ora(`File ${path.basename(fileName)} processing...`).start();
		var fileSingle = fs.readFileSync(fileName);
		var data = Buffer.from(fileSingle, 'ascii');
		var translated = encoding.convert(data, 'UTF-8', 'CP1250');
		var converted = iconvlite.encode(translated, 'utf8').toString();
		
		fs.writeFile(fileName, converted, function(err) {
			if (err) {
				spinner.fail(`Failed file: ${path.basename(fileName)}`);
				console.log(err);
			} else {
				spinner.succeed(`DONE: ${path.basename(fileName)}`);
			}
			recode(files);
		});
	} else {
		console.log('No more files to process or all files done.');
	}
}

if (program.all === true) {
	glob('**/*.+(txt|srt)', {
		nocase: true
	}, function(er, foundFiles) {
		files = foundFiles;
		recode();
	});
} else if (program.file !== undefined) {
	files.push(path.resolve(process.cwd(), program.file));
	recode();
} else {
	console.log('No input file specified!');
	console.log('Use option "-a" to convert all TXT files in current directory.');
	console.log('Use option "-f filename" to convert specified file only.');
}
