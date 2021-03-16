## Realm for Node.js: best practices

This sample code illustrates some of the best practices suggested for the MongoDB Realm Node.js SDK.

These include (but are not limited to):

- Use of `newRealmFileBehavior`  and `existingRealmFileBehavior` recommended policies
- Progress listener
- Handling of a client reset error, with code to recover objects added and/or updated client-side when Sync wasn't available
- Custom logging function

## To run this application
- Create a MongoDB Realm application and enable Realm Sync
- Replace the `"<Application ID>"` with your Realm app id in `index.js`
- Replace the `"<Partition Value>"` with the partition you want to sync with in `index.js`
- npm install
- npm start

