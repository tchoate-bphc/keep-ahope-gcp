"use strict";

const Parse = require('parse/node');
const axios = require('axios');

/**
 * This function compares the fields in schemaFieldsToAdd against the existing schema, excludes any existing fields from the former,
 * and sends an update request to Parse server to add new fields to the schema.
 * Note: this function does not delete any fields.
 */
function addAnyNewFieldsToSchema(existingSchemaData, schemaFieldsToAdd)
{
  // remove any existing fields from the request.
  Object.getOwnPropertyNames(existingSchemaData.fields).forEach(existingField => { delete schemaFieldsToAdd._fields[existingField] ; });
  return (Object.getOwnPropertyNames(schemaFieldsToAdd._fields).length + Object.getOwnPropertyNames(schemaFieldsToAdd._indexes).length > 0 ) ? 
    schemaFieldsToAdd.update() : Promise.resolve(existingSchemaData);
}

/**
 * This function creates a Role if it doesn't exist yet, and then optionally add other Roles as its members if those others are not yet a member.
 * @param {String} roleName name of the Role to be created if absent.
 * @param {Parse.Role} members collection of other Roles that automatically assumes this Role.
 * @return {Promise} A Promise, resolvable to the newly created or retrieved existing role.
 * @private
 */
function createRole(roleName, ...members)
{
  // By specifying no write privileges for the ACL, we can ensure the role cannot be altered.
  const roleAcl = new Parse.ACL();
  roleAcl.setPublicReadAccess(true);

  const options = {"useMasterKey": true};

  // Note:
  // Despite what the sample code here (https://docs.parseplatform.org/js/guide/#retrieving-objects) might imply,
  // can't use Parse.Object.extend("Role") in place of Parse.Role here to query roles.
  return (new Parse.Query(Parse.Role))
    .equalTo("name", roleName)
    .first(options)
    .then(role => (role !== undefined) ? Promise.resolve(role) : (new Parse.Role(roleName, roleAcl)).save(null, options))
    .then(role => {
      if (members.length > 0) {
        var roles = role.getRoles();
        members.forEach(member => roles.add(member));
        return role.save(null, options);
      }
      return Promise.resolve(role);
    });
}

/**
 * This function sets for a class such Class Level Permissions: Writer role can write, and Viewer can read.
 * 
 * See the example here:
 * https://docs.parseplatform.org/rest/guide/#requires-authentication-permission-requires-parse-server---230, and 
 * somewhat contradictory: https://docs.parseplatform.org/parse-server/guide/#requiresauthentication
 * 
 * @param {String} schemaResourceUrl The URL pointing to the schema resource, usually it is http(s)://${host}/parse/schemas/${className}
 * @param {String} appId The app id
 * @param {String} masterKey The master key
 * @return {Promise} Promise that represents the request to set CLPs.
 * @private
 */
function setSchemaPermissions(schemaResourceUrl, appId, masterKey)
{
  var clp = {
    "classLevelPermissions": {
      "get": {
        "role:Viewer": true
      },
      "find": {
        "role:Viewer": true
      },
      "create": {
        "role:Writer": true
      },
      "update": {
        "role:Writer": true
      },
      "delete": {
        "role:Writer": true
      },
      "addField": {
        // Add this if we need to allow dynamic field creation.
        // "role:Writer": true
      }
    },
  };

  return axios.put(schemaResourceUrl, JSON.stringify(clp), {headers: {
    'Content-Type': "application/json",
    'X-Parse-Application-Id': appId,
    'X-Parse-Master-Key': masterKey,
    }});
}

