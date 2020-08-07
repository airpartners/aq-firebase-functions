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

describe('Utils', () => {
  let utils;

  before(() => {
    utils = require('../utils');
    if (!TEST_DB_ONLINE) {
      console.log('WARNING: Not testing online functions because the service account file path does not exist. This is likely due to testing on a new machine or a continuous integration environment without the proper service account file.');
    }
  });

  after(() => {
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

      describe('writeToDB', () => {
        const test_sn = 'SN00-TEST';

        after(() => {
          return admin.database().ref(test_sn).remove();
        });

        it('should write to db', (done) => {
          const sn = test_sn;
          const child = 'child';
          const val = 1;

          utils.writeToDB(sn, child, val).then(async () => {
            const snap = await admin.database().ref(`${sn}/${child}`).once('value');
            assert.deepEqual(snap.val(), val);
            done();
            return null;
          }).catch(e => done(e));
        });
      });

      describe('getValueFromDatabaseByRef', () => {
        const refString = 'test';
        const val = 1;

        before(() => {
          return admin.database().ref(refString).set(val);
        });

        after(() => {
          return admin.database().ref(refString).remove();
        });

        it('should get value at the specified ref from the test db', (done) => {
          utils.getValueFromDatabaseByRef(refString).then((res) => {
            assert.equal(res, val);
            done();
            return null;
          }).catch(e => done(e));
        });
      });

      describe('getLatestDataPointFromDB', () => {
        const test_sn = 'SN00-TEST';
        const refString = `${test_sn}/latest`;
        const val = 1;

        before(() => {
          return admin.database().ref(refString).set(val);
        });

        after(() => {
          return admin.database().ref(refString).remove();
        });

        it('should get value at latest node', (done) => {
          utils.getLatestDataPointFromDB(test_sn).then((res) => {
            assert.equal(res, val);
            done();
            return null;
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
          test: 1,
          test4: {
            four: 4,
            five: 5
          }
        }

        assert.deepEqual(utils.removeUnusedData(dataPoint, keysToKeep), expectedResult);
      });
    });

    describe('getEndpoint', () => {
      const test_sn = 'SN00-TEST';

      it('should return default final data endpoint', () => {
        const expectedResult = `https://quant-aq.com/device-api/v1/devices/${test_sn}/data/?page=1&per_page=1&limit=1`;

        assert.equal(utils.getEndpoint(test_sn), expectedResult);
      });

      it('should return specified raw data endpoint', () => {
        const page = 3;
        const perPage = 4;
        const limit = 5;
        const expectedResult = `https://quant-aq.com/device-api/v1/devices/${test_sn}/data/raw/?page=${page}&per_page=${perPage}&limit=${limit}`;

        assert.equal(utils.getEndpoint(test_sn, true, page, perPage, limit), expectedResult);
      })
    });

    describe('enoughTimePassed', () => {
      it('should return true', () => {
        const dateStringHead = '2020-04-02T23:54:48';
        const dateStringLatest = '2020-04-03T00:09:48';

        assert.isTrue(utils.enoughTimePassed(dateStringHead, dateStringLatest, 15));
      });

      it('should return false', () => {
        const dateStringHead = '2020-04-02T23:54:48';
        const dateStringLatest = '2020-04-02T24:08:48';

        assert.isFalse(utils.enoughTimePassed(dateStringHead, dateStringLatest, 15));
      });
    });

    describe('addRawDataToFinalDataPoint', () => {
      it('should add bin0', () => {
        const timestamp = '2020-04-02T23:54:48';
        const finalDataPoint = { co: 7, no: 2, timestamp: timestamp };
        const rawDataPoint = { bin0: 12, bin1: 3, timestamp: timestamp };
        const expectedResult = { co: 7, no: 2, bin0: 12, timestamp: timestamp };

        assert.deepEqual(utils.addRawDataToFinalDataPoint(finalDataPoint, rawDataPoint), expectedResult);
      });

      it('should add lastRaw node', () => {
        const timestamp = '2020-04-02T23:54:48';
        const finalDataPoint = { co: 7, no: 2, timestamp: timestamp };
        const rawDataPoint = { bin0: 12, timestamp: '2020-04-02T23:54:47' };
        const expectedResult = {
          co: 7, no: 2, timestamp: timestamp, lastRaw: { ...rawDataPoint, timestamp_local: null }
        };

        assert.deepEqual(utils.addRawDataToFinalDataPoint(finalDataPoint, rawDataPoint), expectedResult);
      });
    });
  });
});
