const admin = require('firebase-admin');
const functions = require('firebase-functions');
const { getToken } = require('./utils');
const { updateGraphNode } = require('./graphNodeHelpers');
const { getDataAndWriteToDB } = require('./latestNodeHelpers');

const DEVICE_LIST = ['SN000-045', 'SN000-046', 'SN000-049', 'SN000-062', 'SN000-067', 'SN000-072'];


/*************** FIREBASE CLOUD FUNCTIONS ***********************/
/**
 * This function iterates through each serial number in DEVICE_LIST and updates
 * its data in the Firebase Realtime Database with the most recent data from
 * Quant-AQ. This function can be manually triggered through its https endpoint.
 */
exports.fetchQuantAQ = functions.https.onRequest((request, response) => {
  getToken()
    .then(token => {
      for (sn of DEVICE_LIST) {
        getDataAndWriteToDB(token, sn);
      }
      return null;
    }).catch(e => console.log(e));
  response.send("Fetch is running asynchronously! The data will be in the database when it's done.");
})

/**
 * A scheduled version of fetchQuantAQ() which runs every 10 minutes.
 */
exports.fetchQuantAQScheduled = functions.pubsub.schedule('every 10 minutes').onRun((context) => {
  console.log("Fetching data from QuantAQ and writing to DB");
  getToken()
    .then(token => {
      for (sn of DEVICE_LIST) {
        getDataAndWriteToDB(token, sn);
      }
      return null;
    }).catch(e => console.log(e));
  return null;
})

/**
 * This function iterates through each serial number in DEVICE_LIST and updates
 * its graph node in the Firebase Realtime Database with the data point stored in its
 * latest node. It also removes any old data points in the graph node. This function
 * can be manually triggered through its https endpoint.
 */
exports.updateGraphNodes = functions.https.onRequest((request, response) => {
  getToken()
    .then(token => {
      for (sn of DEVICE_LIST) {
        updateGraphNode(token, sn);
      }
      return null;
    }).catch(e => console.log(e));
  response.send("Graph nodes updating asynchronously. See logs for progress.");
})

/**
 * Listen to updates to the latest field of each device and trigger updatedGraphNode()
 */
exports.updateGraphNodeListener = functions.database.ref('{sn}/latest')
  .onUpdate((change, context) => {
    const sn = context.params.sn;
    return getToken()
      .then(token => updateGraphNode(token, sn))
      .catch(e => console.log(e));
  })
