import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogModelId } from '../server/model-names.mjs';

const catalog = {
  families: [
    { family: 'qwen', sizes: [{ id: 'iq2_xs', model: 'IQ2_XS' }] },
    {
      family: 'deepseek41',
      sizes: [{ id: 'deepseek-v4.1-flash-ist-das-2.00bpw', model: 'IST-DAS-2.00bpw' }],
    },
    { family: 'qwen36', sizes: [{ id: 'qwen36-ud-q4_k_xl', model: 'UD-Q4_K_XL' }] },
    { family: 'gyro', sizes: [{ id: 'gyro-gyro-s', model: 'Gyro-S' }] },
  ],
};

test('catalogModelId uses catalog id tags after install', () => {
  assert.equal(catalogModelId(catalog, 'qwen', 'IQ2_XS'), 'iq2_xs');
  assert.equal(catalogModelId(catalog, 'deepseek41', 'IST-DAS-2.00bpw'), 'deepseek-v4.1-flash-ist-das-2.00bpw');
  assert.equal(catalogModelId(catalog, 'qwen36', 'UD-Q4_K_XL'), 'qwen36-ud-q4_k_xl');
  assert.equal(catalogModelId(catalog, 'gyro', 'Gyro-S'), 'gyro-gyro-s');
});

test('catalogModelId falls back to setup tags when catalog is missing', () => {
  assert.equal(catalogModelId(null, 'deepseek41', 'IST-DAS-2.00bpw'), 'deepseek-v4.1-flash-ist-das-2.00bpw');
  assert.notEqual(catalogModelId(null, 'deepseek41', 'IST-DAS-2.00bpw'), 'deepseek41-ist-das-2.00bpw');
});
