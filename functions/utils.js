const admin = require('firebase-admin');
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
const fetch = require('node-fetch');
const base64 = require('base-64');

admin.initializeApp();

// Secret manager setup
const secretManagerServiceClient = new SecretManagerServiceClient();
const SECRET_URI = 'projects/airpartners-ade/secrets/QUANTAQ_APIKEY/versions/latest';

// Quant-AQ request parameters
const BASE_URL = "https://quant-aq.com/device-api/v1/devices";
const PASSWORD = ""; // no password required for now

const RAW_KEYS = ['bin0'];
const POLLUTANT_KEYS = RAW_KEYS.concat(['co', 'no2', 'o3', 'pm25', 'no']); // to check for negative values
const GRAPH_NODE_KEYS = POLLUTANT_KEYS.concat(['sn', 'timestamp', 'timestamp_local', 'lastRaw']);
const LATEST_NODE_KEYS = GRAPH_NODE_KEYS.concat(['rh_manifold', 'temp_manifold', 'wind_dir', 'wind_speed', 'geo']);
exports.RAW_KEYS = RAW_KEYS;
exports.POLLUTANT_KEYS = POLLUTANT_KEYS;
exports.GRAPH_NODE_KEYS = GRAPH_NODE_KEYS;

/**
 * Return encoded Quant-AQ API key stored with Google Secret Manager
 * @param {string} secretURI the URI of the secret to access
 */
getToken = async (secretURI = SECRET_URI) => {
  const [version] = await secretManagerServiceClient.accessSecretVersion({
    name: secretURI,
  });
  const token = version.payload.data.toString();
  const completeToken = 'Basic ' + base64.encode(token + ":" + PASSWORD);
  return completeToken;
}
exports.getToken = getToken;

/**
 * Get the value at the location in the Firebase Realtime DB specified by refString
 * @param {string} refString the location of the value to return
 */
getValueFromDatabaseByRef = async (refString) => {
  const snap = await admin.database().ref(refString).once('value');
  return snap.val();
}
exports.getValueFromDatabaseByRef = getValueFromDatabaseByRef;

/**
 * Get the latest node from the Firebase realtime db
 * @param {string} sn the device serial number
 */
getLatestDataPointFromDB = (sn) => {
  return getValueFromDatabaseByRef(`${sn}/latest`);
}
exports.getLatestDataPointFromDB = getLatestDataPointFromDB;

/**
 * Return the complete endpoint for a request to Quant-AQ
 * @param {string} sn the serial number of the device for the request
 * @param {boolean} raw if true, use the raw data endpoint
 * @param {integer} page which page of data to access (1 being the most recent data)
 * @param {integer} perPage how many data points to include per page (how many data 
 * points will be returned in each request)
 * @param {integer} limit how many total data points to access (use response meta field
 * for sequential requests if pagination is needed)
 */
getEndpoint = (sn = 'SN000-072', raw = false, page = 1, perPage = 1, limit = 1) => {
  if (raw) {
    return `${BASE_URL}/${sn}/data/raw/?page=${page}&per_page=${perPage}&limit=${limit}`
  } else {
    return `${BASE_URL}/${sn}/data/?page=${page}&per_page=${perPage}&limit=${limit}`
  }
}
exports.getEndpoint = getEndpoint;

/**
 * Fetch data from QuantAQ
 * @param {string} token the encoded token to authenticate the request
 * @param {string} endpoint the endpoint to make the request to
 */
fetchQuantAQData = (token, endpoint) => {
  return fetch(endpoint, {
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': token,
    },
    credentials: 'include',
    method: 'GET'
  })
    .then(res => res.json())
    .catch(e => console.log(e));
}
exports.fetchQuantAQData = fetchQuantAQData

/**
 * Return true if dateStringLatest is more than 15 minutes later than dateStringHead
 * @param {string} dateStringHead timestamp in ISO date-time format
 * @param {string} dateStringLatest timestamp in ISO date-time format
 * @param {integer} thresholdInMinutes minimum difference expected in minutes
 */
enoughTimePassed = (dateStringHead, dateStringLatest, thresholdInMinutes) => {
  const headTime = new Date(dateStringHead);
  const latestTime = new Date(dateStringLatest);
  const timeDiff = latestTime - headTime;
  const threshold = 1000 * 60 * thresholdInMinutes;
  return timeDiff >= threshold;
}
exports.enoughTimePassed = enoughTimePassed;

/**
 * Adds raw keys from raw data point to a data point with final data
 * @param {object} final the final data point to add the raw data to
 * @param {object} raw the raw data point to get the raw data from
 */
addRawDataToFinalDataPoint = (final, raw) => {
  let raws = {}
  for (key of RAW_KEYS) {
    if (typeof raw[key] !== 'undefined') {
      raws[key] = raw[key];
    }
  }
  if (final.timestamp === raw.timestamp) {
    final = { ...final, ...raws };
  } else {
    timestamp = (typeof raw.timestamp === 'undefined') ? null : raw.timestamp;
    timestamp_local = (typeof raw.timestamp_local === 'undefined') ? null : raw.timestamp_local;
    final['lastRaw'] = {
      ...raws,
      timestamp: timestamp,
      timestamp_local: timestamp_local
    };
  }
  return final;
}
exports.addRawDataToFinalDataPoint = addRawDataToFinalDataPoint;

/**
 * Return new data point without unused nodes
 * @param {object} dataPoint the data point to be cleaned of unused data
 * @param {array} keysToKeep the keys for the nodes to keep in dataPoint
 */
removeUnusedData = (dataPoint, keysToKeep = LATEST_NODE_KEYS) => {
  newDataPoint = {};
  for (key of keysToKeep) {
    if (typeof dataPoint[key] !== 'undefined') {
      newDataPoint[key] = dataPoint[key];
    }
  }
  return newDataPoint
}
exports.removeUnusedData = removeUnusedData;

/**
 * Rounds any negative pollutant concentrations up to 0
 * @param {object} dataPoint the data point to be fixed
 */
fixNegativePollutantConcentrations = (dataPoint, keysToFix = POLLUTANT_KEYS) => {
  for (key of keysToFix) {
    if (typeof dataPoint[key] !== 'undefined') {
      dataPoint[key] = (dataPoint[key] < 0) ? 0 : dataPoint[key];
    }
  }
  return dataPoint;
}
exports.fixNegativePollutantConcentrations = fixNegativePollutantConcentrations;

/**
 * Reduces lat/long specificity to 3 decimal places
 * @param {object} dataPoint the data point to be fixed
 */
trimGeoData = (dataPoint) => {
  if (dataPoint.geo) {
    dataPoint.geo.lat = parseFloat(Number(dataPoint.geo.lat).toFixed(3));
    dataPoint.geo.lon = parseFloat(Number(dataPoint.geo.lon).toFixed(3));
  }
  return dataPoint;
}
exports.trimGeoData = trimGeoData;

/**
 * Write something to the Firebase realtime db
 * @param {string} sn the device serial number
 * @param {string} child the child node of the device to write to
 * @param {*} val the value to write to the child node
 */
writeToDB = (sn, child, val) => {
  return admin.database().ref(sn).child(child).set(val);
}
exports.writeToDB = writeToDB;
