const { enoughTimePassed, fetchQuantAQData, getEndpoint,
  getValueFromDatabaseByRef, addRawDataToFinalDataPoint,
  writeToDB, removeUnusedData, fixNegativePollutantConcentrations,
  trimGeoData, RAW_KEYS, GRAPH_NODE_KEYS } = require("./utils");

/**
 * Get graph node from Firebase realtime db
 * @param {string} sn the device serial number
 */
getGraphFromDB = (sn) => {
  return getValueFromDatabaseByRef(`${sn}/graph`);
}
exports.getGraphFromDB = getGraphFromDB; // for tests

/**
 * Build a new graph with the latest data point and any data points from current graph
 * which are less than 24 hours older than the latest data point if the latest data point
 * is at least 15 minutes newer than the newest data point in the graph
 * @param {array} currentGraph array of existing graph data points
 * @param {object} latestDataPoint object representing the data point for the latest timestamp
 */
buildNewGraph = (currentGraph, latestDataPoint) => {
  if (enoughTimePassed(currentGraph[0].timestamp, latestDataPoint.timestamp, 15)) {
    let newGraph = [];
    newGraph.push(latestDataPoint);
    const latestDate = new Date(latestDataPoint.timestamp);
    const threshold = 1000 * 60 * 60 * 24; // milliseconds in a day
    let date;
    for (let dataPoint of currentGraph) {
      date = new Date(dataPoint.timestamp);
      if ((latestDate - date) <= threshold) {
        newGraph.push(dataPoint);
      }
    }
    return newGraph;
  } else {
    return currentGraph;
  }
}
exports.buildNewGraph = buildNewGraph; // for tests

/**
 * Tries to fill in any missing graph points (when quant aq data wasn't up to date)
 * @param {string} token the encoded token to authenticate the request
 * @param {string} sn the device serial number
 * @param {array} graph the graph to check and update as needed/possible
 */
addMissingGraphPoints = async (token, sn, graph) => {
  console.log(`${sn}: Trying to add missing graph points if needed.`);

  if (graph.length >= 2) {
    // split graph
    let newGraph = [];
    newGraph.push(graph.shift());
    const prevPoint = graph[0];
    const prevPointDate = new Date(prevPoint.timestamp);

    if (enoughTimePassed(prevPoint.timestamp, newGraph[0].timestamp, 30)) {
      // gap exists, start looking for data
      let missingDataMayExist = true;
      let nextPoint = newGraph[0];

      const perPage = 100;
      const limit = 1400;
      const maxRequests = limit / perPage;
      let response = await fetchQuantAQData(token, getEndpoint(sn, false, 1, perPage, limit));
      let numRequests = 1;
      let quantaqData = response.data;
      let nextEndpoint = response.meta.next_url;
      let headDate = new Date(quantaqData[0].timestamp);

      while (missingDataMayExist && enoughTimePassed(prevPoint.timestamp, nextPoint.timestamp, 30)) {
        if ((prevPointDate - headDate) >= 0) {
          missingDataMayExist = false;
        } else {
          let foundPoint = false;
          for (let quantaqDataPoint of quantaqData) {
            if (enoughTimePassed(quantaqDataPoint.timestamp, nextPoint.timestamp, 20)
              && enoughTimePassed(prevPoint.timestamp, quantaqDataPoint.timestamp, 10)) {
              foundPoint = true;
              quantaqDataPoint = removeUnusedData(quantaqDataPoint, GRAPH_NODE_KEYS);
              quantaqDataPoint = fixNegativePollutantConcentrations(quantaqDataPoint);
              quantaqDataPoint = trimGeoData(quantaqDataPoint);
              newGraph.push(quantaqDataPoint);
              nextPoint = quantaqDataPoint;
              break;
            }
          }
          if (!foundPoint) {
            if (nextEndpoint && (numRequests < maxRequests)) {
              numRequests = numRequests + 1;
              console.log(`${sn} adding graph points: Request number ${numRequests}.`)
              // eslint-disable-next-line
              response = await fetchQuantAQData(token, nextEndpoint);
              quantaqData = response.data;
              nextEndpoint = response.meta.next_url;
              headDate = new Date(quantaqData[0].timestamp);
            } else {
              missingDataMayExist = false;
            }
          }
        }
      }

    }

    return newGraph.concat(graph);
  }
  return graph;
}

