const Realm = require('realm');
const fs = require('fs');

const TestDataSchema = {
  name: 'TestData',
  properties: {
    _id: 'objectId',
    _partition: 'string',
    doubleValue: 'double?',
    longInt: 'int?',
    mediumInt: 'int?',
  },
  primaryKey: '_id',
};

const appConfig = {
  id: "<Application Id>",
  timeout: 15000,
};
const realmApp = new Realm.App(appConfig);
const partitionValue = "<Partition Value>";

const manualClientReset = true;	// This is the default, set to false to use "discardLocal"

function fileExistsSync(file) {
  try {
    fs.accessSync(file, fs.constants.R_OK | fs.constants.W_OK);
    return true;
  } catch (err) {
    return false;
  }
}

function logWithDate(message) {
  let date = new Date();

  console.log(`[${date.toISOString()}] - ${message}`);
}

class RealmUtils {
  constructor(user, isLocal) {
    return (async () => {
      // All async code here
      this.realm = await this.openRealm(user, isLocal);

      return this; // when done
    })();
  }

  // General error handler: this will handle manual client reset,
  // but is also needed if breaking changes are applied, as "discardLocal" won't be enough
  errorSync(session, error) {
    if (this.realm != undefined) {
      switch (error.name) {
        case 'ClientReset':
          const realmPath = this.realm.path;

          this.realm.close();

          logWithDate(`Error ${error.message}, need to reset ${realmPath}…`);
          Realm.App.Sync.initiateClientReset(realmApp, realmPath);
          logWithDate(`Creating backup from ${error.config.path}…`);

          // Move backup file to a known location for a restore
          fs.renameSync(error.config.path, realmPath + '~');

          // Realm isn't valid anymore, notify user to exit
          this.realm = null;
          break;
        // TODO: Handle other cases…
        default:
          logWithDate(`Received error ${error.message}`);
      }
    }
  }

  compactOnLaunch(totalBytes, usedBytes) {
    let tenMB = 10485760;

    logWithDate(`Storage Realm: ${usedBytes} / ${totalBytes}`);

    if ((totalBytes > tenMB) && ((usedBytes / totalBytes) < 0.75)) {
      logWithDate(`Compacting Realm…`);

      return true;
    }

    return false;
  }

  transferProgress(transferred, transferables) {
    if (transferred < transferables) {
      logWithDate(`Transferred ${transferred} of ${transferables}`);
    } else {
      logWithDate(`Transfer finished`);
    }
  }

  async restoreRealm(newRealm) {
    if (!newRealm) {
      return;
    }

    let backupPath = newRealm.path + '~';

    if (fileExistsSync(backupPath)) {
      let backupRealm = await Realm.open({ path: backupPath, readOnly: true });
      // This is highly dependent on the structure of the data to recover
      let backupObjects = backupRealm.objects('TestData');

      logWithDate(`Found ${backupObjects.length} objects in ${backupPath}, proceeding to merge…`);

      newRealm.beginTransaction();
      backupObjects.forEach((element) => {
        newRealm.create('TestData', element, 'modified');
      });
      newRealm.commitTransaction();

      logWithDate(`Merge completed, deleting ${backupPath}…`);
      fs.unlinkSync(backupPath);
    }
  }

  async openRealm(user, isLocal) {
    let newRealm;

    try {
      const clientResetMode = manualClientReset ?
        { mode: "manual" } :
        {
          mode: "discardLocal",
          // These callbacks do nothing here, but can be used to react to a Client Reset when in .discardLocal mode
          onBefore: (before) => {
            logWithDate(`Before a Client Reset for ${before.path})`);
          },
          onAfter: (before, after) => {
            logWithDate(`After a Client Reset for ${before.path} => ${after.path})`);
          }
        };
      const config = {
        schema: [TestDataSchema],
        shouldCompact: this.compactOnLaunch.bind(),
      };

      if (isLocal) {
        config.sync = true;
        config.path = user;
      } else {
        config.sync = {
          user: user,
          partitionValue: partitionValue,
          clientReset: clientResetMode,
          newRealmFileBehavior: { type: 'downloadBeforeOpen', timeOutBehavior: 'throwException' },
          existingRealmFileBehavior: { type: 'openImmediately', timeOutBehavior: 'openLocalRealm' },
          onError: this.errorSync.bind(),
        };
      }

      if (process.env.CLEAN_REALM) {
        Realm.deleteFile(config);
        logWithDate(`Cleaned realm ${partitionValue}`);
      }

      if (isLocal) {
        newRealm = await new Realm(config);
      } else {
        logWithDate(`Opening realm with "${clientResetMode.mode}" Client Reset`);

        newRealm = await Realm.open(config);

        if (newRealm) {
          // Add a progress function
          if (newRealm.syncSession) {
            newRealm.syncSession.addProgressNotification(
              'download',
              'reportIndefinitely',
              this.transferProgress
            );
          }

          // If a backup file exists, restore to the current realm, and delete file afterwards
          await this.restoreRealm(newRealm);
        } else {
          logWithDate(`Can't open realm ${partitionValue}`);
        }
      }
    } catch (e) {
      console.error(e);
    }

    return newRealm;
  }
}

exports.RealmUtils = RealmUtils;
exports.realmApp = realmApp;
exports.logWithDate = logWithDate;
