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

describe('Latest node helper functions', () => {
  let functions;

  before(() => {
    functions = require('../latestNodeHelpers');
    if (!TEST_DB_ONLINE) {
      console.log('WARNING: Not testing online functions because the service account file path does not exist. This is likely due to testing on a new machine or a continuous integration environment without the proper service account file.');
    }
  });

  after(() => {
    test.cleanup();
  });

  if (TEST_DB_ONLINE) {
    describe('Online functions', () => {
      describe('writeLatestDataPointToDB', () => {
        const test_sn = 'SN-00TEST';

        after(() => {
          admin.database().ref(test_sn).remove();
        });

        it('should write latest data point to db', (done) => {
          const dataPoint = { co: 1 };

          functions.writeLatestDataPointToDB(test_sn, dataPoint).then(async () => {
            const snap = await admin.database().ref(`${test_sn}/latest`).once('value');
            assert.deepEqual(snap.val(), dataPoint);
            done();
            return null;
          }).catch(e => done(e));
        });
      });
    });
  }

  describe('Offline functions', () => {
    describe('newDataIsAvailable', () => {
      it('should return true', () => {
        const head = { timestamp: '2020-04-02T23:54:48' };
        const latest = { timestamp: '2020-04-02T23:55:48' };
        assert.isTrue(functions.newDataIsAvailable(head, latest));
      });

      it('should return false', () => {
        const head = { timestamp: '2020-04-02T23:54:48' };
        const latest = { timestamp: '2020-04-02T23:55:47' };
        assert.isFalse(functions.newDataIsAvailable(head, latest));
      });
    });

    describe('restructureData', () => {
      it('should add raw data, removed unused data, fix negative values, and trim geo data', () => {
        const timestamp = '2020-04-02T23:54:48';
        const final = { co: 2, co2: 5, no: -1, timestamp: timestamp, geo: { lat: 1.33333, lon: 5 } };
        const raw = { bin0: 1, timestamp: timestamp };
        const expectedResult = { co: 2, bin0: 1, no: 0, timestamp: timestamp, geo: { lat: 1.333, lon: 5 } };
        assert.deepEqual(functions.restructureData(final, raw), expectedResult);
      });

      it('should add raw data in lastRaw node', () => {
        const geo = { lat: 1.333, lon: 5 };
        const timestamp = '2020-04-02T23:54:48';
        const final = { timestamp: timestamp, geo: geo };
        const raw = { bin0: 1, timestamp: '2020-04-02T23:54:49', timestamp_local: '2020-04-02T23:54:49' };
        const expectedResult = { timestamp: timestamp, geo: geo, lastRaw: raw };
        assert.deepEqual(functions.restructureData(final, raw), expectedResult);
      });
    });
  });
});
