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
import { logToFile } from './logger';
import constants from './constants';

const app = new Realm.App(constants.appConfig);

let realm;

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
      let backupObjects = backupRealm.objects(constants.schemaName);

      logWithDate(`Found ${backupObjects.length} ${constants.schemaName} objects in ${backupPath}, proceeding to merge…`);

      realm.beginTransaction();
      backupObjects.forEach((element) => {
        realm.create(constants.schemaName, element, 'modified');
      });
      realm.commitTransaction();

      logWithDate(`Merge completed, deleting ${backupPath}…`);

      await fs.unlink(backupPath);
    }
  }

  async function openRealm(user) {
    try {
      const config = {
        schema: constants.schemaClasses,
        shouldCompactOnLaunch: compactOnLaunch,
        sync: {
          user: user,
          partitionValue: constants.partitionValue,
          newRealmFileBehavior: { type: 'downloadBeforeOpen', timeOutBehavior: 'throwException' },
          existingRealmFileBehavior: { type: 'openImmediately', timeOutBehavior: 'openLocalRealm' },
          error: errorSync
        }
      };

      realm = await Realm.open(config);

      logWithDate(`Opened realm ${constants.partitionValue}`);

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
        if (constants.LOG_TO_FILE) {
          Realm.App.Sync.setLogger(app, (level, message) => logToFile(`(${level}) ${message}`));
        }
        if (constants.TRACE_LOG) {
          Realm.App.Sync.setLogLevel(app, 'trace');
        } else {
          Realm.App.Sync.setLogLevel(app, 'detail');
        }

        if (!user) {
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

          logWithDate(`Got ${objects.length} ${constants.schemaName} objects`);

          function listener(objs, changes) {
            logWithDate(`Received ${changes.deletions.length} deleted, ${changes.insertions.length} inserted, ${changes.newModifications.length} updates`);
          }

          objects.addListener(listener);
        }
      } catch (error) {
        console.error(error);
      }
    }

    setLogText('');
    
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
