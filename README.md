# Maintenance
## check for outdated packages in your project
```
npm outdated
```
## update packages and save new versions to package.json file
```
npm update --save package1 package2
npm update --save-dev package1 package2
```
## to update major version
```
npm install --save package-name@latest
```
## Audit packages for possible vulnerabilities
```
npm audit
```
## Fix dependency vulnerabilities
```
npm audit fix
```

# Git flow hotfix
## switch to a dev branch
```
git checkout -b "development" master
```
## fix the issue, then commit
```
git add --all
git commit -m "Fixed bug #1"
git push --set-upstream origin development
```
## merge master to develop locally to resolve issues
While still on development branch
```
git merge master
```
## resolve any merge conflicts if there are any then switch to master branch
```
git checkout master
```
## merge dev branch to amster
If you want to keep track of who did the merge and when, you can use --no-ff flag while merging 
```
git merge --no-ff development
git push
```

# TODO
- [x] single line progress animation  
	- https://stackoverflow.com/questions/34848505/how-to-make-a-loading-animation-in-console-application-written-in-javascript-or
	- https://github.com/visionmedia/node-progress
	- https://github.com/nathanpeck/clui
	- https://github.com/helloIAmPau/node-spinner
	- https://github.com/sindresorhus/ora
	- https://github.com/SamVerschueren/listr
- [x] if run with no parameters, list files in current dir and allow to choose one
	- https://github.com/SBoudrias/Inquirer.js
- ~~color output~~ https://github.com/chalk/chalk

# Interesting resources
## How to read multiple files in Node.js asynchronously and process all file contents synchronously
http://www.yaoyuyang.com/2017/01/20/nodejs-batch-file-processing.html
https://css-tricks.com/why-using-reduce-to-sequentially-resolve-promises-works/
