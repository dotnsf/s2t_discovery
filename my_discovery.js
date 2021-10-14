//. my_discovery.js
//var discoveryv1 = require( 'ibm-watson/discovery/v1' );
var discoveryv2 = require( 'ibm-watson/discovery/v2' );
var { IamAuthenticator } = require( 'ibm-watson/auth' );

var settings = require( './settings' );

exports.discovery = new discoveryv2({
  version: '2019-04-30',
  authenticator: new IamAuthenticator({
    apikey: settings.discovery_apiKey
  }),
  serviceUrl: settings.discovery_url
});

