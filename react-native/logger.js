import fs from 'react-native-fs';

let logFile;
let logCache = '';

async function createLogName() {
  let applicationName = fs.MainBundlePath.split('\\').pop().split('/').pop() ?? "RNApp";
  let progressive = 0;
  let date = new Date().toISOString().substring(0, 10);

  do {
    progressive += 1;
    logFile = `${fs.DocumentDirectoryPath}/${applicationName}.${date}_${progressive}.log`
  } while (await fs.exists(logFile));

  await fs.writeFile(logFile, logCache);

  // To avoid "Excessive number of pending callbacks" error, we cache lines and output a bunch of them at once
  setInterval(() => {
    if (logCache.length === 0) {
      return;
    }

    let oldCache  = logCache;
    
    logCache  = '';

    fs.appendFile(logFile,oldCache)
      .catch((err) => {
        console.error(err.message, err.code);
      })
  }, 1000);
}

function logToFile(message) {
  try {
    if (!logFile) {
      createLogName();
    }

    let date = new Date();

    logCache += `[${date.toISOString()}] - ${message}\n`;
  } catch (error) {
    console.error(error);
  }
}

exports.logToFile = logToFile;
