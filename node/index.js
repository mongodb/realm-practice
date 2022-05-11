/**
 * Sample Realm Node App
 *
 */

const Realm = require("realm");
const fs = require("fs");
const constants = require('./constants');
const { fileExistsSync, logToFile, logWithDate } = require('./logger');

const app = new Realm.App(constants.appConfig);

let realm;

function errorSync(session, error) {
  if (realm != undefined) {
    switch (error.name) {
      case 'ClientReset':
        const realmPath = realm.path;

        realm.close();

        logWithDate(`Error ${error.message}, need to reset ${realmPath}…`);
        Realm.App.Sync.initiateClientReset(app, realmPath);
        logWithDate(`Creating backup from ${error.config.path}…`);

        // Move backup file to a known location for a restore
        fs.renameSync(error.config.path, realmPath + '~');

        // Realm isn't valid anymore, notify user to exit
        realm = null;
        break;
      // TODO: Handle other cases…
      default:
        logWithDate(`Received error ${error.message}`);
    }
  }
}

function compactOnLaunch(totalBytes, usedBytes) {
  let tenMB = 10485760;

  logWithDate(`Storage Realm: ${usedBytes} / ${totalBytes}`);

  if ((totalBytes > tenMB) && ((usedBytes / totalBytes) < 0.75)) {
    logWithDate(`Compacting Realm…`);

    return true;
  }

  return false;
}

function transferProgress(transferred, transferables) {
  if (transferred < transferables) {
    logWithDate(`Transferred ${transferred} of ${transferables}`);
  } else {
    logWithDate(`Transfer finished`);
  }
}

async function restoreRealm() {
  if (!realm) { return; }

  let backupPath = realm.path + '~';

  if (fileExistsSync(backupPath)) {
    let backupRealm = await Realm.open({ path: backupPath, readOnly: true });
    // This is highly dependent on the structure of the data to recover
    let backupObjects = backupRealm.objects(constants.schemaName);

    logWithDate(`Found ${backupObjects.length} ${constants.schemaName} objects in ${backupPath}, proceeding to merge…`);

    realm.beginTransaction();
    backupObjects.forEach(element => {
      realm.create(constants.schemaName, element, 'modified');
    });
    realm.commitTransaction();

    logWithDate(`Merge completed, deleting ${backupPath}…`);
    fs.unlinkSync(backupPath);
  }
}

async function openRealm(user) {
  try {
    const clientResetMode = constants.manualClientReset ?
      { mode: "manual" } :
      {
        mode: "discardLocal",
        // These callbacks do nothing here, but can be used to react to a Client Reset when in .discardLocal mode
        clientResetBefore: (before) => {
          logWithDate(`Before a Client Reset for ${before.path})`);
        },
        clientResetAfter: (before, after) => {
          logWithDate(`After a Client Reset for ${before.path} => ${after.path})`);
        }
      };
    const config = {
      schema: constants.schemaClasses,
      shouldCompactOnLaunch: compactOnLaunch,
      sync: {
        user: user,
        partitionValue: constants.partitionValue,
        clientReset: clientResetMode,
        newRealmFileBehavior: { type: 'downloadBeforeOpen', timeOutBehavior: 'throwException' },
        existingRealmFileBehavior: { type: 'openImmediately', timeOutBehavior: 'openLocalRealm' },
        error: errorSync
      }
    };

    if (process.env.CLEAN_REALM) {
      Realm.deleteFile(config);
      logWithDate(`Cleaned realm ${constants.partitionValue}`);
    }

    logWithDate(`Opening realm with "${clientResetMode.mode}" Client Reset`);

    realm = await Realm.open(config);

    logWithDate(`Opened realm ${constants.partitionValue}`);

    // Add a progress function
    realm.syncSession.addProgressNotification('download', 'reportIndefinitely', transferProgress);

    // If a backup file exists, restore to the current realm, and delete file afterwards
    await restoreRealm();
  } catch (e) {
    console.error(`Open Error: ${JSON.stringify(e)}`);
  }
}

async function run() {
  let user = app.currentUser;

  try {
    Realm.App.Sync.setLogger(app, (level, message) => logToFile(`(${level}) ${message}`));
    Realm.App.Sync.setLogLevel(app, "detail");

    if (!user || !user.isLoggedIn) {
      let credentials;

      if (constants.username.length > 0) {
        credentials = Realm.Credentials.emailPassword(constants.username, constants.password);
      } else if (constants.userAPIKey.length > 0) {
        credentials = Realm.Credentials.userApiKey(constants.userAPIKey);
      } else if (constants.customJWT.length > 0) {
        credentials = Realm.Credentials.jwt(constants.customJWT);
      } else {
        credentials = Realm.Credentials.anonymous();
      }

      user = await app.logIn(credentials);
    }

    logWithDate(`Logged in with the user: ${user.id}`);

    await openRealm(user);

    if (realm) {
      let objects = realm.objects(constants.schemaName);

      logWithDate(`Got ${objects.length} ${constants.schemaName} objects`)

      function listener(objects, changes) {
        logWithDate(`Received ${changes.deletions.length} deleted, ${changes.insertions.length} inserted, ${changes.newModifications.length} updates`);
      }

      objects.addListener(listener);
    }
  } catch (error) {
    console.error(`Login Error: ${JSON.stringify(error)}`);
  } finally {
    setTimeout(() => {
      if (realm) {
        realm.syncSession.removeProgressNotification(transferProgress);
        realm.close();
      }

      logWithDate("Done");

      process.exit(0);
    }, 5000);
  }
}

run().catch((reason) => {
  console.error(`Promise exception: ${JSON.stringify(reason)}`);
  app.currentUser.logOut();
});