function setParseSchema (serverConfig, parseLocalUrl) {

  Parse.initialize(serverConfig.appId, null, serverConfig.masterKey);
  Parse.serverURL = parseLocalUrl || serverConfig.serverURL ;

  // We are going to create four roles for AHOPE classes:
  // (1) a Reader can read, but not write.
  // (2) a Writer can write, but not read.
  // (3) an Editor is a member of Reader and Writer roles, so can both read and write.
  // (4) an Administrator can do anything.  At this time, it is the same as Editor.
  // We recommend that the Administrator (who can access the dashboard) only grant Reader and Editor roles
  // to staff members at this time.

  var allPromises = [];

  var adminRole, editorRole;

  const promiseToCreateAllRoles = createRole("Administrator")
    .then(role => createRole("Editor", adminRole = role))
    .then(role => createRole("Writer", editorRole = role))
    .then(() => createRole("Viewer", editorRole));

  allPromises.push(promiseToCreateAllRoles);
  
/*
  Notes:

  (1) A Parse.Schema only represents data needed to make a request about a Parse Schema.  A better name would be SchemaRequest.
  
  (2) As such, fields added by Parse.Schema.prototype.addField() function and its ilks only represent intention to add/create them, and nothing else.
      For example, the .get() method doesn't change any such "fields" in the Schema object based on the result returned from the Parse server.
  
  (3) Starting from Parse v2, standard Javascript Promise has replaced Parse.Promise, which unfortunately is still used in sample code
      in ParsePlatform documentation as of this writing.
 */
  const contactSchema = new Parse.Schema('contacts');

  const promiseToCreateContactsClass = contactSchema
    // fields are listed by type and in alphabetical order.  In dashboard you may move columns around to examine.
    .addArray('otherDrugs')
    .addArray('otherDrugsAggregate')

    .addBoolean('didOdLastYear')
    .addBoolean('hasHealthInsurance')
    .addBoolean('hispanic')
    .addBoolean('isEnrolled')
    .addBoolean('isInCareForHepC')
    .addBoolean('isInCareForHiv')

    .addDate('ageOfFirstInjection')
    .addDate('dateOfBirth')
    .addDate('dateOfLastVisit')

    .addNumber('syringesGivenAggregate')
    .addNumber('syringesTakenAggregate')

    .addString('countryOfBirth')
    .addString('ethnicity')
    .addString('genderIdentity')
    .addString('healthInsurer')
    .addString('hepCStatus')
    .addString('hivStatus')
    .addString('housingStatus')
    .addString('primaryDrug')
    .addString('profileNotes')
    .addString('uid')    
    .addString('zipCode')

    .get()
    .then(existingSchemaData => addAnyNewFieldsToSchema(existingSchemaData, contactSchema))
    .catch(error => ((error.code === Parse.Error.INVALID_CLASS_NAME) ? contactSchema.save() : Promise.reject(error)));

  allPromises.push(promiseToCreateContactsClass);

  const eventSchema = new Parse.Schema('event');

  const promiseToCreateEventClass = eventSchema
    // fields are listed by type and in alphabetical order.  In dashboard you may move columns around to examine.
    .addArray('otherDrugs')
    .addArray('referrals')

    .addBoolean('didOdLastYear')
    .addBoolean('hasHealthInsurance')
    .addBoolean('hispanic')
    .addBoolean('isEnrolled')
    .addBoolean('isInCareForHepC')
    .addBoolean('isInCareForHiv')
    .addBoolean('isOutreach')
    .addBoolean('narcanWasOffered')
    .addBoolean('narcanWasTaken')

    .addDate('date')
    .addDate('dateOfBirth')
    .addDate('newContactDate')
    
    .addNumber('ageOfFirstInjection')    
    .addNumber('numberOfOthersHelping')    
    .addNumber('syringesGiven')
    .addNumber('syringesTaken')

    .addRelation('uid', 'contacts')
    
    .addString('countryOfBirth')
    .addString('ethnicity')
    .addString('eventNotes')
    .addString('genderIdentity')
    .addString('healthInsurer')
    .addString('hepCStatus')
    .addString('hivStatus')
    .addString('housingStatus')
    .addString('primaryDrug')
    .addString('profileNotes')
    .addString('zipCode')

    .get()
    .then(existingSchemaData => addAnyNewFieldsToSchema(existingSchemaData, eventSchema))
    .catch(error => ((error.code === Parse.Error.INVALID_CLASS_NAME) ? eventSchema.save() : Promise.reject(error)));

  allPromises.push(promiseToCreateEventClass);

  Promise.all(allPromises)
    .then(() => {
      return setSchemaPermissions(Parse.serverURL + "/schemas/contacts", serverConfig.appId, serverConfig.masterKey);
    })
    .then(() => {
      return setSchemaPermissions(Parse.serverURL + "/schemas/event", serverConfig.appId, serverConfig.masterKey);
    })
    .catch(error => {
      console.log(error);
    })
}

module.exports = setParseSchema;