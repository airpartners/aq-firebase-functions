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

describe('Graph node helper functions', () => {
  let functions;

  before(() => {
    functions = require('../graphNodeHelpers');
    if (!TEST_DB_ONLINE) {
      console.log('WARNING: Not testing online functions because the service account file path does not exist. This is likely due to testing on a new machine or a continuous integration environment without the proper service account file.');
    }
  });

  after(() => {
    test.cleanup();
  });

  if (TEST_DB_ONLINE) {
    describe('Online functions', () => {
      describe('getGraphFromDB', () => {
        const test_sn = 'SN00-TEST';
        const refString = `${test_sn}/graph`;
        const val = 1;

        before(() => {
          return admin.database().ref(refString).set(val);
        });

        after(() => {
          return admin.database().ref(refString).remove();
        });

        it('should get value at graph node', (done) => {
          functions.getGraphFromDB(test_sn).then((res) => {
            assert.equal(res, val);
            done();
            return null;
          }).catch(e => done(e));
        });
      });

      describe('writeGraphToDB', () => {
        const test_sn = 'SN-00TEST';

        after(() => {
          admin.database().ref(test_sn).remove();
        });

        it('should write graph to db', (done) => {
          const graph = [{ co: 1 }];

          functions.writeGraphToDB(test_sn, graph).then(async () => {
            const snap = await admin.database().ref(`${test_sn}/graph`).once('value');
            assert.deepEqual(snap.val(), graph);
            done();
            return null;
          }).catch(e => done(e));
        });
      });
    });
  }

  describe('Offline functions', () => {
    describe('buildNewGraph', () => {
      it('should add latest data point and remove old data points', () => {
        const currentGraph = [
          { timestamp: '2020-04-02T22:54:48' },
          { timestamp: '2020-03-02T22:54:48' }
        ];
        const latestDataPoint = { timestamp: '2020-04-02T23:09:48' };
        const expectedResult = [
          { timestamp: '2020-04-02T23:09:48' },
          { timestamp: '2020-04-02T22:54:48' }
        ];

        assert.deepEqual(functions.buildNewGraph(currentGraph, latestDataPoint), expectedResult);
      });

      it('should not add point that is less than 15 minutes newer', () => {
        const currentGraph = [
          { timestamp: '2020-04-02T22:34:48' },
          { timestamp: '2020-04-02T22:14:48' }
        ];
        const latestDataPoint = { timestamp: '2020-04-02T22:49:47' };
        const expectedResult = [
          { timestamp: '2020-04-02T22:34:48' },
          { timestamp: '2020-04-02T22:14:48' }
        ];

        assert.deepEqual(functions.buildNewGraph(currentGraph, latestDataPoint), expectedResult);
      });
    });

    describe('needsRawData', () => {
      it('should return true', () => {
        const dataPoint = { co: 2 };
        assert.isTrue(functions.needsRawData(dataPoint));
      });

      it('should return false', () => {
        const dataPoint = { bin0: 0 };
        assert.isFalse(functions.needsRawData(dataPoint));
      });
    });
  });
});
