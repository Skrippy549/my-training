import assert from 'node:assert/strict';
import {EncryptedStore,blankDB,V2_KEY} from '../js/core.mjs';
class QuotaStore{
  map=new Map(); fail=false;
  getItem(k){return this.map.get(k)??null}
  setItem(k,v){if(this.fail)throw Error('quota exceeded');this.map.set(k,v)}
}
const raw=new QuotaStore(),store=new EncryptedStore(raw),password='test-strong-password-123';
await store.create(password,blankDB());
const original=raw.getItem(V2_KEY);
raw.fail=true;
await assert.rejects(store.change(d=>{d.settings.backupReminder=false}),/quota exceeded/);
assert.equal(store.data.settings.backupReminder,true,'memory rollback after disk write failure');
assert.equal(raw.getItem(V2_KEY),original,'existing encrypted data remains');
raw.fail=false;
await Promise.all([store.change(d=>{d.settings.profile.height=172}),store.change(d=>{d.settings.profile.birth='1990-02-03'})]);
assert.equal(store.data.settings.profile.height,172);
assert.equal(store.data.settings.profile.birth,'1990-02-03');
await store.lock();await store.open(password);
assert.equal(store.data.settings.profile.height,172);
assert.equal(store.data.settings.profile.birth,'1990-02-03');
const invalid='not-json';await assert.rejects(store.restoreBackup(invalid,password));
assert.ok(store.data,'invalid backup cannot wipe local state');
console.log('PASS: quota-write rollback, serialized writes, persist/reload, failed import safety');