import test from 'node:test';
import assert from 'node:assert/strict';
import { todayISO, canRecordWeight, activityDetails } from '../lib/formatters.js';

test('todayISO formats to yyyy-mm-dd', () => {
  const sampleDate = new Date(Date.UTC(2024, 4, 9, 12, 0, 0));
  assert.equal(todayISO(sampleDate), '2024-05-09');
});

test('canRecordWeight allows only autumn months', () => {
  assert.equal(canRecordWeight('2024-09-01'), true);
  assert.equal(canRecordWeight('2024-10-15'), true);
  assert.equal(canRecordWeight('2024-07-01'), false);
});

test('activityDetails for control', () => {
  const details = activityDetails('control', {
    queenPresent: true,
    frameCount: 10,
    broodFrameCount: 7,
    weightKg: 32
  });
  assert.equal(details.typeLabel, 'Kontrolle');
  assert.equal(details.details[0][1], 'Ja');
});

test('activityDetails for follow-up', () => {
  const details = activityDetails('treatment-followup', {
    nextControlDate: '2024-09-20',
    nextTreatmentDate: '2024-10-05',
    miteInfestationLevel: 'niedrig'
  });
  assert.equal(details.typeLabel, 'Nachkontrolle');
  assert.equal(details.details[2][1], 'niedrig');
});
