/**
 * Copyright 2016, Google, Inc.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

// [START app]
const express = require('express');
const nconf = require('nconf');
const ParseServer = require('parse-server').ParseServer;
const path = require('path');
const yml = require('js-yaml');
const ymlFormatter = { parse: yml.safeLoad, stringify: yml.safeDump };

var connectionName, databaseName;

if (process.env.NODE_ENV === 'production') {
  require('@google-cloud/debug-agent').start();
}

nconf.argv().env()
  .file('dev-override', {file: 'config-dev.yml', format: ymlFormatter})
  .file({ file: 'config.yml', format: ymlFormatter });

const app = express();

const projectId = process.env.GOOGLE_CLOUD_PROJECT || nconf.get('PROJECT_ID');

let masterKey = nconf.get('MASTER_KEY');
let crypto;

if (!masterKey) {
  if (!crypto) crypto = require('crypto');
  if (process.env.GAE_VERSION && process.env.MK_SALT) {
    // this will generate a master key specific to a version, but shared by multiple instances of a version.
    // assuming process.env.MK_SALT is version specific (which should be as it is generated at build-time).

    // scryptSync() is unavailable on node 8.
    // masterKey = crypto.scryptSync(process.env.GAE_VERSION, process.env.MK_SALT, 64, {N: 1024}).toString('base64');
    masterKey = crypto.createHmac('sha256', process.env.MK_SALT).update(process.env.GAE_VERSION).digest('base64');
  } else {
    masterKey = crypto.randomBytes(48).toString('base64');
  }
}

// Reference: https://parseplatform.org/parse-server/api/master/ParseServerOptions.html
const serverConfig = {
  cloud: nconf.get('CLOUD_PATH') || path.join(__dirname, '/cloud/main.js'),
  // This appId is used to uniquely identify one out of many possible "applications" hosted by one Parse server.
  // we are only deploying one app.
  appId: nconf.get('APP_ID') || 'AHOPE-App-in-Parse',
  // An empty or undefined master key indicates that Parse server and Parse Dashboard are collocated and can use a randomly generated password
  masterKey: masterKey,
  fileKey: nconf.get('FILE_KEY'),
  mountPath: nconf.get('PARSE_MOUNT_PATH') || '/parse',
  auth: { google: true },
  enableAnonymousUsers: false,
  allowClientClassCreation: nconf.get('ALLOW_CLIENT_CLASS_CREATION') || false
}

serverConfig.serverURL = nconf.get('SERVER_URL') || 'https://'.concat(projectId, '.appspot.com', serverConfig.mountPath);

// Generate a version-specific URL to be used by the Dashboard, so that it targets the version where it is from.
// See https://cloud.google.com/appengine/docs/standard/java/how-requests-are-routed#targeted_routing
const serviceId = process.env.GAE_SERVICE || 'default';   // the id of the AppEngine service this piece of code is running in.
const versionSpecificServerUrl = nconf.get('SERVER_URL') || (process.env.GAE_VERSION ? 'https://'.concat(process.env.GAE_VERSION, '-dot-', serviceId, '-dot-', projectId, '.appspot.com', serverConfig.mountPath) : serverConfig.serverURL);

console.info(`Parse Server URL to be used by Dashboard is: ${versionSpecificServerUrl}`);

serverConfig.databaseURI = nconf.get('DATABASE_URI');

function getConnectionName()
{
  return nconf.get('CLOUDSQL_CONNECTION_NAME') || 
    [projectId, nconf.get('CLOUDSQL_REGION'), nconf.get('CLOUDSQL_INSTANCE_ID')].join(':') ;
}

if (!serverConfig.databaseURI) {
  if (!connectionName) connectionName = getConnectionName();
  const databaseCredentials = nconf.get('DATABASE_CREDENTIALS');
  databaseName = nconf.get('DATABASE_NAME');
  serverConfig.databaseURI = 'postgres://'.concat(databaseCredentials, '@/cloudsql/', connectionName, '/', databaseName);
}


serverConfig.databaseOptions = nconf.get('DATABASE_OPTIONS');

// If DATABASE_OPTIONS is not defined at all, then populate it.
// If DATABASE_OPTIONS is specifically defined to be empty, then leave it as is - this is useful in local dev mode,
// where we don't need any database options beyond what is provided in serverConfig.databaseURI.
if (!serverConfig.databaseOptions) {
  // In Google Cloud, in order for an App to "locally" access a CloudSQL database, UNIX domain socket has to be used to connect.
  // Hence the need to provide a databaseOptions.  It appears that if we provide value for .protocol, then we need to provide
  // .host and .database as well, as their values may not be picked up from serverConfig.databaseURI.
  //
  serverConfig.databaseOptions = 
  {
    protocol: 'socket:',
    host: '/cloudsql/'.concat(connectionName || getConnectionName()),
    database: databaseName || nconf.get('DATABASE_NAME'),
    // idleTimeoutMillis: 60000,
    application_name: 'ParseServer',  // this shows up in column "application_name" in pg_catalog.pg_stat_activity view.
  };
}

// Setting poolSize.
// See https://github.com/vitaly-t/pg-promise/wiki/Connection-Syntax, which also has a link to 
// the default values: https://github.com/brianc/node-postgres/blob/master/lib/defaults.js
// The default values listed there seem questionable (perhaps overridden somewhere) as the idle timeout
// is definitely not 30 seconds by default in my testing.
if (!serverConfig.databaseOptions.max) {
  const size = nconf.get('DATABASE_CONNECTION_POOL_SIZE');
  if (size) serverConfig.databaseOptions.max = size;
}

// oauthClientId is to be passed onto the client side to allow user authentication using Google sign-in.
const oauthClientId = nconf.get('OAUTH_CLIENT_ID');

console.log("OAuth Client ID is: " + oauthClientId);
console.log("database URI is: " + serverConfig.databaseURI);
console.log("databaseOptions is: " + JSON.stringify(serverConfig.databaseOptions));

const parseServer = new ParseServer(serverConfig);

app.get('/dummy.js', function (req, res) {
  res.type('text/javascript').send("console.log('hello from the dummy service worker');");
})

const PORT = process.env.PORT || 8080;
const PARSE_MOUNT_PATH = serverConfig.mountPath || '/parse';

// Note: this endpoint triggers AHOPE application-specific initialization.
// The reason why "/parse/ahopeinit" is selected is that in the front-end code, we already
// allow requests to /parse/* and /dashboard/* to not to be intercepted by the service-worker.
// If we choose to use "/ahopeinit", then we need to change the front-end code.
app.post(PARSE_MOUNT_PATH + '/ahopeinit', function (req, res) {
  console.log("Request to initialize has been received.");

  // If we are running in production (i.e., process.env.MK_SALT is set), we want to
  // prevent any unauthorized actor to request a schema init.
  // We require an authorization header be present, with Basic as the authentication scheme,
  // and the password part being the SHA2 hash to MK_SALT (the GCP cloud builder generates
  // it and therefore is in possession of it).
  //
  if (process.env.MK_SALT) {    
    let authenticated = false ;

    if (req.headers.authorization && req.headers.authorization.toLowerCase().startsWith('basic ')) {
      const authString = new Buffer(req.headers.authorization.split(" ")[1], 'base64').toString();
      console.log("Authorization header detected: " + authString);
      const secretSplit = authString.split(":")
      if (secretSplit.length > 1)
      {
        const secret = secretSplit[1];
        if (!crypto) crypto = require('crypto');
        const hash = crypto.createHash('sha256');
        const expectedSecret = hash.update(process.env.MK_SALT).digest('hex');
        authenticated = (expectedSecret === secret) ;
      }  
    }

    if (false == authenticated) {
      console.info("Request to initialize schema is rejected as unauthorized.");
      res.status(401).type('text/plain').send("Unauthorized.");
      return;
    }
  }

  // res.type('text/plain').send("Schema initialization will start.");
  const setParseSchema = require('./parseSchema');
  const parseLocalUrl = "http://localhost:" + PORT + PARSE_MOUNT_PATH;
  setParseSchema(serverConfig, parseLocalUrl)
  .then(() => {
    res.type('text/plain').send("Schema initialization completed.");
  })
  .catch(() => {
    res.status(500).type('text/plain').send("Schema initialization failed.");
  });
});

// Mount the Parse API server middleware to /parse
app.use(PARSE_MOUNT_PATH, parseServer);

const dashboardSettings = nconf.get('DASHBOARD_SETTINGS');

if (dashboardSettings) {
  if (!dashboardSettings.apps) dashboardSettings.apps = [{}];

  const appSettings = dashboardSettings.apps[0];

  if (!appSettings.serverURL) appSettings.serverURL = versionSpecificServerUrl; // serverConfig.serverURL;
  if (!appSettings.appId) appSettings.appId = serverConfig.appId;
  if (!appSettings.masterKey) appSettings.masterKey = serverConfig.masterKey;
  if (!appSettings.appName) appSettings.appName = "AHOPE Administrators Dashboard";

  console.log("Server URL used by dashboard is: " +  appSettings.serverURL);

  dashboardSettings.users.forEach(user => { if (!user.apps) user.apps = [{appId: serverConfig.appId}] } ) ;

  const ParseDashboard = require('parse-dashboard');
  const dashboard = new ParseDashboard(dashboardSettings,  { allowInsecureHTTP: true });
  app.use('/dashboard', dashboard); 
}

/*
app.get('/', (req, res) => {
  if (dashboardSettings) {
    res.redirect('/dashboard');
  } else {
    res.status(200).send('Hello, world!');
  }  
});

app.use('/static', express.static('static'))

 */

/*
app.use('/front-end', express.static('front-end'));

app.get('/', (req, res) => {
  res.redirect('/front-end');
});
*/

// Mount the front-end to the root; otherwise, image files couldn't be found.
// Given that the dashboard and the parse server are mounted in distinct paths,
// they should not be "masked" by the front end resources.
app.use(express.static('front-end'));

app.listen(PORT, () => {
  console.log(`App listening on port ${PORT}`);
  console.log('Press Ctrl+C to quit.');
});


// [END app]
