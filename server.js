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

var projectId, connectionName, databaseName;

if (process.env.NODE_ENV === 'production') {
  require('@google-cloud/debug-agent').start();
}

nconf.argv().env()
  .file('dev-override', {file: 'config-dev.yml', format: ymlFormatter})
  .file({ file: 'config.yml', format: ymlFormatter });

const app = express();

// Reference: https://parseplatform.org/parse-server/api/master/ParseServerOptions.html
const serverConfig = {
  cloud: nconf.get('CLOUD_PATH') || path.join(__dirname, '/cloud/main.js'),
  // This appId is used to uniquely identify one out of many possible "applications" hosted by one Parse server.
  // we are only deploying one app.
  appId: nconf.get('APP_ID') || 'AHOPE-App-in-Parse',
  // An empty or undefined master key indicates that Parse server and Parse Dashboard are collocated and can use a randomly generated password
  masterKey: nconf.get('MASTER_KEY') || require('crypto').randomBytes(48).toString('base64'),
  fileKey: nconf.get('FILE_KEY'),
  mountPath: nconf.get('PARSE_MOUNT_PATH') || '/parse',
  auth: { google: true },
  enableAnonymousUsers: false,
  allowClientClassCreation: nconf.get('ALLOW_CLIENT_CLASS_CREATION') || false
}


serverConfig.serverURL = nconf.get('SERVER_URL') || 'https://'.concat(projectId = nconf.get('PROJECT_ID'), '.appspot.com', serverConfig.mountPath),


serverConfig.databaseURI = nconf.get('DATABASE_URI');

function getConnectionName()
{
  return nconf.get('CLOUDSQL_CONNECTION_NAME') || 
    [(projectId || nconf.get('PROJECT_ID')), nconf.get('CLOUDSQL_REGION'), nconf.get('CLOUDSQL_INSTANCE_ID')].join(':')
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

// Mount the Parse API server middleware to /parse
app.use(serverConfig.mountPath || '/parse', parseServer);

const dashboardSettings = nconf.get('DASHBOARD_SETTINGS');

if (dashboardSettings) {
  if (!dashboardSettings.apps) dashboardSettings.apps = [{}];

  const appSettings = dashboardSettings.apps[0];

  if (!appSettings.serverURL) appSettings.serverURL = serverConfig.serverURL;
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

app.use('/front-end', express.static('front-end'))

app.get('/', (req, res) => {
  res.redirect('/front-end');
});


const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`App listening on port ${PORT}`);
  console.log('Press Ctrl+C to quit.');
});
// [END app]
