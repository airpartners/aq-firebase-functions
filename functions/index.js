const admin = require('firebase-admin');
const functions = require('firebase-functions');

admin.initializeApp();

// Create and Deploy Your First Cloud Functions
// https://firebase.google.com/docs/functions/write-firebase-functions

exports.helloWorld = functions.https.onRequest((request, response) => {
  console.log("Hello console!");
  response.send("Hello from Firebase!");
});

exports.scheduledFunction = functions.pubsub.schedule('every 5 minutes').onRun((context) => {
  console.log('This will be run every 5 minutes!');
  return null;
});

exports.writeDB = functions.https.onRequest((request, response) => {
  console.log("Hello console! I'm trying to write to the realtime db...");
  admin.database().ref("users").set({
    lucky: {
      date_of_birth: "February 12, 1984",
      full_name: "Lakhvinder Jordan"
    },
    nina: {
      date_of_birth: "December 9, 1906",
      full_name: "Nina Tchirkova"
    }
  });
  response.send("Wrote something to realtime db!");
});

const fetch = require('node-fetch');

/**
 * TODO(developer): Uncomment these variables before running the sample.
 */
// const name = 'projects/my-project/secrets/my-secret/versions/5';
const name = 'projects/airpartners-ade/secrets/QUANTAQ_APIKEY/versions/latest';

// Imports the Secret Manager library
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');

// Instantiates a client
const client = new SecretManagerServiceClient();

async function accessSecretVersion() {
  const [version] = await client.accessSecretVersion({
    name: name,
  });

  // Extract the payload as a string.
  const payload = version.payload.data.toString();

  // WARNING: Do not print the secret in a production environment - this
  // snippet is showing how to access the secret material.
  console.info(`Payload: ${payload}`);
}

const base64 = require('base-64');
const BASE_URL = "https://quant-aq.com/device-api/v1/devices";
const LIMIT = 20;
var completeToken = "";
const PASSWORD = "";

async function getToken() {
  const [version] = await client.accessSecretVersion({
    name: name,
  });
  const token = version.payload.data.toString();
  completeToken = 'Basic ' + base64.encode(token + ":" + PASSWORD);
  return completeToken;
}

async function writeDataToDB(data) {
  console.log("restructuring data and writing to DB");
  const resultLength = data['meta']['per_page'];
  const sn = data['data'][0]['sn'];
  var snRef = admin.database().ref(sn);
  snRef.child('latest').set(data['data'][0]);
  for (i = 0; i < resultLength; i++) {
    snRef.child('/data/'+data['data'][i]['timestamp']).set(data['data'][i]);
  }
}

function getEndpoint(deviceId = 'SN000-072', page = 1, perPage = 2) {
  return `${BASE_URL}/${deviceId}/data/?page=${page}&per_page=${perPage}&limit=${LIMIT}`;
}

exports.fetchQuantAQ = functions.https.onRequest((request, response) => {
  getToken().then(result => fetch(getEndpoint('SN000-088', 1, 10), {
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': result,
    },
    credentials: 'include',
    method: 'GET'
  })).then(res => res.json())
    .then(data => writeDataToDB(data))
    .catch(error => console.log(error));
  response.send("Fetch is running asynchronously! The data will be printed to the console when it's done.");
} )

exports.clearQuantAQ = functions.https.onRequest((request, response) => {
  console.log("Clearing data from SN000-088");
  admin.database().ref('SN000-088').set(null);
  response.send("Running asynchronously! Data will be cleared when it is done.")
})

exports.accessSecret = functions.https.onRequest((request, response) => {
  console.log("Hello console! I'm trying to access a secret...");
  accessSecretVersion().catch(console.error);
  response.send("Secret access running asynchronously! The data will be printed to the console when it's done.");
})
