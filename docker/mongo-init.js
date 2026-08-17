const databaseName = process.env.MONGO_INITDB_DATABASE;
const appUsername = process.env.MONGO_APP_USERNAME;
const appPassword = process.env.MONGO_APP_PASSWORD;

if (!databaseName || !appUsername || !appPassword) {
  throw new Error(
    "MONGO_INITDB_DATABASE, MONGO_APP_USERNAME, and MONGO_APP_PASSWORD are required"
  );
}

const appDb = db.getSiblingDB(databaseName);
const existingUser = appDb.getUser(appUsername);

if (!existingUser) {
  appDb.createUser({
    user: appUsername,
    pwd: appPassword,
    roles: [{ role: "readWrite", db: databaseName }]
  });
}
