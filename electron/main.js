const Realm = require('realm');
const { RealmUtils, realmApp, logWithDate } = require('./realmUtils');
const { app, BrowserWindow } = require('electron');
const mainRemote = require('@electron/remote/main');

const username = '';
const password = '';
const userAPIKey = '';
const customJWT = '';

function createWindow() {
  // create an electron browser window
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    },
  });

  /*
    create an ongoing process (by reading from stdin)
    to prevent the Sync Connection from ending prematurely
  */
  process.stdin.resume();

  mainRemote.enable(win.webContents);

  win.loadFile('index.html');
}

app.whenReady().then(async () => {
  let user = realmApp.currentUser;

  try {
    mainRemote.initialize();

    Realm.App.Sync.setLogger(realmApp, (level, message) => logWithDate(`(${level}) ${message}`));
    Realm.App.Sync.setLogLevel(realmApp, 'detail');

    if (!user) {
      let credentials;

      if (username.length > 0) {
        credentials = Realm.Credentials.emailPassword(username, password);
      } else if (userAPIKey.length > 0) {
        credentials = Realm.Credentials.userApiKey(userAPIKey);
      } else if (customJWT.length > 0) {
        credentials = Realm.Credentials.jwt(customJWT);
      } else {
        credentials = Realm.Credentials.anonymous();
      }

      user = await realmApp.logIn(credentials);
    }

    logWithDate(`Logged in with the user: ${user.id}`);

    let realmUtils = await new RealmUtils(user, false);

    if (realmUtils.realm) {
      global.databasePath = realmUtils.realm.path;

      logWithDate(`Opened SYNC realm`);

      let objects = realmUtils.realm.objects('TestData');

      logWithDate(`Got ${objects.length} objects`);

      function listener(objects, changes) {
        logWithDate(
          `Received ${changes.deletions.length} deleted, ${changes.insertions.length} inserted, ${changes.newModifications.length} updates`
        );
      }

      objects.addListener(listener);
    }
  } catch (error) {
    console.error(error);
  }

  createWindow();
});
