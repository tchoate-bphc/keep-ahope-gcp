#!/bin/bash

# Here we try to parse the build log to find the project name, service name,
# and version id.  While we could hardcode the former two, and use some
# algorithm to generate a version id in earlier build steps which is then 
# somehow passed here, it appears better to parse the build log.  The 
# following lines are what we are looking for:
#
# Step #n: target project: [ahope-parse-poc]
# Step #n: target service: [default]
# Step #n: target version: [20190122t224737]
# Step #n: target url: [https://ahope-parse-poc.appspot.com]
# 
# Note: "gcloud builds describe $BUILD_ID" has been tried but didn't give
# version id or service name.  So parse the build log instead.

filter='^.*target[[:space:]]+([[:alpha:]]+):[[:space:]]+\[(.+)\]'
gcloud builds log $BUILD_ID | sed -rn "s/${filter}/\1=\2/p" > setup.sh
# Extract the salt from the app.standard.yaml file, 
# where the salt has been generated and injected in an earlier build step.
sed -nr 's/^.*MK_SALT:[[:space:]]+"(.+)"/mk_salt=\1/p' app.standard.yaml  >> setup.sh
chmod 755 setup.sh
echo --- ready to set up environment for triggering the db init. ---
. ./setup.sh
secret=$(echo -n $mk_salt | sha256sum | awk '{print $1}')
echo Sending init-db request to https://$version-dot-$service-dot-$project.appspot.com/parse/ahopeinit

curl --silent -w "\n" -H 'accept: application/json;q=0.9,*/*;q=0.8' "https://$version-dot-$service-dot-$project.appspot.com/parse/health"

curl --silent -w "\n" --user ahope:${secret} -d "" -H "Content-Type: application/x-www-form-urlencoded" -X POST https://$version-dot-$service-dot-$project.appspot.com/parse/ahopeinit
