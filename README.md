## Realm SDKs: best practices

This sample code illustrates some of the best practices suggested for some MongoDB Realm SDKs.

These include (but are not limited to):

- Use of different launching modes, depending on whether it's a first startup or there's an existing local DB
- Progress listeners
- Handling of a client reset error, with code to recover objects added and/or updated client-side when Sync wasn't available
- Custom logging function

