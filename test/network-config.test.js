import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DEFAULT_CUSTOM_MAGIC,
  DEFAULT_CUSTOM_NETWORK_ID,
  getCustomNetworkParams,
  normalizeProviderUrl,
} from '../scripts/network-config.js';

test('getCustomNetworkParams: defaults when params are absent', () => {
  const params = getCustomNetworkParams('');
  assert.equal(params.provider, '');
  assert.equal(params.magic, DEFAULT_CUSTOM_MAGIC);
  assert.equal(params.networkId, DEFAULT_CUSTOM_NETWORK_ID);
});

test('getCustomNetworkParams: parses a local devnet query', () => {
  const params = getCustomNetworkParams(
    '?network=custom&provider=http://localhost:8080/api/v1/&magic=42&networkId=0',
  );
  assert.equal(params.provider, 'http://localhost:8080/api/v1/');
  assert.equal(params.magic, 42);
  assert.equal(params.networkId, 0);
});

test('getCustomNetworkParams: honours a mainnet-style override', () => {
  const params = getCustomNetworkParams('?magic=764824073&networkId=1');
  assert.equal(params.magic, 764_824_073);
  assert.equal(params.networkId, 1);
});

test('getCustomNetworkParams: missing provider stays empty string', () => {
  const params = getCustomNetworkParams('?magic=42');
  assert.equal(params.provider, '');
  assert.equal(params.magic, 42);
});

test('normalizeProviderUrl: appends a single trailing slash', () => {
  assert.equal(
    normalizeProviderUrl('http://localhost:8080/api/v1'),
    'http://localhost:8080/api/v1/',
  );
});

test('normalizeProviderUrl: leaves an existing trailing slash intact', () => {
  assert.equal(
    normalizeProviderUrl('http://localhost:8080/api/v1/'),
    'http://localhost:8080/api/v1/',
  );
});
