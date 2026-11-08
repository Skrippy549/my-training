/* Тренировки 2.0 · encrypted local model. No network calls or personal-data telemetry. */
export const V2_KEY='training-v2-secure-v1';
export const V1_KEY='training-week-secure-v1';
export const FORMAT='training-v2-encrypted-v1';
export const V1_FORMAT='training-week-encrypted-v1';
export const ITERATIONS=310000;
export const CATEGORIES=['Силовая','Разминка','Мобильность','Йога','Растяжка','Кардио','Теннис','Другое'];
export const METRICS=[['weight','Вес','кг'],['neck','Шея','см'],['shoulders','Плечи','см'],['chest','Грудь','см'],['biceps_l','Бицепс левый','см'],['biceps_r','Бицепс правый','см'],['forearm_l','Предплечье левое','см'],['forearm_r','Предплечье правое','см'],['waist','Талия','см'],['belly','Живот (пупок)','см'],['hips','Обхват таза','см'],['thigh_l','Бедро левое','см'],['thigh_r','Бедро правое','см'],['calf_l','Голень левая','см'],['calf_r','Голень правая','см'],['body_fat','Жир','%'],['muscle_mass','Мышечная масса','кг'],['visceral_fat','Висцеральный жир','индекс']];
export const uid=()=>globalThis.crypto?.randomUUID?.()||`id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
export const dateISO=(d=new Date())=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
export function parseDate(s){const [y,m,d]=String(s).split('-').map(Number);return new Date(y,m-1,d,12)}
export function addDays(date,n){const d=parseDate(date);d.setDate(d.getDate()+n);return dateISO(d)}
export function weekStart(date){const d=parseDate(date);d.setDate(d.getDate()-(d.getDay()+6)%7);return dateISO(d)}
export function daysApart(a,b){return Math.round((parseDate(b)-parseDate(a))/864e5)}
export function dayOfWeek(s){return (parseDate(s).getDay()+6)%7}
export const prettyDate=(d,opts={day:'numeric',month:'long'})=>parseDate(d).toLocaleDateString('ru-RU',opts);
const validDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&dateISO(parseDate(s))===s;
const b64=x=>{let s='';for(let i=0;i<x.length;i+=8192)s+=String.fromCharCode(...x.slice(i,i+8192));return btoa(s)};
const deb64=x=>Uint8Array.from(atob(x),c=>c.charCodeAt(0));
export function blankDB(){return {schema:2,createdAt:new Date().toISOString(),programs:[],exercises:[],categories:[...CATEGORIES],muscles:['Грудь','Спина','Ноги','Плечи','Руки','Кор'],equipment:['Без оборудования','Тренажёр','Гантели','Штанга','Резинки'],locations:['Зал','Дома','Улица','Корт'],painZones:[{id:'knee_l',name:'Левое колено',body:'Колено',side:'Левая',active:true},{id:'feet',name:'Стопы',body:'Стопа',side:'Обе',active:true},{id:'back',name:'Спина',body:'Спина',side:'Без стороны',active:true}],overrides:{},sessions:{},measurements:[],goals:[],settings:{backupReminder:true,lastExportAt:null,profile:{}},legacy:null};}
export function validateDB(d){if(!d||d.schema!==2||!Array.isArray(d.programs)||!Array.isArray(d.exercises)||!d.sessions||typeof d.sessions!=='object'||Array.isArray(d.sessions)||!Array.isArray(d.measurements)||!Array.isArray(d.goals)||!Array.isArray(d.painZones)||!d.settings||!d.overrides||typeof d.overrides!=='object')throw Error('Неподдерживаемая или повреждённая база');return d;}
export function makeProgram(name,mode='repeat',weeks=1,startDate=dateISO()){
 const mon=weekStart(startDate);return {id:uid(),name,mode,startDate:mon,status:'active',segments:[{startDate:mon,weekIndex:0,until:null,skipThroughDay:-1}],weeks:Array.from({length:mode==='finite'?weeks:1},()=>Array.from({length:7},()=>[])),archiveState:null,createdAt:new Date().toISOString()};}
export function template(name,type='strength',exercises=[]){return {id:uid(),name,type,exercises:structuredClone(exercises),duration:null,notes:''};}
export function workoutsForDate(db,date){const found=[];
 for(const p of db.programs){for(const seg of (p.segments||[])){
   if(date<seg.startDate||(seg.until&&date>=seg.until))continue;
   const w=seg.weekIndex+Math.floor(daysApart(weekStart(seg.startDate),weekStart(date))/7);
   if(p.mode==='finite'&&w>=p.weeks.length)continue;
   if(p.mode==='finite'&&w<0)continue;
   const row=p.weeks[p.mode==='repeat'?w%p.weeks.length:p.mode==='progressive'?Math.min(w,p.weeks.length-1):w]?.[dayOfWeek(date)]||[];
   for(const t of row){if(weekStart(date)===weekStart(seg.startDate)&&dayOfWeek(date)<=(seg.skipThroughDay??-1))continue;
     const id=`p:${p.id}:${date}:${t.id}`,over=db.overrides[id];if(over===null)continue;
     const snapshot=over||t;found.push({id,date,programId:p.id,programName:p.name,source:'program',...structuredClone(snapshot)});
   }
 }}
 for(const [id,w] of Object.entries(db.overrides||{})){if(!id.startsWith('one:')||!w||w.date!==date)continue;found.push({id,...structuredClone(w),source:'oneoff',programId:null,programName:null});}
 for(const [id,s] of Object.entries(db.sessions||{})){if(s.date!==date||found.some(w=>w.id===id))continue;found.push({id,date,name:s.name||'Запись тренировки',type:s.type||'strength',exercises:s.exercisePlans||[],programId:s.programId||null,programName:s.programName||null,source:s.source||'legacy'});}
 return found.sort((a,b)=>String(a.name).localeCompare(String(b.name),'ru'));
}
export function statusFor(db,w,date=dateISO()){const s=db.sessions[w.id];return s?.status||((w.date||date)<date?'missed':'planned');}
export function countPeriod(db,start,end,today=dateISO(),programId=null){let completed=0,denom=0,partial=0,missed=0,inProgress=0,oneOff=0,allCompleted=0,duration=0;
 for(let d=start;d<=end;d=addDays(d,1)){for(const w of workoutsForDate(db,d)){
   if(programId&&w.programId!==programId)continue;
   const status=statusFor(db,w,today),ses=db.sessions[w.id];
   if(status==='completed'){allCompleted++;duration+=Number(ses?.duration||0);}
   if(w.source==='oneoff'){if(status==='completed')oneOff++;continue;}if(w.source==='legacy')continue;
   const elapsed=d<today||(d===today&&(['completed','partial'].includes(status)));
   if(!elapsed)continue;
   denom++;if(status==='completed')completed++;if(status==='partial')partial++;if(status==='missed')missed++;if(status==='in_progress')inProgress++;
 }}return{completed,denom,percent:denom?Math.round(completed/denom*100):null,partial,missed,inProgress,oneOff,allCompleted,duration};}
export function addOneOff(db,date,name,type='strength'){const w={id:`one:${uid()}`,date,name,type,exercises:[],duration:null,notes:''};db.overrides[w.id]=w;return w;}
export function sessionFor(db,w){let s=db.sessions[w.id];if(s)return s;return {id:w.id,date:w.date,programId:w.programId||null,programName:w.programName||null,source:w.source||'oneoff',name:w.name,type:w.type,exercisePlans:structuredClone(w.exercises||[]),sets:{},wellness:{before:null,after:null,legacy:null},painZoneSnapshot:db.painZones.filter(z=>z.active).map(z=>({id:z.id,name:z.name})),status:'planned',notes:'',duration:null,distance:null,startedAt:null,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};}
export function createSetResults(plan){const out={};for(const ex of plan){const count=Number(ex.sets)||1;out[ex.id]=Array.from({length:count},()=>({done:false,weight:ex.weight??null,reps:ex.reps??null}));}return out;}
export function markStarted(db,w,before,retrospective=false){const s=sessionFor(db,w);if(!retrospective&&!validAssessment(before,s.painZoneSnapshot,'before'))throw Error('Заполни все значения самочувствия до тренировки');if(!s.startedAt)s.startedAt=new Date().toISOString();s.status='in_progress';s.wellness.before=before??null;if(!Object.keys(s.sets).length)s.sets=createSetResults(s.exercisePlans);s.updatedAt=new Date().toISOString();db.sessions[w.id]=s;return s;}
export function validAssessment(a,zones,phase){if(!a)return false;const keys=phase==='before'?['energy']:['fatigue','exertion'];return keys.every(k=>Number.isInteger(a[k])&&a[k]>=0&&a[k]<=10)&&zones.every(z=>Number.isInteger(a.pain?.[z.id])&&a.pain[z.id]>=0&&a.pain[z.id]<=10);}
export function finishSession(db,w,status,after,retrospective=false){const s=sessionFor(db,w);if(!retrospective&&!validAssessment(after,s.painZoneSnapshot,'after'))throw Error('Заполни все значения самочувствия после тренировки');if(!['completed','partial'].includes(status))throw Error('Недопустимый статус');s.wellness.after=after??null;s.status=status;s.completedAt=new Date().toISOString();s.updatedAt=s.completedAt;db.sessions[w.id]=s;return s;}
export function archiveProgram(p,date=dateISO()){if(p.status==='archived')return;const seg=p.segments.at(-1);if(seg)seg.until=date;const ix=seg?seg.weekIndex+Math.max(0,Math.floor(daysApart(weekStart(seg.startDate),weekStart(date))/7)):0;p.archiveState={weekIndex:ix,skipThroughDay:dayOfWeek(date)-1};p.status='archived';}
export function restoreProgram(p,date=dateISO()){if(p.status!=='archived')return;p.status='active';p.segments.push({startDate:date,weekIndex:p.archiveState?.weekIndex||0,until:null,skipThroughDay:p.archiveState?.skipThroughDay??-1});p.archiveState=null;}
export function lastMeasurement(db,metric='weight',onOrBefore=null){return db.measurements.filter(x=>x.metric===metric&&(!onOrBefore||x.measuredAt.slice(0,10)<=onOrBefore)).sort((a,b)=>b.measuredAt.localeCompare(a.measuredAt))[0]||null;}
export function goalProgress(baseline,target,current){if([baseline,target,current].some(x=>!Number.isFinite(Number(x)))||baseline===target)return null;return Math.min(100,Math.max(0,Math.round((baseline-current)/(baseline-target)*100)));}
function derive(password,salt,iterations=ITERATIONS){return crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveKey']).then(k=>crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations,hash:'SHA-256'},k,{name:'AES-GCM',length:256},false,['encrypt','decrypt']));}
export async function unlockEnvelope(env,password,expected){if(!env||env.format!==expected||!Number.isSafeInteger(env.iterations)||env.iterations<100000||env.iterations>2000000||typeof env.ciphertext!=='string')throw Error('Неизвестный формат файла');const salt=deb64(env.salt);if(salt.length<16||salt.length>64)throw Error('Повреждённая соль');const iv=deb64(env.iv);if(iv.length!==12)throw Error('Повреждённый IV');const key=await derive(password,salt,env.iterations);let bytes;try{bytes=await crypto.subtle.decrypt({name:'AES-GCM',iv},key,deb64(env.ciphertext));}catch{throw Error('Неверный пароль или повреждённые данные');}let data;try{data=JSON.parse(new TextDecoder().decode(bytes));}catch{throw Error('Повреждённый JSON');}return {data,key,salt};}
export async function seal(data,key,salt){const iv=crypto.getRandomValues(new Uint8Array(12));const bytes=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(JSON.stringify(data)));return {format:FORMAT,version:1,iterations:ITERATIONS,salt:b64(salt),iv:b64(iv),ciphertext:b64(new Uint8Array(bytes))};}
export class EncryptedStore{
 constructor(storage=localStorage){this.storage=storage;this.key=null;this.salt=null;this.data=null;this.queue=Promise.resolve();}
 hasV2(){return !!this.storage.getItem(V2_KEY)}
 hasV1(){return !!this.storage.getItem(V1_KEY)}
 async open(password){const env=JSON.parse(this.storage.getItem(V2_KEY)||'null');const r=await unlockEnvelope(env,password,FORMAT);validateDB(r.data);this.data=r.data;this.key=r.key;this.salt=r.salt;return this.data;}
 async create(password,data=blankDB()){if(password.length<12)throw Error('Пароль должен содержать не менее 12 символов');if(this.hasV2())throw Error('Хранилище уже существует');validateDB(data);const salt=crypto.getRandomValues(new Uint8Array(16)),key=await derive(password,salt);const env=await seal(data,key,salt);this.storage.setItem(V2_KEY,JSON.stringify(env));const check=await unlockEnvelope(JSON.parse(this.storage.getItem(V2_KEY)),password,FORMAT);validateDB(check.data);this.data=data;this.key=key;this.salt=salt;return data;}
 async persist(){if(!this.data||!this.key)throw Error('База заблокирована');const snapshot=structuredClone(this.data),key=this.key,salt=this.salt;this.queue=this.queue.catch(()=>{}).then(async()=>{const env=await seal(snapshot,key,salt);const raw=JSON.stringify(env);this.storage.setItem(V2_KEY,raw);if(this.storage.getItem(V2_KEY)!==raw)throw Error('Не удалось проверить сохранение');});return this.queue;}
 async change(mutator){if(!this.data)throw Error('База заблокирована');const before=structuredClone(this.data);try{await mutator(this.data);validateDB(this.data);await this.persist();return this.data;}catch(e){this.data=before;throw e;}}
 async lock(){await this.queue;this.data=null;this.key=null;this.salt=null;}
 encryptedExport(){const raw=this.storage.getItem(V2_KEY);if(!raw)throw Error('Нет данных для экспорта');return raw;}
 async changePassword(oldPw,newPw){if(newPw.length<12)throw Error('Новый пароль — не менее 12 символов');await this.queue;const current=JSON.parse(this.storage.getItem(V2_KEY)||'null');await unlockEnvelope(current,oldPw,FORMAT);const salt=crypto.getRandomValues(new Uint8Array(16)),key=await derive(newPw,salt);const env=await seal(this.data,key,salt);validateDB((await unlockEnvelope(env,newPw,FORMAT)).data);this.storage.setItem(V2_KEY,JSON.stringify(env));this.key=key;this.salt=salt;}
 async validateBackup(raw,password){const env=JSON.parse(raw),r=await unlockEnvelope(env,password,FORMAT);validateDB(r.data);return{env,data:r.data};}
 async restoreBackup(raw,password){await this.queue;const {env,data}=await this.validateBackup(raw,password);this.storage.setItem(V2_KEY,JSON.stringify(env));const r=await unlockEnvelope(env,password,FORMAT);validateDB(r.data);this.data=data;this.key=r.key;this.salt=r.salt;return data;}
}
export function migrateV1(old,templates){if(!old||typeof old!=='object'||!old.checks||!old.logs||!old.weights||!Array.isArray(templates?.phases))throw Error('Неподдерживаемая база v1');
 const db=blankDB();const prog=makeProgram('История программы 1.0','finite',1,old.startDate||dateISO());prog.status='archived';prog.weeks=[Array.from({length:7},()=>[])];prog.segments=[];db.programs.push(prog);
 const dateKeys=[...new Set([...Object.keys(old.checks||{}),...Object.keys(old.logs||{}),...Object.keys(old.weights||{})])].filter(validDate).sort();let marks=0,weights=0,notes=0,ratings=0,unmatched=0;
 for(const date of dateKeys){const phase=Math.max(0,Math.min(3,Math.floor(daysApart(weekStart(prog.startDate),weekStart(date))/7)));const parts=templates.phases[phase][dayOfWeek(date)];const exp=parts.flatMap(section=>section.items.map(ex=>({id:`${section.id}/${ex.id}`,name:ex.name,how:ex.how||'',sets:ex.sets||1,reps:ex.unit||ex.reps,weight:null,category:section.kind,legacy:true,legacyHasSets:ex.sets>0})));
  const id=`legacy:${date}`;const s={id,date,programId:prog.id,programName:prog.name,name:'Тренировка из версии 1.0',source:'legacy',type:'mixed',exercisePlans:exp,sets:{},wellness:{before:null,after:null,legacy:null},painZoneSnapshot:[],status:'partial',notes:old.logs[date]?.note||'',duration:null,distance:null,startedAt:null,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),legacyMeta:{checks:old.checks[date]||{},weights:old.weights[date]||{},originalLog:old.logs[date]||{}}};
  let checkedCount=0,expectedCount=0;
  for(const ex of exp){const [secid,exid]=ex.id.split('/');const arr=Array.from({length:ex.sets},(_,i)=>{const key=ex.legacyHasSets?`${secid}/${exid}/${i+1}`:`${secid}/${exid}`;const done=Boolean(old.checks[date]?.[key]);if(done){marks++;checkedCount++}expectedCount++;return{done,weight:null,reps:null,legacy:true};});s.sets[ex.id]=arr;}
  for(const [k,v] of Object.entries(old.checks[date]||{})){if(v&&!(exp.some(ex=>k===ex.id||(ex.sets>1&&k.startsWith(ex.id+'/')))))unmatched++;}
  const w=old.weights[date]||{};weights+=Object.values(w).filter(v=>v!==null&&v!=='').length;
  if(s.notes)notes++;
  const log=old.logs[date]||{},pain={};for(const [oldKey,z] of [['knee','knee_l'],['foot','feet'],['back','back']]){if(log[oldKey]!==undefined&&log[oldKey]!==null&&log[oldKey]!==''){pain[z]=Number(log[oldKey]);ratings++;}}
  if(Object.keys(pain).length)s.wellness.legacy={pain,notes:s.notes,at:date};
  if(checkedCount)s.status=checkedCount===expectedCount?'completed':'partial';else s.status='legacy';
  db.sessions[id]=s;
 }
 // Restore the current v1 plan as an editable progressive program starting next Monday.
 // Older dates remain ONLY in the imported immutable history; no invented missed workouts.
 const today=dateISO(),nextMon=addDays(weekStart(today),7);
 const validOriginalStart=validDate(old.startDate)?old.startDate:nextMon;
 const activeStart=validOriginalStart>nextMon?validOriginalStart:nextMon;
 const initialPhase=Math.min(3,Math.max(0,Math.floor(daysApart(weekStart(validOriginalStart),weekStart(activeStart))/7)));
 const current=makeProgram('План из версии 1.0','repeat',1,activeStart);
 current.mode='progressive';
 current.segments[0].weekIndex=initialPhase;
 const weekdays=['Восстановительная йога','Силовая А','Теннис','Силовая Б','Кардио и мобильность','Силовая В / мобильность','Теннис'];
 const kinds=['yoga','strength','tennis','strength','cardio','strength','tennis'];
 const indexByName=new Map();
 current.weeks=templates.phases.map(days=>days.map((parts,di)=>{
   const exercisePlans=parts.flatMap(part=>part.items.map(ex=>{
     const key=ex.name.toLocaleLowerCase('ru-RU');
     if(!indexByName.has(key)){const id=uid();indexByName.set(key,id);db.exercises.push({id,name:ex.name,category:part.kind==='strength'?'Силовая':part.kind==='daily'?'Разминка':'Мобильность',how:ex.how||'',active:true,muscles:[],equipment:'',location:''});}
     return{id:uid(),exerciseId:indexByName.get(key),name:ex.name,sets:ex.sets||1,reps:ex.unit||ex.reps,weight:null,how:ex.how||''};
   }));
   return[template(weekdays[di],kinds[di],exercisePlans)];
 }));
 db.programs.push(current);
 db.legacy={importedAt:new Date().toISOString(),source:'training-week-encrypted-v1',startDate:old.startDate,counts:{dates:dateKeys.length,marks,weights,notes,ratings,unmatched},originalStructure:structuredClone(old)};
 return db;
}
