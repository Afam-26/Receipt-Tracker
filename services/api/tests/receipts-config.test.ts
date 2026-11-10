import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readRailwayBucketSettings } from '../src/receipts/storage.js';
const base = {
  STORAGE_PROVIDER:'railway',
  STORAGE_BUCKET:'tracker-bucket-f8a9',
  STORAGE_ENDPOINT:'https://t3.storageapi.dev',
  STORAGE_REGION:'auto',
  STORAGE_ACCESS_KEY_ID:'example-key',
  STORAGE_SECRET_ACCESS_KEY:'example-secret',
};
test('unconfigured bucket optional; partial configuration fails closed',()=>{
  assert.equal(readRailwayBucketSettings({}),null);
  assert.throws(()=>readRailwayBucketSettings({STORAGE_PROVIDER:'railway'}),/required/);
  assert.throws(()=>readRailwayBucketSettings({STORAGE_ENDPOINT:base.STORAGE_ENDPOINT}),/incomplete/);
});
test('Railway bucket credentials are accepted with selectable URL style',()=>{
  assert.equal(readRailwayBucketSettings(base)?.urlStyle,'virtual');
  assert.equal(readRailwayBucketSettings({...base, STORAGE_URL_STYLE:'path'})?.urlStyle,'path');
  assert.equal(readRailwayBucketSettings({...base, STORAGE_REGION:'auto'})?.region,'auto');
});
test('supports Railway CLI AWS_* variable names',()=>{
  const config=readRailwayBucketSettings({AWS_S3_BUCKET_NAME:base.STORAGE_BUCKET,AWS_ENDPOINT_URL:base.STORAGE_ENDPOINT,AWS_DEFAULT_REGION:'auto',AWS_ACCESS_KEY_ID:'key',AWS_SECRET_ACCESS_KEY:'secret',AWS_S3_URL_STYLE:'path'});
  assert.equal(config?.urlStyle,'path');
  assert.equal(config?.bucket,base.STORAGE_BUCKET);
});
test('rejects unsafe or unsupported endpoints and styles',()=>{
  assert.throws(()=>readRailwayBucketSettings({...base,STORAGE_ENDPOINT:'http://t3.storageapi.dev'}),/HTTPS/);
  assert.throws(()=>readRailwayBucketSettings({...base,STORAGE_ENDPOINT:'https://attacker.example'}),/HTTPS/);
  assert.throws(()=>readRailwayBucketSettings({...base,STORAGE_URL_STYLE:'wrong'}),/virtual or path/);
});
