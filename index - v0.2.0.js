#!/usr/bin/env node

var encoding = require("encoding");
var iconvlite = require('iconv-lite');
var path = require('path');
//var Iconv = require('iconv').Iconv;
var fs = require('fs');

var userArgs = process.argv.splice(2);

function convertMe(arg) {
	var inputFile = arg;
	console.log('Converting file: ' + inputFile);

	var file = fs.readFileSync(inputFile); 
	var data = new Buffer(file, "ascii");
	var translated = encoding.convert(data, "UTF-8", "CP1250");
	var converted = iconvlite.encode(translated, "utf8").toString();

	//console.log(converted);

	fs.writeFile(inputFile, converted, function(err) {
		if (err) {
			return console.log(err);
		}

		console.log("File " + inputFile + " converted!");
	});
	
}

function getFiles (dir, files_) {
	files_ = files_ || [];
	var files = fs.readdirSync(dir);
	for (var i in files) {
		var name = dir + '/' + files[i];
		var ext = path.extname(name);
		if (fs.statSync(name).isDirectory()) {
			getFiles(name, files_);
		} else {
			if (ext == '.txt') {
				convertMe(name);
			}
//			files_.push(name);
		}
	}
//	return files_;
}


if (userArgs[0] == 'all') {
	getFiles('.');
} else if (userArgs[0] != undefined) {
	console.log('converting?: ' + userArgs[0]);
	convertMe(userArgs[0]);
} else {
	console.log('No input file specified!');
	console.log('Use parameter "all" to convert all .txt files in current folder and all subfolders.');
}

// node c:\Users\{username}\workspace-priv\neconv\index.js filename.txt
// node c:\Users\{username}\workspace-priv\neconv\index.js all

