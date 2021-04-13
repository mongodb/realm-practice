
exports.appConfig = {
    id: "<Realm Application ID>",
    timeout: 15000,
};

exports.partitionValue = "<Partition Value>"
exports.username = "";
exports.password = "";
exports.userAPIKey = "";
exports.customJWT = "";

// This is just an example of object: gather them from the Data Model tab on the Realm UI Portal
exports.schemaName = "TestData";
exports.TestDataSchema = {
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
exports.schemaClasses = [this.TestDataSchema];
