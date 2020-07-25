const admin = require('firebase-admin');
const functions = require('firebase-functions');
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
const fetch = require('node-fetch');
const base64 = require('base-64');

admin.initializeApp();

// Secret manager setup
const client = new SecretManagerServiceClient();
const secretURI = 'projects/airpartners-ade/secrets/QUANTAQ_APIKEY/versions/latest';

// Quant-AQ request parameters
const BASE_URL = "https://quant-aq.com/device-api/v1/devices";
const LIMIT = 20; // not sure what this parameter controls
var completeToken = "";
const PASSWORD = ""; // no password required for now

// This needs to be updated when EB devices go live
const device_list = ['SN000-088', 'SN000-062', 'SN000-067', 'SN000-089', 'SN000-094', 'SN000-075'];


/*************** HELPER FUNCS ***********************/
/**
 * Return encoded Quant-AQ API key stored with Google Secret Manager
 */
async function getToken() {
  const [version] = await client.accessSecretVersion({
    name: secretURI,
  });
  const token = version.payload.data.toString();
  completeToken = 'Basic ' + base64.encode(token + ":" + PASSWORD);
  return completeToken;
}

/**
 * Return new data point without unused nodes
 *
 * @param {object} dataPoint the data point to be cleaned of unused data
 */
function removeUnusedData(dataPoint) {
  const dataNodesToKeep = ['co', 'no2', 'o3', 'pm25', 'rh_manifold', 'temp_manifold',
    'wind_dir', 'wind_speed', 'geo', 'sn', 'timestamp', 'timestamp_local'];
  newDataPoint = {};
  for (key of dataNodesToKeep) {
    if (typeof dataPoint[key] !== 'undefined') {
      newDataPoint[key] = dataPoint[key];
    }
  }
  return newDataPoint;
}

/**
 * Rounds any negative pollutant concentrations up to 0
 *
 * @param {object} dataPoint the data point to be fixed
 */
function fixNegativePollutantConcentrations(dataPoint) {
  const pollutantKeys = ['co', 'no2', 'o3', 'pm25'];
  for (key of pollutantKeys) {
    dataPoint[key] = (dataPoint[key] < 0) ? 0 : dataPoint[key];
  }
  return dataPoint;
}

/**
 * Write data to the Firebase Realtime Database
 *
 * @param {object} data contains a meta node with information about the request
 *        that returned this data and a data node which contains an array of
 *        objects which contain all the data for each timestamp
 */
async function writeDataToDB(data) {
  const resultLength = data['meta']['per_page'];
  const sn = data['data'][0]['sn'];
  var snRef = admin.database().ref(sn);
  console.log(`restructuring data for ${sn} and writing to DB`);
  let latestDataPoint = fixNegativePollutantConcentrations(removeUnusedData(data['data'][0]));
  snRef.child('latest').set(latestDataPoint);
  for (i = 0; i < resultLength; i++) {
    snRef.child('/data/' + data['data'][i]['timestamp']).set(data['data'][i]);
  }
}

/**
 * Return the complete endpoint for a request to Quant-AQ
 *
 * @param {string} deviceId the serial number of the device for the request
 * @param {integer} page which page of data to access (1 being the most recent data)
 * @param {integer} perPage how many data points to include per page (how many data
          points will be returned in each request)
 */
function getEndpoint(deviceId = 'SN000-072', page = 1, perPage = 2) {
  return `${BASE_URL}/${deviceId}/data/?page=${page}&per_page=${perPage}&limit=${LIMIT}`;
}

/**
 * Update the Firebase Realtime Database with the most recent data from Quant-AQ
 *
 * @param {string} sn the serial number of the device to be updated
 */
