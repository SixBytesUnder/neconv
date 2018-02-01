#!/usr/bin/env node
'use strict';

var program = require('commander');
var encoding = require("encoding");
var iconvlite = require('iconv-lite');
var path = require('path');
//var Iconv = require('iconv').Iconv;
var fs = require('fs');
var files = [];


program
	.version('1.1.0')
	.option('-a, --all', 'Process all txt files in current directory')
	.option('-f, --file <file>', 'Process only given file')
	.parse(process.argv);

function getFiles (dir, files_) {
	files_ = files_ || [];
	var files = fs.readdirSync(dir);
	for (var i in files) {
		var name = dir === '.' ? files[i] : dir + '/' + files[i];
		var ext = path.extname(name);
		if (fs.statSync(name).isDirectory()) {
			// commented out to get only files in current folder and not process all subfolders
			// getFiles(name, files_);
		} else {
			if (ext == '.txt') {
				convertMe(name);
			}
		}
	}
}

function convertMe(arg) {
	var inputFile = arg;
	console.log('Converting file: ' + inputFile);
	var file = fs.readFileSync(inputFile); 
	var data = new Buffer(file, "ascii");
	var translated = encoding.convert(data, "UTF-8", "CP1250");
	var converted = iconvlite.encode(translated, "utf8").toString();
	
	fs.writeFile(inputFile, converted, function(err) {
		if (err) {
			return console.log(err);
		}

		console.log("File " + inputFile + " converted!");
	});
	
}

if (program.all === true) {
	getFiles('.');
} else if (program.file != undefined) {
	convertMe(program.file);
} else {
	console.log('No input file specified!');
	console.log('Use option "-a" to convert all TXT files in current directory.');
	console.log('Use option "-f filename" to convert specified file only.');
}

