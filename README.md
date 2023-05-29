## Realm SDKs: best practices

This sample code illustrates some of the best practices suggested for some MongoDB Realm SDKs.

These include (but are not limited to):

- Use of different launching modes, depending on whether it's a first startup or there's an existing local DB
- Progress listeners
- Handling of a client reset error, with code to recover objects added and/or updated client-side when Sync wasn't available
- Custom logging function

#### Disclaimer

The source code provided here is published in good faith and for general information purpose only. The author(s) and MongoDB Technical Support don't make any warranties about the completeness, reliability and accuracy of this information. Any action you take upon the provided code, and its use in conjunction with other code and libraries, is strictly at your own risk. The author(s) and MongoDB Technical Support will not be liable for any losses and/or damages in connection with the use of this code.
