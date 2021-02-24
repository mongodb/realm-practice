## Realm for React Native: best practices

This sample code illustrates some of the best practices suggested for the MongoDB RealmJS for React Native SDK.

These include (but are not limited to):

- Use of `newRealmFileBehavior`  and `existingRealmFileBehavior` recommended policies
- Progress listener
- Handling of a client reset error, with code to recover objects added and/or updated client-side when Sync wasn't available
- Custom logging function