function getDataAndWriteToDB(sn) {
  getToken().then(result => fetch(getEndpoint(sn, 1, 10), {
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
}

/**
 * Get the value at the location in the Firebase Realtime DB specified by refString
 *
 * @param {string} refString the location of the value to return
 */
async function getValueFromDatabaseByRef(refString) {
  const snapshot = await admin.database().ref(refString).once('value');
  return snapshot.val();
}

/**
 * Build a new graph with the latest data point and any data points from current graph
 * which are less than 24 hours older than the latest data point
 *
 * @param {array} currentGraph array of existing graph data points
 * @param {object} latestDataPoint object representing the data point for the latest timestamp
 */
function buildNewGraph(currentGraph, latestDataPoint) {
  let newGraph = [];
  newGraph.push(latestDataPoint);
  const latestDate = new Date(latestDataPoint.timestamp);
  let date;
  const threshold = 1000 * 60 * 60 * 24; // milliseconds in a day
  currentGraph.forEach(dataPoint => {
    date = new Date(dataPoint.timestamp);
    if ((latestDate - date) <= threshold) {
      newGraph.push(dataPoint);
    }
  });
  return newGraph;
}

/**
 * Updates the graph node for the given sn if a new latest point exists
 *
 * @param {string} sn the serial number of the device to be updated
 * @param {boolean} debug true to enable verbose console output
 */
async function updateGraphNode(sn, debug = false) {
  if (debug) {
    console.log(`${sn}: Attempting to update graph node...`);
    console.log(`${sn}: Checking if latest node exists...`);
  }
  const latest = await getValueFromDatabaseByRef(`${sn}/latest`);
  if (latest) {
    if (debug) { console.log(`${sn}: Latest node exists. Checking if graph node exists...`); }
    const graph = await getValueFromDatabaseByRef(`${sn}/graph`);
    if (graph) {
      if (debug) { console.log(`${sn}: Graph node exists.`); }
      if (graph[0].timestamp !== latest.timestamp) {
        if (debug) { console.log(`${sn}: Updating graph node with new data point. Removing old data points...`); }
        const newGraph = buildNewGraph(graph, latest);
        admin.database().ref(sn).update({
          "graph": newGraph
        }).then(console.log(`${sn}: Done updating graph node.`))
          .catch(err => console.log(err));
      } else {
        console.log(`${sn}: The latest data point already exists in the graph node.`);
      }
    } else {
      if (debug) { console.log(`${sn}: Graph node doesn't exist. Creating one now with the latest data point...`); }
      admin.database().ref(sn).update({
        "graph": [latest]
      }).then(console.log(`${sn}: Done creating graph node.`))
        .catch(err => console.log(err));
    }
  } else {
    console.log(`${sn}: Latest node doesn't exist.`)
  }
}


/*************** FIREBASE CLOUD FUNCTIONS ***********************/
/**
 * This function iterates through each serial number in device_list and updates
 * its data in the Firebase Realtime Database with the most recent data from
 * Quant-AQ. This function can be manually triggered through its https endpoint.
 */
exports.fetchQuantAQ = functions.https.onRequest((request, response) => {
  for (sn of device_list) {
    getDataAndWriteToDB(sn);
  }
  response.send("Fetch is running asynchronously! The data will be in the database when it's done.");
})

/**
 * A scheduled version of fetchQuantAQ() which runs every 10 minutes.
 */
exports.fetchQuantAQScheduled = functions.pubsub.schedule('every 10 minutes').onRun((context) => {
  console.log("Fetching data from QuantAQ and writing to DB");
  for (sn of device_list) {
    getDataAndWriteToDB(sn);
  }
  return null;
})

/**
 * This function iterates through each serial number in device_list and clears its old
 * data from the Firebase Realtime Database. This function can be manually triggered
 * through its https endpoint.
 */
exports.clearQuantAQ = functions.https.onRequest((request, response) => {
  for (sn of device_list) {
    console.log(`Clearing data from ${sn}`);
    admin.database().ref(sn).child('data').set(null);
  }
  response.send("Running asynchronously! Data will be cleared when it is done.");
})

/**
 * A scheduled version of clearQuantAQ() which runs every 24 hours.
 */
exports.clearQuantAQScheduled = functions.pubsub.schedule('every 24 hours').onRun((context) => {
  for (sn of device_list) {
    console.log(`Clearing data from ${sn}`);
    admin.database().ref(sn).child('data').set(null);
  }
  return null;
})

/**
 * This function iterates through each serial number in device_list and updates
 * its graph node in the Firebase Realtime Database with the data point stored in its
 * latest node. It also removes any old data points in the graph node. This function
 * can be manually triggered through its https endpoint.
 */
exports.updateGraphNodes = functions.https.onRequest((request, response) => {
  for (sn of device_list) {
    updateGraphNode(sn);
  }
  response.send("Graph nodes updating asynchronously. See logs for progress.");
})

/**
 * A scheduled version of updateGraphNodes() which runs once every hour.
 */
exports.updateGraphNodesScheduled = functions.pubsub.schedule('every 1 hours').onRun((context) => {
  for (sn of device_list) {
    updateGraphNode(sn);
  }
  return null;
})
