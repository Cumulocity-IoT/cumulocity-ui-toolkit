const fs = require("fs");
const path = require("path");
const program = require('commander');

program
  .description(
    'Renames build archives to reflect package name and version.'
  )
  .option(
    '-p, --path <string>',
    'Provides the path to the package (host of the package.json)'
  )
  .parse();

const options = program.opts();

const package = JSON.parse(fs.readFileSync('./' + options.path + '/package.json'));

const fileOld = path.join('./dist', package.name + ".zip");
const fileNew = path.join('./dist', package.name + '_' + package.version + ".zip");

fs.rename(fileOld, fileNew, (err) => {
  if (err) {
    console.error("Error renaming file:", err);
    return;
  }
});