/**
 * Checks if any raw data keys are missing from the data point
 * @param {object} dataPoint the data point to check
 */
needsRawData = (dataPoint) => {
  for (let key of RAW_KEYS) {
    if (typeof dataPoint[key] === 'undefined') {
      return true;
    }
  }
  return false;
}
exports.needsRawData = needsRawData; // for tests

/**
 * Tries to find matching raw data for any graph nodes which are missing it
 * @param {string} token the encoded token to authenticate the request
 * @param {string} sn the device serial number
 * @param {array} graph the graph to check and update as needed/possible
 */
addRawDataToGraph = async (token, sn, graph) => {
  console.log(`${sn}: Trying to add raw data to graph if needed.`);
  let newGraph = [];
  const perPage = 100;
  const limit = 1400;
  const maxRequests = limit / perPage;
  let response = await fetchQuantAQData(token, getEndpoint(sn, true, 1, perPage, limit));
  let numRequests = 1;
  let quantaqData = response.data;
  let nextEndpoint = response.meta.next_url;
  let headDate = new Date(quantaqData[0].timestamp);
  let tailDate = new Date(quantaqData[quantaqData.length - 1].timestamp);
  for (let graphDataPoint of graph) {
    let doesNeedRawData = needsRawData(graphDataPoint);
    const graphDataPointDate = new Date(graphDataPoint.timestamp);
    while (doesNeedRawData) {
      if ((graphDataPointDate - headDate) > 0) {
        doesNeedRawData = false;
      } else if ((tailDate - graphDataPointDate) > 0) {
        if (nextEndpoint && (numRequests < maxRequests)) {
          numRequests = numRequests + 1;
          console.log(`${sn} adding raw data: Request number ${numRequests}.`)
          // eslint-disable-next-line
          response = await fetchQuantAQData(token, nextEndpoint);
          quantaqData = response.data;
          nextEndpoint = response.meta.next_url;
          headDate = new Date(quantaqData[0].timestamp);
          tailDate = new Date(quantaqData[quantaqData.length - 1].timestamp);
        } else {
          doesNeedRawData = false;
        }
      } else {
        for (let quantaqDataPoint of quantaqData) {
          if (quantaqDataPoint.timestamp === graphDataPoint.timestamp) {
            graphDataPoint = addRawDataToFinalDataPoint(graphDataPoint, quantaqDataPoint);
            break;
          }
        }
        doesNeedRawData = false;
      }
    }
    newGraph.push(graphDataPoint);
  }
  return newGraph;
}

/**
 * Write graph to db
 * @param {string} sn the device serial number
 * @param {array} graph the graph array to write
 */
writeGraphToDB = (sn, graph) => {
  return writeToDB(sn, 'graph', graph);
}
exports.writeGraphToDB = writeGraphToDB; // for tests

/**
 * Try to update the graph node if the latest node exists
 * @param {string} token the encoded token to authenticate the request
 * @param {string} sn the device serial number
 */
exports.updateGraphNode = async (token, sn) => {
  const latestDataPointFromDB = await getLatestDataPointFromDB(sn);
  if (latestDataPointFromDB) {
    const latestDataPoint = removeUnusedData(latestDataPointFromDB, GRAPH_NODE_KEYS);
    const graphFromDB = await getGraphFromDB(sn);
    if (Array.isArray(graphFromDB)) {
      const updatedGraph = buildNewGraph(graphFromDB, latestDataPoint);
      try {
        const fullGraph = await addMissingGraphPoints(token, sn, updatedGraph)
        const graphToWrite = await addRawDataToGraph(token, sn, fullGraph);
        return writeGraphToDB(sn, graphToWrite);
      } catch (e) {
        console.log(e);
        return writeGraphToDB(sn, updatedGraph);
      }
    } else {
      return writeGraphToDB(sn, [latestDataPoint]);
    }
  } else {
    console.log(`updateGraphNode: Latest node returned null for ${sn}`);
    return null;
  }
}
