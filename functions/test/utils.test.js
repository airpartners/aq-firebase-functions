const base64 = require('base-64');
const fs = require('fs');
const chai = require('chai');
const assert = chai.assert;

var TEST_DB_ONLINE;
var test;
const serviceAccountFilePath = 'test/airpartners-ade-964cc0280add.json';
if (fs.existsSync(serviceAccountFilePath)) {
  test = require('firebase-functions-test')({
    databaseURL: 'https://airpartners-ade-test-data.firebaseio.com',
    storageBucket: 'airpartners-ade.appspot.com',
    projectId: 'airpartners-ade',
  }, serviceAccountFilePath);
  TEST_DB_ONLINE = true;
} else {
  test = require('firebase-functions-test')();
  TEST_DB_ONLINE = false;
}

const admin = require('firebase-admin');

describe('Helper functions', () => {
  let utils;

  before(() => {
    utils = require('../utils');
    if (!TEST_DB_ONLINE) {
      console.log('WARNING: Not testing online functions because the service account file path does not exist. This is likely due to testing on a new machine or a continuous integration environment without the proper service account file.');
    }
  });

  after(() => {
    // Do cleanup tasks.
    test.cleanup();
  });

  if (TEST_DB_ONLINE) {
    describe('Online functions', () => {
      describe('getToken', () => {
        it('should retrieve and encode fake secret', (done) => {
          const secretURI = 'projects/airpartners-ade/secrets/QUANTAQ_APIKEY/versions/1';
          const expectedResult = 'Basic ' + base64.encode('test_fake_key:');

          utils.getToken(secretURI).then((res) => {
            assert.equal(res, expectedResult);
            done();
            return null;
          }).catch(e => done(e));
        });
      });

      describe('writeDataToDB', () => {
        after(() => {
          // Reset the database.
          // admin.database().ref('SN-00TEST').remove();
        });

        it('should remove unnecessary field, truncate geo data, fix negative values, and populate latest field', (done) => {
          const data = {
            data: [
              {
                co2: '3',
                no2: '4',
                pm25: -0.037,
                timestamp: '12:07',
                sn: 'SN-00TEST',
                geo: {
                  lat: 42.38745,
                  lon: -71.0
                }
              },
              {
                co2: '1',
                no2: '2',
                pm25: 0.1,
                timestamp: '12:08',
                sn: 'SN-00TEST',
                geo: {
                  lat: 42.38745,
                  lon: -71.0
                }
              },
              {
                co2: '4',
                no2: '2',
                pm25: 0.045,
                timestamp: '12:09',
                sn: 'SN-00TEST',
                geo: {
                  lat: 42.38745,
                  lon: -71.0
                }
              }],
            meta: {
              per_page: '3'
            }
          };
          const expectedResultLatest = {
            no2: '4',
            pm25: 0,
            timestamp: '12:07',
            sn: 'SN-00TEST',
            geo: {
              lat: 42.387,
              lon: -71.0
            }
          };

          utils.writeDataToDB(data).then(async () => {
            const snap = await admin.database().ref('SN-00TEST/latest').once('value');
            assert.deepEqual(snap.val(), expectedResultLatest);
            done();
            return null;
          }).catch(e => done(e));
        });
      });

      describe('getValueFromDatabaseByRef', () => {
        const refString = 'test';
        const val = 0;

        before(() => {
          admin.database().ref(refString).set(val);
        });

        after(() => {
          admin.database().ref(refString).remove();
        });

        it('should get value at the specified ref from the test db', (done) => {
          utils.getValueFromDatabaseByRef(refString).then((res) => {
            assert.equal(res, val);
            done();
          }).catch(e => done(e));
        });
      });
    });
  }

  describe('Offline functions', () => {
    describe('removeUnusedData', () => {
      it('should remove unused nodes and ignore undefined nodes', () => {
        const keysToKeep = ['test', 'test4', 'test6'];
        const dataPoint = {
          test: 1,
          test2: 2,
          test3: 3,
          test4: {
            four: 4,
            five: 5
          }
        };
        const expectedResult = {
          test: 2,
          test4: {
            four: 4,
            five: 5
          }
        }

        assert.deepEqual(utils.removeUnusedData(dataPoint, keysToKeep), expectedResult);
      });
    });

    describe('fixNegativePollutantConcentrations', () => {
      it('should change negative values to 0 and ignore undefined nodes', () => {
        const keysToFix = ['test', 'test2', 'test6'];
        const dataPoint = {
          test: -1,
          test2: -2,
          test3: -3,
          test4: {
            four: -4,
            five: 5
          }
        };
        const expectedResult = {
          test: 0,
          test2: 0,
          test3: -3,
          test4: {
            four: -4,
            five: 5
          }
        }

        assert.deepEqual(utils.fixNegativePollutantConcentrations(dataPoint, keysToFix), expectedResult);
      });
    });

    describe('trimGeoData', () => {
      it('should trim geo data to 3 decimal places', () => {
        const dataPoint = {
          geo: {
            lat: 32.8756,
            lon: 5
          }
        };
        const expectedResult = {
          geo: {
            lat: 32.876,
            lon: 5
          }
        }

        assert.deepEqual(utils.trimGeoData(dataPoint), expectedResult);
      });

      it('should not throw error if geo node is undefined', () => {
        const dataPoint = {
          test: -1,
          test4: {
            four: -4,
            five: 5
          }
        };
        const expectedResult = {
          test: -1,
          test4: {
            four: -4,
            five: 5
          }
        }

        assert.deepEqual(utils.trimGeoData(dataPoint), expectedResult);
      });
    });

    describe('getEndpoint', () => {
      it('should return specified quant-aq endpoint', () => {
        const expectedResult = 'https://quant-aq.com/device-api/v1/devices/SN000-049/data/?page=1&per_page=10&limit=20';

        assert.equal(utils.getEndpoint('SN000-049', 1, 10), expectedResult);
      });
    });

    describe('buildNewGraph', () => {
      it('should add latest data point and remove old data points', () => {
        const currentGraph = [
          { timestamp: '2020-04-02T22:54:48' },
          { timestamp: '2020-03-02T22:54:48' }
        ];
        const latestDataPoint = { timestamp: '2020-04-02T23:54:48' };
        const expectedResult = [
          { timestamp: '2020-04-02T23:54:48' },
          { timestamp: '2020-04-02T22:54:48' }
        ];

        assert.deepEqual(utils.buildNewGraph(currentGraph, latestDataPoint), expectedResult);
      });
    });

    describe('enoughTimePassed', () => {
      it('should return true', () => {
        const dateStringHead = '2020-04-02T23:54:48';
        const dateStringLatest = '2020-04-03T00:10:48';

        assert.isTrue(utils.enoughTimePassed(dateStringHead, dateStringLatest));
      });

      it('should return false', () => {
        const dateStringHead = '2020-04-02T23:54:48';
        const dateStringLatest = '2020-04-02T24:08:48';

        assert.isFalse(utils.enoughTimePassed(dateStringHead, dateStringLatest));
      });
    });
  });
});
