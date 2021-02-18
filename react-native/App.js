/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 * @flow strict-local
 */

import React, { useState, useEffect } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  ScrollView,
  View,
  Text,
  StatusBar,
} from 'react-native';

import Realm from 'realm';
import fs from 'react-native-fs';

const appConfig = {
  id: '<Application ID>',
  timeout: 15000,
};
const partitionValue = '<Partition Value>';
const username = '';
const password = '';
const userAPIKey = '';
const app = new Realm.App(appConfig);

let realm;

// This is just an example of object: gather them from the Data Model tab on the Realm UI Portal
const TestDataSchema = {
  name: 'TestData',
  properties: {
    _id: 'objectId',
    _partition: 'string',
    doubleValue: 'double?',
    longInt: 'int?',
    mediumInt: 'int?'
  },
  primaryKey: '_id'
};

const styles = StyleSheet.create({
  scrollView: {
    backgroundColor: 'white',
  },
  body: {
    backgroundColor: 'white',
  },
  sectionContainer: {
    marginTop: 32,
    paddingHorizontal: 24,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: 'black',
  },
  sectionDescription: {
    marginTop: 8,
    fontFamily: 'Courier',
    fontSize: 12,
    fontWeight: '400',
    color: '#444',
  },
  highlight: {
    fontWeight: '700',
  },
});

const RNApp = () => {
  const [logText, setLogText] = useState('');

  function logWithDate(message) {
    let date = new Date();

    setLogText((logText) => logText + `[${date.toISOString()}] - ${message}\n`);
    // console.log(`[${date.toISOString()}] - ${message}\n`);
  }

  function errorSync(session, error) {
    if (realm !== undefined) {
      if (error.name === 'ClientReset') {
        const realmPath = realm.path;

        realm.close();

        logWithDate(`Error ${error.message}, need to reset ${realmPath}…`);
        Realm.App.Sync.initiateClientReset(app, realmPath);
        logWithDate(`Creating backup from ${error.config.path}…`);

        // Move backup file to a known location for a restore
        // (it's async, but we don't care much to wait at this point)
        fs.moveFile(error.config.path, realmPath + '~');

        // Realm isn't valid anymore, notify user to exit
        realm = null;
      } else {
        logWithDate(`Received error ${error.message}`);
      }
    }
  }

  function transferProgress(transferred, transferables) {
    if (transferred < transferables) {
      logWithDate(`Transferred ${transferred} of ${transferables}`);
    } else {
      logWithDate('Transfer finished');
    }
  }

  async function restoreRealm() {
    if (!realm) { return; }

    let backupPath = realm.path + '~';

    let backupExists = await fs.exists(backupPath);

    if (backupExists) {
      let backupRealm = await Realm.open({ path: backupPath, readOnly: true });

      // This is highly dependent on the structure of the data to recover
      let backupObjects = backupRealm.objects('TestData');

      logWithDate(`Found ${backupObjects.length} objects in ${backupPath}, proceeding to merge…`);

      realm.beginTransaction();
      backupObjects.forEach((element) => {
        realm.create('TestData', element, 'modified');
      });
      realm.commitTransaction();

      logWithDate(`Merge completed, deleting ${backupPath}…`);

      await fs.unlink(backupPath);
    }
  }

  async function openRealm(user) {
    try {
      const config = {
        schema: [TestDataSchema],
        sync: {
          user: user,
          partitionValue: partitionValue,
          newRealmFileBehavior: { type: 'downloadBeforeOpen', timeOutBehavior: 'throwException' },
          existingRealmFileBehavior: { type: 'openImmediately', timeOutBehavior: 'openLocalRealm' },
          error: errorSync
        }
      };

      realm = await Realm.open(config);

      logWithDate(`Opened realm ${partitionValue}`);

      // Add a progress function
      realm.syncSession.addProgressNotification('download', 'reportIndefinitely', transferProgress);

      // If a backup file exists, restore to the current realm, and delete file afterwards
      await restoreRealm();
    } catch (e) {
      console.error(e);
    }
  }

  useEffect(() => {
    async function setupRealm() {
      let user = app.currentUser;

      try {
        Realm.App.Sync.setLogger(app, (level, message) => logWithDate(`(${level}) ${message}`));
        Realm.App.Sync.setLogLevel(app, 'detail');

        if (!user) {
          let credentials;

          if (username.length > 0) {
            credentials = Realm.Credentials.emailPassword(username, password);
          } else if (userAPIKey.length > 0) {
            credentials = Realm.Credentials.userApiKey(userAPIKey);
          } else {
            credentials = Realm.Credentials.anonymous();
          }

          user = await app.logIn(Realm.Credentials.anonymous());
        }

        logWithDate(`Logged in with the user: ${user.id}`);

        await openRealm(user);

        if (realm) {
          let objects = realm.objects('TestData');

          logWithDate(`Got ${objects.length} objects`);

          function listener(objs, changes) {
            logWithDate(`Received ${changes.deletions.length} deleted, ${changes.insertions.length} inserted, ${changes.newModifications.length} updates`);
          }

          objects.addListener(listener);
        }
      } catch (error) {
        console.error(error);
      }
    }

    logWithDate('App Loaded');

    setupRealm();
  }, []);

  return (
    <>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView>
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          style={styles.scrollView}>
          <View style={styles.body}>
            <Text style={styles.sectionDescription}>{logText}</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </>
  );
};

export default RNApp;
