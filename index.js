#!/usr/bin/env node
'use strict';

const program = require('commander');
const encoding = require("encoding");
const iconvlite = require('iconv-lite');
const path = require('path');
const ora = require('ora');
const fs = require('fs');
var files = [];


program
	.version('1.2.0')
	.option('-a, --all', 'Process all txt files in current directory')
	.option('-f, --file <file>', 'Process only given file')
	.parse(process.argv);

function getFile() {
    var filePath = __dirname + "/image1" + index + ".png";
    return fs.readFileAsync(filePath);
}

function getFiles(dir) {
	var filesRaw = fs.readdirSync(dir);
	for (var i in filesRaw) {
		var name = dir === '.' ? filesRaw[i] : dir + '/' + filesRaw[i];
		var ext = path.extname(name);
		if (!fs.statSync(name).isDirectory()) {
			if (ext == '.txt') {
                files.push(path.resolve(process.cwd(), name));
			}
		}
	}
    recode(files);
}

let recode = function() {
    if (files.length > 0) {
        var fileName = files.shift();
        const spinner = ora('File ' + path.basename(fileName) + ' processing...').start();
        var fileSingle = fs.readFileSync(fileName);
        var data = new Buffer(fileSingle, "ascii");
        var translated = encoding.convert(data, "UTF-8", "CP1250");
        var converted = iconvlite.encode(translated, "utf8").toString();
        
        fs.writeFile(fileName, converted, function(err) {
            if (err) {
                spinner.fail('File ' + path.basename(fileName) + ' failed.');
                console.log(err);
            } else {
                spinner.succeed('File ' + path.basename(fileName) + ' DONE!');
            }
            recode(files);
        });
    } else {
        console.log('No more files to process or all files done.');
    }
}

if (program.all === true) {
	getFiles('.');
} else if (program.file != undefined) {
    files.push(path.resolve(process.cwd(), program.file));
	recode();
} else {
	console.log('No input file specified!');
	console.log('Use option "-a" to convert all TXT files in current directory.');
	console.log('Use option "-f filename" to convert specified file only.');
}

