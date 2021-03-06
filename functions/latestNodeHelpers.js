const { fetchQuantAQData, getEndpoint, enoughTimePassed,
  addRawDataToFinalDataPoint, removeUnusedData, writeToDB,
  getLatestDataPointFromDB, fixNegativePollutantConcentrations,
  trimGeoData } = require("./utils");

/**
 * Fetch the most recent final data point from quantAQ
 * @param {string} token the encoded token to authenticate the request
 * @param {string} sn the device serial number
 */
fetchFinalDataPoint = (token, sn) => {
  return fetchQuantAQData(token, getEndpoint(sn))
    .then(json => json.data[0])
    .catch(e => console.log(e));
}

/**
 * Fetch the most recent raw data point from quantAQ
 * @param {string} token the encoded token to authenticate the request
 * @param {string} sn the device serial number
 */
fetchRawDataPoint = (token, sn) => {
  return fetchQuantAQData(token, getEndpoint(sn, true))
    .then(json => json.data[0])
    .catch(e => console.log(e));
}

/**
 * Checks if the latest data point is at least one minute newer than head
 * @param {object} head the head data point
 * @param {object} latest the latest data point
 */
newDataIsAvailable = (head, latest) => {
  return enoughTimePassed(head.timestamp, latest.timestamp, 1);
}
exports.newDataIsAvailable = newDataIsAvailable; // for tests

/**
 * Returns the data point after adding raw data, removing unused data,
 * fixing negative values, and trimming geo data.
 * @param {object} finalDataPoint the latest final data point
 * @param {object} rawDataPoint the latest raw data point
 */
restructureData = (finalDataPoint, rawDataPoint) => {
  finalDataPoint = addRawDataToFinalDataPoint(finalDataPoint, rawDataPoint);
  finalDataPoint = removeUnusedData(finalDataPoint);
  finalDataPoint = fixNegativePollutantConcentrations(finalDataPoint);
  finalDataPoint = trimGeoData(finalDataPoint);
  return finalDataPoint;
}
exports.restructureData = restructureData; // for tests

writeLatestDataPointToDB = (sn, dataPoint) => {
  return writeToDB(sn, 'latest', dataPoint);
}
exports.writeLatestDataPointToDB = writeLatestDataPointToDB; // for tests

exports.getDataAndWriteToDB = async (token, sn) => {
  const latestDataPointFromDB = await getLatestDataPointFromDB(sn);
  const latestFinalDataPointFromQuantAQ = await fetchFinalDataPoint(token, sn);
  if (!latestDataPointFromDB || newDataIsAvailable(latestDataPointFromDB, latestFinalDataPointFromQuantAQ)) {
    const latestRawDataPointFromQuantAQ = await fetchRawDataPoint(token, sn);
    const dataPointToWrite = restructureData(latestFinalDataPointFromQuantAQ, latestRawDataPointFromQuantAQ);
    return writeLatestDataPointToDB(sn, dataPointToWrite);
  } else {
    console.log(`getDataAndWriteToDB: No new data available for ${sn}`)
    return null;
  }
}