## Realm for React Native: best practices

This sample code illustrates some of the best practices suggested for the MongoDB RealmJS for React Native SDK.

These include (but are not limited to):

- Use of `newRealmFileBehavior`  and `existingRealmFileBehavior` recommended policies
- Progress listener
- Handling of a client reset error, with code to recover objects added and/or updated client-side when Sync wasn't available
- Custom logging function

## To run this application
- Create a MongoDB Realm application and enable Realm Sync
- Get the Javascript models for the Data Models tab, and substitute the `TestDataSchema` in `constants.js` (or create an external module)
- Replace the `"<Application ID>"` with your Realm app id in `contants.js`
- Replace the `"<Partition Value>"` with the partition you want to sync with in `constants.js`
- npm install
- npm run start
- npm run ios (or npm android)

## NOTE

As of Realm JS SDK 10.3.0, Node.js version 15 isn't supported, please use at most version 14 (see [the Github issue](https://github.com/realm/realm-js/issues/3670)). The issue has been solved in version 10.4.0 of the SDK.
