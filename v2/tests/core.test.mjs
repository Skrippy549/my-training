import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {blankDB,EncryptedStore,migrateV1,makeProgram,template,workoutsForDate,dateISO,addDays,weekStart,markStarted,finishSession,countPeriod,archiveProgram,restoreProgram,lastMeasurement,V2_KEY} from '../js/core.mjs';
class Storage{map=new Map();getItem(k){return this.map.get(k)??null;}setItem(k,v){this.map.set(k,v)}removeItem(k){this.map.delete(k)}}
const pass='test-password-very-long', storage=new Storage(),store=new EncryptedStore(storage);
let d=blankDB();const monday=weekStart('2026-11-08'),p1=makeProgram('Силовые','repeat',1,monday),p2=makeProgram('Теннис','repeat',1,monday);
p1.weeks[0][1].push(template('Силовая А','strength',[{id:'ex01',name:'Жим ногами',sets:3,reps:12,weight:60}]));p2.weeks[0][1].push(template('Теннис','tennis',[]));d.programs.push(p1,p2);
const date=addDays(monday,1);assert.equal(workoutsForDate(d,date).length,2,'separate programs on same date');
await store.create(pass,d);assert.equal(storage.map.has(V2_KEY),true);await store.lock();await store.open(pass);assert.equal(store.data.programs.length,2);
const w=workoutsForDate(store.data,date)[0];let fail=false;try{markStarted(store.data,w,null,false)}catch{fail=true}assert.ok(fail,'before assessment required');
const before={energy:0,pain:{knee_l:0,feet:0,back:0}};const sess=markStarted(store.data,w,before,false);assert.equal(sess.sets.ex01.filter(x=>x.done).length,0,'prefilled sets must not be completed');
sess.sets.ex01[0].done=true;sess.sets.ex01[1].reps=13;assert.equal(sess.sets.ex01.filter(x=>x.done).length,1);await store.persist();await store.lock();await store.open(pass);assert.equal(store.data.sessions[w.id].sets.ex01[0].done,true);
fail=false;try{finishSession(store.data,w,'partial',null,false)}catch{fail=true}assert.ok(fail,'after assessment required');finishSession(store.data,w,'partial',{fatigue:0,exertion:0,pain:{knee_l:0,feet:0,back:0}},false);const stat=countPeriod(store.data,date,date,addDays(date,1));assert.equal(stat.completed,0);assert.equal(stat.partial,1);
store.data.measurements.push({id:'m1',metric:'weight',measuredAt:'2026-11-08T07:00',value:100},{id:'m2',metric:'weight',measuredAt:'2026-11-08T20:00',value:101});assert.equal(lastMeasurement(store.data,'weight').value,101);
archiveProgram(store.data.programs[0],date);assert.equal(workoutsForDate(store.data,addDays(date,7)).filter(x=>x.programName==='Силовые').length,0);restoreProgram(store.data.programs[0],addDays(date,14));assert.equal(store.data.programs[0].status,'active');
await store.persist();const backup=store.encryptedExport();fail=false;try{await store.validateBackup(backup,'wrongwrongwrong')}catch{fail=true}assert.ok(fail);assert.equal(store.data.programs.length,2);
const templates=JSON.parse(readFileSync(new URL('../legacy-plan.json',import.meta.url),'utf-8'));
const old={startDate:'2026-11-09',checks:{'2026-11-10':{'morning/march':true}},logs:{'2026-11-10':{knee:3,note:'Болит колено'}},weights:{'2026-11-10':{'strengthA/legpress':'60'}}};
const converted=migrateV1(old,templates);assert.equal(converted.legacy.counts.dates,1);assert.equal(converted.legacy.counts.marks,1);assert.equal(converted.legacy.counts.notes,1);assert.equal(converted.sessions['legacy:2026-11-10'].wellness.before,null);assert.equal(converted.sessions['legacy:2026-11-10'].wellness.legacy.pain.knee_l,3);assert.equal(converted.legacy.originalStructure.checks['2026-11-10']['morning/march'],true);assert.equal(converted.sessions['legacy:2026-11-10'].sets['morning/march'][0].reps,null);console.log('PASS: encrypted storage, schedules, assessments, set flags, backup, archive, v1 migration, measurements');
