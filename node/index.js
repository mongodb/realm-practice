/**
 * Sample Realm Node App
 *
 */

const Realm = require("realm");
const fs = require("fs");

const appConfig = {
	id: "<Application ID>",
	timeout: 15000,
};
const partitionValue = "<Partition Value>"
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

	console.log(`[${date.toISOString()}] - ${message}`)
}

function errorSync(session, error) {
	if (realm != undefined) {
		if (error.name === 'ClientReset') {
			const realmPath = realm.path;

			realm.close();

			logWithDate(`Error ${error.message}, need to reset ${realmPath}…`);
			Realm.App.Sync.initiateClientReset(app, realmPath);
			logWithDate(`Creating backup from ${error.config.path}…`);

			// Move backup file to a known location for a restore
			fs.renameSync(error.config.path, realmPath + '~');

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
		logWithDate(`Transfer finished`);
	}
}

async function restoreRealm() {
	if (!realm) { return; }

	let backupPath = realm.path + '~';

	if (fileExistsSync(backupPath)) {
		let backupRealm = await Realm.open({ path: backupPath, readOnly: true });
		// This is highly dependent on the structure of the data to recover
		let backupObjects = backupRealm.objects("TestData");

		logWithDate(`Found ${backupObjects.length} objects in ${backupPath}, proceeding to merge…`);

		realm.beginTransaction();
		backupObjects.forEach(element => {
			realm.create("TestData", element, 'modified');
		});
		realm.commitTransaction();

		logWithDate(`Merge completed, deleting ${backupPath}…`);
		fs.unlinkSync(backupPath);
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

		if (process.env.CLEAN_REALM) {
			Realm.deleteFile(config);
			logWithDate(`Cleaned realm ${partitionValue}`);
		}

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

async function run() {
	let user = app.currentUser;

	try {
		Realm.App.Sync.setLogger(app, (level, message) => logWithDate(`(${level}) ${message}`));
		Realm.App.Sync.setLogLevel(app, "detail");

		if (!user) {
			user = await app.logIn(Realm.Credentials.anonymous());
		}

		logWithDate(`Logged in with the user: ${user.id}`);

		await openRealm(user);

		if (realm) {
			let objects = realm.objects("TestData");

			logWithDate(`Got ${objects.length} objects`)

			function listener(objects, changes) {
				logWithDate(`Received ${changes.deletions.length} deleted, ${changes.insertions.length} inserted, ${changes.newModifications.length} updates`);
			}

			objects.addListener(listener);
		}
	} catch (error) {
		console.error(error);
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

run().catch(console.dir);
