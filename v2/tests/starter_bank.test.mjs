import assert from 'node:assert/strict';
import {blankDB, starterExerciseLibrary, ensureStarterExercises, addOneOff, createSetResults} from '../js/core.mjs';

const d=blankDB();
const lib=starterExerciseLibrary();
assert.equal(lib.length,35);
assert.equal(d.exercises.length,lib.length);
assert.equal(new Set(lib.map(x=>x.id)).size,lib.length);
assert.deepEqual(new Set(lib.map(x=>x.category)),new Set(['Силовая','Разминка','Мобильность','Йога','Растяжка','Кардио','Теннис']));
assert.ok(lib.every(x=>x.id&&x.name&&x.category&&x.source==='builtin'));
assert.equal(ensureStarterExercises(d),false);
d.exercises[0].active=false;
assert.equal(ensureStarterExercises(d),false);
assert.equal(d.exercises[0].active,false);

// Upgrading an already-used encrypted v2 database adds only missing examples, once.
const old=blankDB();old.exercises=[{id:'custom:x',name:'Жим ногами',category:'Силовая',source:'custom',active:true}];delete old.settings.starterLibraryVersion;
assert.equal(ensureStarterExercises(old),true);
assert.equal(old.exercises.filter(x=>x.category==='Силовая'&&x.name==='Жим ногами').length,1);
const n=old.exercises.length;
assert.equal(ensureStarterExercises(old),false);
assert.equal(old.exercises.length,n);
assert.ok(old.equipment.includes('Ракетка и мяч'));

const workout=addOneOff(d,'2026-11-09','Разовая', 'strength', [{id:'p1',exerciseId:'starter:leg-press',name:'Жим ногами',sets:2,reps:10,weight:50}]);
assert.equal(d.overrides[workout.id].exercises.length,1);
assert.equal(createSetResults(workout.exercises).p1.length,2);
assert.equal(createSetResults(workout.exercises).p1[0].done,false);
console.log('PASS: starter exercise library, upgrade, no duplicates, archived stays archived, one-off plan');