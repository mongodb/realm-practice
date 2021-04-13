const fs = require("fs");

let logFile;
let stream;

function fileExistsSync(file) {
  try {
    fs.accessSync(file, fs.constants.R_OK | fs.constants.W_OK);
    return true;
  } catch (err) {
    return false;
  }
}

function createLogName() {
  let applicationName = process.env.npm_package_name ?? "NodeApp";
  let progressive = 0;
  let date = new Date().toISOString().substring(0, 10);

  do {
    progressive += 1;
    logFile = `./${applicationName}.${date}_${progressive}.log`
  } while (fileExistsSync(logFile));
}

function logToFile(message) {
  if (!stream) {
    createLogName();

    stream = fs.createWriteStream(logFile, { flags: 'a' });
  }

  let date = new Date();

  stream.write(`[${date.toISOString()}] - ${message}\n`);
}

function logWithDate(message) {
  let date = new Date();

  console.log(`[${date.toISOString()}] - ${message}`)
}

exports.fileExistsSync = fileExistsSync;
exports.logToFile = logToFile;
exports.logWithDate = logWithDate;