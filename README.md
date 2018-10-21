# AHOPE Project on Google App Engine:  Postgresql, Parse-Server, and Parse-dashboard in backend with Google Sign-in for Authentication

This project sets up [Parse-server](https://github.com/ParsePlatform/parse-server) and [Parse-dashboard](https://github.com/parse-community/parse-dashboard) to run 
[Google App Engine](https://cloud.google.com/appengine) Node.js [standard environment](https://cloud.google.com/appengine/docs/standard/nodejs).  This project is based on the original [Parse sample project](https://github.com/GoogleCloudPlatform/nodejs-docs-samples/tree/master/appengine/parse-server)

## Downloading Files

1. `git clone https://github.com/evandana/keep-ahope-gcp`
1. `cd keep-ahope-gcp`

## Setup -  Cloud (App Engine) Only

1. Create a project in the [Google Cloud Platform Console](https://console.cloud.google.com/).
1. [Enable billing](https://console.cloud.google.com/project/_/settings) for your project.
1. [Create an OAuth2 client](https://console.cloud.google.com/apis/credentials) for your project.  This is done by choosing "Create credentials" then "OAuth client ID" under the Credentials tab.  Select "Web Application" as the Application type.  The name of the client doesn't matter, but be sure to add to "Authorized JavaScript origins" the domain (in the format of scheme://server-address:port-number) where the app will run.  Note the client id that is created.
1. Install the [Google Cloud SDK](https://cloud.google.com/sdk/).
1. Create a Cloud SQL instance (Postgresql flavor) in the same project, and note its cloud SQL instance connection name, such as:
   `ahope-parse-poc:northamerica-northeast1:ahope-poc-db`
   It is simple concatenation of GCloud project name, region name, and the CloudSQL instance id, separated by colons.
1. In the Cloud SQL instance, create a database user (also known as a "login role" in Postgresql) and create a database that this user either owns
   or has all privileges.
1. In [config.yml](./config.yml) file, configure properties as documented there.
1. As of now, you also need to add the CloudSQL connection name (see above) to app.standard.yml, under beta_settings.cloud_sql_instances

## Setup - Local

1. Setup a Postgresql server either locally or on another host that the local dev machine can reach by TCP socket.  Cloud SQL uses Postgresql 9.6.  While it is recommended to use the same version when installing locally, it's unlikely for version to matter if you want to use an existing Postgresql server of a version that is close to 9.6.  Collect the hostname and port number.
2. Same as setting up for cloud, create a database user and a database that this new user owns or can administer.
3. In [config-dev.yml](./config-dev.yml) file, create/update the following properties:
    1. DATABASE_URI: "postgres://\<db-user>:\<db-password>@/\<hostname:port>/\<database-name>".
    1. SERVER_URL: "http://localhost:8080/parse"  
    Note that all properties in [config.yml](./config.yml) file are inherited, subject to overriding.  
    
    If you want to run Parse server locally but using the Cloud SQL in Google Cloud, you can install and run
    a proxy, which opens and listens on a local TCP port to receive and route Postgresql requests to the Cloud SQL instance.  You should update DATABASE_URI
    accordingly to reflect the local host name and the port number used by the proxy.  For more details see [Cloud SQL Proxy](https://cloud.google.com/sql/docs/postgres/sql-proxy).

## Running locally

1. Follow the "Setup - Local" section above.  Make sure the configuration files are set correctly.
1. `npm install`
1. `npm start`
1. Goto http://localhost:8080/dashboard to access the Parse Dashboard.  URL http://localhost:8080/parse can be used for REST API access.
1. When logging into dashboard running locally, use ahope-admin/ahope as username/password.  See [server.js](./server.js) where passwords are set for local and cloud environments.
1. Note that Parse Server, when running locally but behind a corporate firewall, will likely not be able to validate an id token provided by Google Sign-in.

## Client side development

1. See a [sample page](./static/index.html) for how Google Sign-in and Parse Javascript SDK are used.
1. To access the page locally, go to http://localhost:8080/static/index.html.
1. Any complex business logic can be implemented as "Cloud Functions", as shown in [Cloud Function](./cloud/main.js), which runs on the server side.

## Deploy to App Engine standard environment

1. Make sure the necessary [environment variables](./config.yml) are set correctly.  See the "Setup - Cloud (App Engine) Only" section above.
1. `gcloud app deploy app.standard.yaml`

Refer to the [appengine/README.md](https://github.com/GoogleCloudPlatform/nodejs-docs-samples/tree/master/appengine/README.md) file for more instructions on
running and deploying.

## UI

- [keep-ahope UI](https://github.com/evandana/keep-ahope)
