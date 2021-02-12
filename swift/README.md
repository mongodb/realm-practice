## Realm for iOS: best practices

This sample code illustrates some of the best practices suggested for the MongoDB Realm Swift SDK.

These include (but are not limited to):

- Use of `asyncOpen(…)` for the first launch of the app, and `open(…)` for the following launches
- Handling of a client reset error, with code to recover objects added and/or updated client-side when Sync wasn't available

