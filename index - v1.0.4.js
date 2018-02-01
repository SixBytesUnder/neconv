#!/usr/bin/env node
'use strict';

var program = require('commander');
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
//				files_.push(name);
			}
//			files_.push(name);
		}
	}
//	console.log(files_);
//	return files_;
}


if (userArgs[0] === 'all') {
	getFiles('.');
} else if (userArgs[0] === 'asd') {
/**
 * Ask user if he wants to convert files in given subfolder
 * this should go after line 38 "if (fs.statSync(name).isDirectory())" but it's not stopping the script for some reason and running the whole "for"
 */
	var readline = require('readline');
	var rl = readline.createInterface(process.stdin, process.stdout);
	rl.setPrompt('Do you want to process files in folder xxx? [y/n]> ');
	rl.prompt();
	rl.on('line', function(line) {
		if (line === "y") {
			console.log();
			rl.close();
		}
		rl.prompt();
	}).on('close',function() {
		process.exit(0);
	});
} else if (userArgs[0] != undefined) {
	console.log('converting file: ' + userArgs[0]);
	convertMe(userArgs[0]);
} else {
	console.log('No input file specified!');
	console.log('Use parameter "all" to convert all .txt files in current folder and all subfolders.');
}

// version 1.0.4
// node c:\Users\{username}\workspace-priv\neconv\index.js filename.txt
// node c:\Users\{username}\workspace-priv\neconv\index.js all

