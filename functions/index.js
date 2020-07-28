const admin = require('firebase-admin');
const functions = require('firebase-functions');
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
const fetch = require('node-fetch');
const base64 = require('base-64');

admin.initializeApp();

// Secret manager setup
const secretManagerServiceClient = new SecretManagerServiceClient();
const SECRET_URI = 'projects/airpartners-ade/secrets/QUANTAQ_APIKEY/versions/latest';

// Quant-AQ request parameters
const BASE_URL = "https://quant-aq.com/device-api/v1/devices";
const LIMIT = 20; // not sure what this parameter controls
var completeToken = "";
const PASSWORD = ""; // no password required for now

// This needs to be updated when EB devices go live
const DEVICE_LIST = ['SN000-088', 'SN000-062', 'SN000-067', 'SN000-089', 'SN000-094', 'SN000-075'];
const POLLUTANT_KEYS = ['co', 'no2', 'o3', 'pm25', 'no']; // to check for negative values
const GRAPH_NODE_KEYS = ['co', 'no', 'no2', 'o3', 'pm25', 'sn', 'timestamp', 'timestamp_local'];
const LATEST_NODE_KEYS = ['co', 'no', 'no2', 'o3', 'pm25', 'rh_manifold', 'temp_manifold',
  'wind_dir', 'wind_speed', 'geo', 'sn', 'timestamp', 'timestamp_local'];


/*************** HELPER FUNCS ***********************/
/**
 * Return encoded Quant-AQ API key stored with Google Secret Manager
 */
async function getToken() {
  const [version] = await secretManagerServiceClient.accessSecretVersion({
    name: SECRET_URI,
  });
  const token = version.payload.data.toString();
  completeToken = 'Basic ' + base64.encode(token + ":" + PASSWORD);
  return completeToken;
}

/**
 * Return new data point without unused nodes
 *
 * @param {object} dataPoint the data point to be cleaned of unused data
 * @param {array} keysToKeep the keys for the nodes to keep in dataPoint
 */
function removeUnusedData(dataPoint, keysToKeep) {
  newDataPoint = {};
  for (key of keysToKeep) {
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
  for (key of POLLUTANT_KEYS) {
    dataPoint[key] = (dataPoint[key] < 0) ? 0 : dataPoint[key];
  }
  return dataPoint;
}

/**
 * Reduces lat/long specificity to 3 decimal places
 *
 * @param {object} dataPoint the data point to be fixed
 */
function trimGeoData(dataPoint) {
  dataPoint.geo.lat = parseFloat(Number(dataPoint.geo.lat).toFixed(3));
  dataPoint.geo.lon = parseFloat(Number(dataPoint.geo.lon).toFixed(3));
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
  let latestDataPoint = trimGeoData(fixNegativePollutantConcentrations(removeUnusedData(data['data'][0], LATEST_NODE_KEYS)));
  snRef.child('latest').set(latestDataPoint);
  for (i = 0; i < resultLength; i++) {
    let dataPoint = trimGeoData(data['data'][i]);
    snRef.child('/data/' + data['data'][i]['timestamp']).set(dataPoint);
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
      newGraph.push(removeUnusedData(dataPoint, GRAPH_NODE_KEYS));
    }
  });
  return newGraph;
}

/**
 * Return true if dateStringLatest is more than 15 minutes later than dateStringHead
 *
 * @param {string} dateStringHead timestamp in ISO date-time format
 * @param {string} dateStringLatest timestamp in ISO date-time format
 */
function enoughTimePassed(dateStringHead, dateStringLatest) {
  const headTime = new Date(dateStringHead);
  const latestTime = new Date(dateStringLatest);
  const timeDiff = latestTime - headTime;
  const threshold = 1000 * 60 * 15; // 15 minutes in milliseconds
  return timeDiff >= threshold;
}

/**
 * Updates the graph node for the given sn if a new latest point exists
 *
 * @param {string} sn the serial number of the device to be updated
 */
async function updateGraphNode(sn) {
  const latest = await getValueFromDatabaseByRef(`${sn}/latest`);
  if (latest) {
    const graph = await getValueFromDatabaseByRef(`${sn}/graph`);
    if (Array.isArray(graph)) {
      if (enoughTimePassed(graph[0].timestamp, latest.timestamp)) {
        const newGraph = buildNewGraph(graph, latest);
        admin.database().ref(sn).update({
          "graph": newGraph
        }).then(console.log(`${sn}: Done updating graph node.`))
          .catch(err => console.log(err));
      } else {
        console.log(`${sn}: A data point within 15 minutes of the latest timestamp already exists.`);
      }
    } else {
      admin.database().ref(sn).update({
        "graph": [removeUnusedData(latest, GRAPH_NODE_KEYS)]
      }).then(console.log(`${sn}: Done creating graph node.`))
        .catch(err => console.log(err));
    }
  } else {
    console.log(`${sn}: Latest node doesn't exist.`)
  }
}


/*************** FIREBASE CLOUD FUNCTIONS ***********************/
/**
 * This function iterates through each serial number in DEVICE_LIST and updates
 * its data in the Firebase Realtime Database with the most recent data from
 * Quant-AQ. This function can be manually triggered through its https endpoint.
 */
exports.fetchQuantAQ = functions.https.onRequest((request, response) => {
  for (sn of DEVICE_LIST) {
    getDataAndWriteToDB(sn);
  }
  response.send("Fetch is running asynchronously! The data will be in the database when it's done.");
})

/**
 * A scheduled version of fetchQuantAQ() which runs every 10 minutes.
 */
exports.fetchQuantAQScheduled = functions.pubsub.schedule('every 10 minutes').onRun((context) => {
  console.log("Fetching data from QuantAQ and writing to DB");
  for (sn of DEVICE_LIST) {
    getDataAndWriteToDB(sn);
  }
  return null;
})

/**
 * This function iterates through each serial number in DEVICE_LIST and clears its old
 * data from the Firebase Realtime Database. This function can be manually triggered
 * through its https endpoint.
 */
exports.clearQuantAQ = functions.https.onRequest((request, response) => {
  for (sn of DEVICE_LIST) {
    console.log(`Clearing data from ${sn}`);
    admin.database().ref(sn).child('data').set(null);
  }
  response.send("Running asynchronously! Data will be cleared when it is done.");
})

/**
 * A scheduled version of clearQuantAQ() which runs every 24 hours.
 */
exports.clearQuantAQScheduled = functions.pubsub.schedule('every 24 hours').onRun((context) => {
  for (sn of DEVICE_LIST) {
    console.log(`Clearing data from ${sn}`);
    admin.database().ref(sn).child('data').set(null);
  }
  return null;
})

/**
 * This function iterates through each serial number in DEVICE_LIST and updates
 * its graph node in the Firebase Realtime Database with the data point stored in its
 * latest node. It also removes any old data points in the graph node. This function
 * can be manually triggered through its https endpoint.
 */
exports.updateGraphNodes = functions.https.onRequest((request, response) => {
  for (sn of DEVICE_LIST) {
    updateGraphNode(sn);
  }
  response.send("Graph nodes updating asynchronously. See logs for progress.");
})

/**
 * Listen to updates to the latest field of each device and trigger updatedGraphNode()
 */
exports.updateGraphNodeListener = functions.database.ref('{sn}/latest')
  .onUpdate((change, context) => {
    const snapshot = change.after;
    const sn = context.params.sn;
    return updateGraphNode(sn);
  })
