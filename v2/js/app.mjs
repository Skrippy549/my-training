import {V1_KEY,V1_FORMAT,EncryptedStore,blankDB,unlockEnvelope,migrateV1,makeProgram,template,workoutsForDate,statusFor,countPeriod,dateISO,weekStart,addDays,daysApart,dayOfWeek,prettyDate,uid,sessionFor,markStarted,finishSession,archiveProgram,restoreProgram,lastMeasurement,goalProgress,addOneOff,ensureStarterExercises,createSetResults,METRICS,exerciseProgressSeries,wellnessSeries,measurementsOnDate,comparablePeriods,applyProgramDayEdit,dateForProgramDay,activeWeeksForDate} from './core.mjs';
const $=s=>document.querySelector(s), dbStore=new EncryptedStore();
const TABS=['today','calendar','programs','progress','profile'];
const LABELS={today:'Сегодня',calendar:'Календарь',programs:'Программы',progress:'Прогресс',profile:'Профиль'};
const STATUS={planned:'Запланировано',in_progress:'В процессе',completed:'Выполнено',partial:'Частично',missed:'Пропущено',legacy:'История 1.0'};
const TYPE={strength:'Силовая',tennis:'Теннис',cardio:'Кардио',yoga:'Йога',mobility:'Мобильность',stretch:'Растяжка',warmup:'Разминка',mixed:'Смешанная'};
const DAYS=['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dateToday=()=>dateISO();
const s={tab:'today',date:dateToday(),month:dateToday().slice(0,7),calMode:'month',programTab:'active',progressTab:'overview',programId:null,week:0,weekday:0,sessionId:null,correctingSession:false,sessionReturnTab:'today',expanded:new Set(),search:'',bankQuery:'',bankCat:'',bankMuscle:'',bankEquipment:'',bankLocation:'',bankLevel:'',bankSource:'',bankOnlyFav:false,bankShowArchived:false,reportMode:'week',reportDate:dateToday(),reportProgram:'',reportType:'',wellnessZone:'knee_l',exerciseMetric:'weight',exerciseModalId:null,editorDraft:null};
let toastTimeout,modalSubmit=null;
function notify(txt){const e=$('#toast');e.textContent=txt;e.classList.add('show');clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>e.classList.remove('show'),3000)}
function err(e){console.error(e);notify(e?.message||'Ошибка: действие не выполнено')}
function field(label,name,value='',type='text',attrs=''){return `<label class="field">${esc(label)}<input name="${esc(name)}" type="${esc(type)}" value="${esc(value)}" ${attrs}></label>`}
function selectField(label,name,choices,selected='',extra=''){return `<label class="field">${esc(label)}<select name="${esc(name)}" ${extra}>${choices.map(([v,l])=>`<option value="${esc(v)}" ${String(v)===String(selected)?'selected':''}>${esc(l)}</option>`).join('')}</select></label>`}
function modal(title,body,submit=null,submitText='Сохранить'){$('#dialog-title').textContent=title;modalSubmit=submit;$('#dialog-content').innerHTML=submit?`<form id="modal-form">${body}<div class="buttons"><button type="button" class="secondary" data-action="close-modal">Отмена</button><button class="primary" type="submit">${esc(submitText)}</button></div></form>`:body;$('#dialog').showModal();}
function closeModal(){if($('#dialog').open)$('#dialog').close();modalSubmit=null}
$('#dialog-close').addEventListener('click',closeModal);
$('#dialog').addEventListener('click',e=>{if(e.target.id==='dialog')closeModal()});
$('#dialog').addEventListener('submit',async e=>{if(e.target.id!=='modal-form')return;e.preventDefault();if(!modalSubmit)return;const handler=modalSubmit;const btn=e.target.querySelector('[type=submit]');btn.disabled=true;try{await handler(new FormData(e.target),e.target);closeModal();render()}catch(ex){err(ex);btn.disabled=false}});
async function persist(fn){await dbStore.change(fn);render()}
const db=()=>dbStore.data;
function title(txt,sub=''){return `<div class="headrow"><h1>${esc(txt)}</h1></div>${sub?`<p class="muted tiny">${esc(sub)}</p>`:''}`}
function statusBadge(status){return `<span class="badge ${esc(status)}">${STATUS[status]||esc(status)}</span>`}
function render(){if(!db())return;$('#app').hidden=false;$('#auth').hidden=true;$('#tabs').hidden=!!s.sessionId;for(const x of $('#tabs').querySelectorAll('button'))x.classList.toggle('active',x.dataset.tab===s.tab);$('#panel').innerHTML=s.sessionId?renderSession():({today:renderToday,calendar:renderCalendar,programs:renderPrograms,progress:renderProgress,profile:renderProfile}[s.tab]());}
function navigate(tab){if(s.programId&&editorDirty()&&!discardUnsaved())return;s.programId=null;s.editorDraft=null;s.sessionId=null;s.correctingSession=false;s.tab=tab;render();window.scrollTo(0,0)}
function cardsForDate(date){const arr=workoutsForDate(db(),date);return arr.length?arr.map(w=>workoutCard(w)).join(''):`<div class="empty">На эту дату тренировок нет.</div>`}
function workoutCard(w){const st=statusFor(db(),w),ses=db().sessions[w.id],completed=ses?Object.values(ses.sets||{}).flat().filter(x=>x.done).length:0;return `<article class="card workout-card"><div class="workout-top"><div><div class="workout-title">${esc(w.name)}</div><div class="muted">${w.programId?`Программа «${esc(w.programName)}»`:w.source==='legacy'?'Перенесено из 1.0':'Разовая тренировка'} · ${esc(TYPE[w.type]||w.type||'Занятие')}</div></div>${statusBadge(st)}</div><div class="buttons"><button class="${st==='completed'?'secondary':'primary'} smallbtn" data-action="open-workout" data-id="${esc(w.id)}" data-date="${esc(w.date)}">${st==='in_progress'?'Продолжить':st==='completed'?'Посмотреть':w.date<dateToday()?'Записать результат':'Открыть'}</button>${st!=='legacy'?`<button class="secondary smallbtn" data-action="edit-day" data-id="${esc(w.id)}" data-date="${esc(w.date)}">${st==='completed'||st==='partial'?'Исправить результат':st==='in_progress'?'Продолжить и изменить':'Редактировать день'}</button>`:''}</div>${completed?`<p class="mini">Отмечено подходов: ${completed}</p>`:''}</article>`}
function renderToday(){const date=dateToday(),current=db(),open=Object.values(current.sessions).filter(x=>x.status==='in_progress'&&x.date<date);const sum=countPeriod(current,weekStart(date),addDays(weekStart(date),6));const n=sum.percent===null?'—':sum.percent+'%';return `${title('Сегодня',prettyDate(date,{weekday:'long',day:'numeric',month:'long'}))}${open.length?`<div class="card alert"><h3>Незавершённые тренировки: ${open.length}</h3>${open.slice(0,3).map(w=>`<p>${esc(w.name)} · ${esc(prettyDate(w.date))}</p><button class="outline smallbtn" data-action="open-workout" data-id="${esc(w.id)}" data-date="${esc(w.date)}">Продолжить</button>`).join('')}</div>`:''}<section class="card"><div class="between"><h3>Прогресс за неделю</h3><span class="muted tiny">${prettyDate(weekStart(date))} — ${prettyDate(addDays(weekStart(date),6))}</span></div><div class="data red">${n}</div><div class="progressbar"><i style="width:${sum.percent||0}%"></i></div><p class="muted tiny">Выполнено ${sum.completed} из ${sum.denom} · Частично ${sum.partial} · Пропущено ${sum.missed}</p></section><h2 class="subhead">Тренировки на сегодня</h2>${cardsForDate(date)}<div class="buttons today-actions"><button class="outline" data-action="add-oneoff" data-date="${date}">+ Разовая тренировка</button><button class="secondary" data-tab="calendar">Календарь</button></div>`}
function getMonthDays(month){const [y,m]=month.split('-').map(Number),first=`${y}-${String(m).padStart(2,'0')}-01`,start=weekStart(first);return Array.from({length:42},(_,i)=>addDays(start,i));}
function renderCalendar(){const date=s.date,today=dateToday();const moveMode=s.calMode==='month'?`<div class="calendar-grid">${DAYS.map(x=>`<div class="calweekday">${x}</div>`).join('')}${getMonthDays(s.month).map(d=>{const all=workoutsForDate(db(),d);const dots=all.slice(0,3).map(w=>`<i class="dot ${statusFor(db(),w)}"></i>`).join('');return `<button data-action="select-date" data-date="${d}" class="calday ${d===date?'selected':''} ${d===today?'today':''} ${d.slice(0,7)!==s.month?'outside':''}">${Number(d.slice(-2))}<small class="caldots">${dots}${all.length>3?`<span class="mini">+${all.length-3}</span>`:''}</small></button>`}).join('')}</div>`:`<div class="calendar-grid">${DAYS.map((x,i)=>{const d=addDays(weekStart(date),i);const all=workoutsForDate(db(),d);return `<button data-action="select-date" data-date="${d}" class="calday ${d===date?'selected':''} ${d===today?'today':''}">${esc(x)} ${Number(d.slice(-2))}<small class="caldots">${all.slice(0,3).map(w=>`<i class="dot ${statusFor(db(),w)}"></i>`).join('')}</small></button>`}).join('')}</div>`;
 const monthText=prettyDate(`${s.month}-01`,{month:'long',year:'numeric'});return `${title('Календарь')}<div class="calendar-toolbar"><button class="secondary calnav" data-action="month-prev">‹</button><span class="week-label">${esc(monthText)}</span><button class="secondary calnav" data-action="month-next">›</button><button class="outline smallbtn" data-action="cal-today">Сегодня</button></div><div class="seg"><button data-action="calendar-mode" data-value="month" class="${s.calMode==='month'?'active':''}">Месяц</button><button data-action="calendar-mode" data-value="week" class="${s.calMode==='week'?'active':''}">Неделя</button></div><div class="card" style="margin-top:12px">${moveMode}</div><div class="chipwrap">${Object.entries(STATUS).filter(([k])=>k!=='legacy').map(([k,v])=>`<span class="mini"><i class="dot ${k}"></i>${v}</span>`).join('')}</div><div class="headrow"><h2 class="subhead">${esc(prettyDate(date,{weekday:'long',day:'numeric',month:'long'}))}</h2></div>${cardsForDate(date)}<button class="outline wide" data-action="add-oneoff" data-date="${date}">+ Добавить тренировку</button>`}
function activeProg(){return db().programs.find(p=>p.id===s.programId)||null}
function createEditorDraft(){
 const p=activeProg();if(!p){s.editorDraft=null;return;}
 const date=dateForProgramDay(p,s.week,s.weekday);
 const templateWeek=activeWeeksForDate(p,date||dateToday());
 const current=db().dayPlans?.[`${p.id}:${date}`]??templateWeek[s.week]?.[s.weekday]??[];
 s.editorDraft={programId:p.id,week:s.week,weekday:s.weekday,date,day:structuredClone(current),original:JSON.stringify(current)};
}
function currentEditorDay(){if(!s.editorDraft||s.editorDraft.programId!==s.programId||s.editorDraft.week!==s.week||s.editorDraft.weekday!==s.weekday)createEditorDraft();return s.editorDraft?.day??[]}
function editorDirty(){return !!s.editorDraft&&JSON.stringify(s.editorDraft.day)!==s.editorDraft.original}
function discardUnsaved(){return !editorDirty()||confirm('Есть несохранённые изменения. Отменить их и перейти дальше?')}
function updateEditor(mutator){mutator(currentEditorDay());render()}
function saveProgramDayModal(){
 const p=activeProg(),day=currentEditorDay(),from=s.editorDraft?.date;
 if(!p||!from){notify('Для архивной программы редактирование расписания недоступно');return;}
 if(!editorDirty()){notify('Изменений для сохранения нет');return;}
 const choices=p.mode==='repeat'?[['current','Только ближайшая тренировка'],['future','Все будущие недели']]:[['current','Эта неделя'],['selected','Выбранные недели'],['future','Все будущие недели']];
 const weeks=p.mode==='repeat'?'':`<fieldset class="week-picks"><legend>Для варианта «Выбранные недели»</legend>${p.weeks.map((w,i)=>{const date=dateForProgramDay(p,i,s.weekday);const past=!date||date<dateToday();return `<label class="row list-item"><input type="checkbox" name="week" value="${i}" ${i===s.week?'checked':''} ${past?'disabled':''}> Неделя ${i+1} ${past?'(прошла)':`· ${esc(prettyDate(date))}`}</label>`}).join('')}</fieldset>`;
 modal('Сохранить изменения',`<p class="muted tiny">Изменится выбранный день недели. Выполненные и начатые занятия останутся неизменными.</p>${selectField('Область применения','scope',choices,'current')}${weeks}`,async f=>{
  const selected=f.getAll('week').map(Number);const scope=f.get('scope');
  const changed=await dbStore.change(d=>applyProgramDayEdit(d,p.id,s.week,s.weekday,day,scope,selected,dateToday()));
  createEditorDraft();render();
  const affected=scope==='future'?[from,addDays(from,7),addDays(from,14),addDays(from,21)]:selected.length&&scope==='selected'?selected.map(ix=>dateForProgramDay(p,ix,s.weekday)): [from];
  const overlap=affected.some(date=>date&&workoutsForDate(db(),date).some(w=>w.programId===p.id)&&workoutsForDate(db(),date).some(w=>w.programId&&w.programId!==p.id));
  notify(overlap?'Сохранено. В расписании есть совпадения программ — это разрешено.':'Изменения расписания сохранены');
 },'Применить');
}

function renderPrograms(){
 if(s.programId)return renderProgramEditor();
 const mode=s.programTab;
 const tabs=[['active','Активные'],['archive','Архив'],['bank','Банк упражнений'],['refs','Справочники']].map(([k,v])=>`<button class="chip ${mode===k?'active':''}" data-action="programs-mode" data-value="${k}">${v}</button>`).join('');
 let content='';
 if(mode==='bank')content=renderBank();
 else if(mode==='refs')content=renderReferences();
 else {
  const programs=db().programs.filter(p=>mode==='archive'?p.status==='archived':p.status==='active');
  const cards=programs.map(p=>{
   const canDelete=!Object.values(db().sessions).some(x=>x.programId===p.id);
   const deleteBtn=canDelete?`<button class="secondary smallbtn danger" data-action="delete-program" data-id="${esc(p.id)}">Удалить</button>`:'';
   return `<div class="card"><div class="between"><h3>${esc(p.name)}</h3><span class="badge">${p.mode==='finite'?p.weeks.length+' нед.':'Повторяющаяся'}</span></div><p class="muted tiny">${p.mode==='finite'?'Конечная программа':'Недельный цикл'} · ${p.status==='active'?'Активная':'В архиве'}</p><div class="buttons"><button class="primary smallbtn" data-action="edit-program" data-id="${esc(p.id)}">Открыть</button><button class="secondary smallbtn" data-action="${p.status==='archived'?'restore-program':'archive-program'}" data-id="${esc(p.id)}">${p.status==='archived'?'Восстановить':'Архивировать'}</button>${deleteBtn}</div></div>`;
  }).join('')||'<div class="empty">Здесь пока нет программ.</div>';
  content=`<button class="primary wide" data-action="new-program">+ Новая программа</button><h2 class="subhead">${mode==='archive'?'Архивные программы':'Активные программы'}</h2>${cards}`;
 }
 return `${title('Программы')}<div class="chipwrap">${tabs}</div>${content}`;
}
function renderProgramEditor(){
 const p=activeProg();if(!p){s.programId=null;return renderPrograms();}
 const wk=Math.min(s.week,p.weeks.length-1);s.week=wk;
 const d=s.weekday,list=currentEditorDay();
 const weeks=p.weeks.map((_,i)=>`<button data-action="choose-week" data-value="${i}" class="chip ${wk===i?'active':''}">${i+1}</button>`).join('');
 const days=DAYS.map((x,i)=>`<button data-action="choose-weekday" data-value="${i}" class="chip ${i===d?'active':''}">${x}</button>`).join('');
 const cards=list.map((t,idx)=>{
   const exercises=t.exercises.map((ex,i)=>`<div class="list-item between"><div><strong>${esc(ex.name)}</strong><p class="muted tiny">${esc(ex.sets||1)} × ${esc(ex.reps||'—')} · ${ex.weight!=null?esc(ex.weight)+' кг':'без веса'}</p></div><div class="buttons"><button class="secondary smallbtn" data-action="edit-planned-exercise" data-tindex="${idx}" data-index="${i}">Изменить</button><button class="secondary smallbtn danger" data-action="remove-template-exercise" data-tindex="${idx}" data-index="${i}">−</button></div></div>`).join('');
   return `<div class="card"><div class="between"><div><h3>${esc(t.name)}</h3><p class="muted tiny">${esc(TYPE[t.type]||t.type)} · ${t.exercises.length} упражнений</p></div><button class="secondary smallbtn" data-action="edit-template" data-index="${idx}">Изменить</button></div>${exercises}<div class="buttons"><button class="outline smallbtn" data-action="add-exercise-to-workout" data-tindex="${idx}">+ Упражнение</button><button class="secondary smallbtn danger" data-action="remove-template" data-index="${idx}">Удалить</button></div></div>`;
 }).join('')||'<div class="empty">В этот день пока нет тренировок.</div>';
 return `<button class="secondary smallbtn" data-action="back-programs">← Программы</button><div style="margin-top:12px">${title(p.name,'Конструктор программы · неделя → день → тренировка → упражнения')}</div><div class="card alert"><strong>Неделя ${wk+1} → ${DAYS[d]} → ${list.length} тренировок</strong><p class="tiny muted">${s.editorDraft?.date?`Ближайшая дата: ${prettyDate(s.editorDraft.date)}`:``}${editorDirty()?` · Есть несохранённые изменения`:``}</p></div><h2 class="subhead">Недели</h2><div class="chipwrap">${weeks}</div><h2 class="subhead">День недели</h2><div class="chipwrap">${days}</div>${cards}<button class="primary wide" data-action="add-template">+ Добавить тренировку</button><div class="buttons" style="margin-top:12px"><button class="secondary" data-action="duplicate-week">Дублировать неделю</button><button class="outline" data-action="edit-program-meta">Настройки программы</button></div><button class="primary wide" data-action="save-program-day" style="margin-top:12px">Сохранить изменения →</button>`;
}
function exerciseUsed(id){
 return Object.values(db().sessions||{}).some(s=>(s.exercisePlans||[]).some(ex=>ex.exerciseId===id))||
 db().programs.some(p=>[...(p.weeks||[]),...(p.scheduleVersions||[]).flatMap(v=>v.weeks||[])].some(week=>week.some(day=>day.some(t=>(t.exercises||[]).some(ex=>ex.exerciseId===id)))))||
 Object.values(db().dayPlans||{}).some(day=>(day||[]).some(t=>(t.exercises||[]).some(ex=>ex.exerciseId===id)))||
 Object.values(db().overrides||{}).some(w=>(w?.exercises||[]).some(ex=>ex.exerciseId===id));
}
function renderBank(){
 const items=db().exercises.filter(x=>s.bankShowArchived?x.active===false:x.active!==false).filter(x=>
 (!s.bankQuery||x.name.toLowerCase().includes(s.bankQuery.toLowerCase()))&&
 (!s.bankCat||x.category===s.bankCat)&&(!s.bankMuscle||(x.muscles||[]).includes(s.bankMuscle))&&
 (!s.bankEquipment||x.equipment===s.bankEquipment)&&(!s.bankLocation||x.location===s.bankLocation)&&(!s.bankLevel||x.level===s.bankLevel)&&(!s.bankSource||(x.source||'custom')===s.bankSource)&&
 (!s.bankOnlyFav||x.favorite));
 return `<div class="buttons"><button class="primary" data-action="new-exercise">+ Упражнение</button><button class="secondary" data-action="add-reference">+ Справочник</button></div><label class="field">Поиск упражнений<input id="bank-search" type="search" value="${esc(s.bankQuery)}" placeholder="Название упражнения"></label><div class="chipwrap">${['',...db().categories].map(cat=>`<button data-action="bank-category" data-value="${esc(cat)}" class="chip ${cat===s.bankCat?'active':''}">${esc(cat||'Все')}</button>`).join('')}</div><div class="formgrid">${selectField('Мышечная группа','muscle',[['','Все'],...db().muscles.map(x=>[x,x])],s.bankMuscle,'id="bank-muscle"')}${selectField('Оборудование','equipment',[['','Любое'],...db().equipment.map(x=>[x,x])],s.bankEquipment,'id="bank-equipment"')}${selectField('Место','location',[['','Любое'],...db().locations.map(x=>[x,x])],s.bankLocation,'id="bank-location"')}${selectField('Сложность','level',[['','Любая'],['Начальный','Начальный'],['Средний','Средний'],['Продвинутый','Продвинутый']],s.bankLevel,'id="bank-level"')}${selectField('Источник','source',[['','Любой'],['builtin','Стандартная библиотека'],['custom','Создано вручную'],['legacy','Перенесено из 1.0']],s.bankSource,'id="bank-source"')}</div><div class="buttons"><label class="row tiny"><input id="bank-favorites" type="checkbox" ${s.bankOnlyFav?'checked':''}> Только избранное</label><label class="row tiny"><input id="bank-archived" type="checkbox" ${s.bankShowArchived?'checked':''}> Скрытые</label></div>${items.map(x=>`<div class="card"><div class="between"><div><h3>${esc(x.name)}</h3><p class="muted tiny">${esc(x.category)} · ${esc((x.muscles||[]).join(', '))}</p><p class="muted tiny">${esc(x.equipment||'Оборудование не указано')} · ${esc(x.location||'Место не указано')}</p></div><button class="smallbtn ${x.favorite?'outline':'secondary'}" aria-label="${x.favorite?'Убрать из избранного':'В избранное'}" data-action="toggle-favorite" data-id="${esc(x.id)}">${x.favorite?'★':'☆'}</button></div>${x.how?`<p class="muted tiny">${esc(x.how)}</p>`:''}${x.alternatives?.length?`<p class="muted tiny">Альтернативы: ${esc(x.alternatives.join(', '))}</p>`:''}<div class="buttons"><button class="secondary smallbtn" data-action="edit-exercise" data-id="${esc(x.id)}">Изменить</button><button class="secondary smallbtn" data-action="${s.bankShowArchived?'restore-exercise':'hide-exercise'}" data-id="${esc(x.id)}">${s.bankShowArchived?'Восстановить':'Скрыть'}</button>${!exerciseUsed(x.id)?`<button class="secondary smallbtn danger" data-action="delete-exercise" data-id="${esc(x.id)}">Удалить</button>`:''}</div></div>`).join('')||`<div class="empty">Нет упражнений по фильтру.</div>`}`;
}
function renderReferences(){return `<h2 class="subhead">Справочники</h2>${[['categories','Категории'],['muscles','Мышечные группы'],['equipment','Оборудование'],['locations','Места']].map(([key,label])=>`<div class="card"><div class="between"><h3>${label}</h3><button class="secondary smallbtn" data-action="add-reference" data-value="${key}">+ Добавить</button></div>${db()[key].map((item,index)=>`<div class="list-item between"><span>${esc(item)}</span><div class="buttons"><button class="secondary smallbtn" data-action="rename-reference" data-value="${key}" data-index="${index}">Изменить</button><button class="secondary smallbtn danger" data-action="delete-reference" data-value="${key}" data-index="${index}">×</button></div></div>`).join('')}</div>`).join('')}`}
function referenceUsage(d,key,value){
 if(key==='categories')return d.exercises.some(e=>e.category===value);
 if(key==='muscles')return d.exercises.some(e=>(e.muscles||[]).includes(value));
 if(key==='equipment')return d.exercises.some(e=>e.equipment===value);
 return d.exercises.some(e=>e.location===value);
}
function renameReferenceModal(key,index){const old=db()[key]?.[index];if(old==null)return;
 modal('Изменить значение справочника',field('Название','name',old,'text','required maxlength="90"'),async f=>{
  const name=String(f.get('name')||'').trim();if(!name)throw Error('Укажи название');
  await persist(d=>{
   if(d[key].some((v,i)=>v===name&&i!==index))throw Error('Такое значение уже существует');
   d[key][index]=name;
   for(const ex of d.exercises){
    if(key==='categories'&&ex.category===old)ex.category=name;
    if(key==='muscles')ex.muscles=(ex.muscles||[]).map(v=>v===old?name:v);
    if(key==='equipment'&&ex.equipment===old)ex.equipment=name;
    if(key==='locations'&&ex.location===old)ex.location=name;
   }
  });
 });
}

function chartSvg(rows){if(!rows.length)return '<div class="empty">Нет данных для графика</div>';const vals=rows.map(x=>Number(x.value)).filter(Number.isFinite),lo=Math.min(...vals),hi=Math.max(...vals),span=Math.max(1,hi-lo),w=340,h=115,coords=rows.map((x,i)=>[16+(w-32)*i/Math.max(1,rows.length-1),h-15-(Number(x.value)-lo)/span*(h-35)]);return `<svg class="chart" role="img" aria-label="График измерений" viewBox="0 0 ${w} ${h}"><line x1="10" x2="330" y1="35" y2="35"/><line x1="10" x2="330" y1="80" y2="80"/><polyline points="${coords.map(p=>p.join(',')).join(' ')}"/>${coords.map(p=>`<circle cx="${p[0]}" cy="${p[1]}" r="3.5"/>`).join('')}</svg><div class="between tiny muted"><span>${esc(rows[0].label)}</span><span>${esc(rows.at(-1).label)}</span></div>`}
function dailyWeightRows(){const by={};for(const m of db().measurements.filter(x=>x.metric==='weight').sort((a,b)=>a.measuredAt.localeCompare(b.measuredAt)))by[m.measuredAt.slice(0,10)]=m;return Object.values(by).sort((a,b)=>a.measuredAt.localeCompare(b.measuredAt)).map(x=>({label:prettyDate(x.measuredAt.slice(0,10),{day:'numeric',month:'short'}),value:x.value}));}
function renderProgress(){const tabs=[['overview','Обзор'],['body','Тело'],['exercise','Упражнения'],['wellness','Самочувствие'],['reports','Отчёты']].map(([k,v])=>`<button class="chip ${s.progressTab===k?'active':''}" data-action="progress-mode" data-value="${k}">${v}</button>`).join('');const content=({overview:renderOverview,body:renderBody,exercise:renderExerciseProgress,wellness:renderWellness,reports:renderReports}[s.progressTab])();return `${title('Прогресс')}<div class="chipwrap">${tabs}</div>${content}`;}
function renderOverview(){const sum=countPeriod(db(),weekStart(dateToday()),addDays(weekStart(dateToday()),6)),last=lastMeasurement(db());const rows=dailyWeightRows();return `<section class="card"><h3>Выполнение плана</h3><div class="data red">${sum.percent??'—'}${sum.percent===null?'':'%'}</div><div class="progressbar"><i style="width:${sum.percent||0}%"></i></div><p class="tiny muted">${sum.completed} из ${sum.denom} по программам · ${sum.oneOff} разовых завершено</p></section><div class="metric-grid">${[['Выполнено',sum.completed],['Частично',sum.partial],['Пропущено',sum.missed],['В процессе',sum.inProgress]].map(([x,n])=>`<div class="metric"><div class="mini">${x}</div><div class="data">${n}</div></div>`).join('')}</div><h2 class="subhead">Показатели тела</h2><div class="buttons progress-actions"><button class="primary" data-action="add-weight">Записать вес</button><button class="secondary" data-action="add-measurements">Добавить замеры</button></div><div class="card"><div class="between"><h3>Динамика веса</h3><span class="muted tiny">${last?esc(last.value)+' кг':'Нет данных'}</span></div>${chartSvg(rows.slice(-14))}</div><div class="buttons"><button class="secondary" data-action="progress-mode" data-value="exercise">История упражнений</button><button class="secondary" data-action="progress-mode" data-value="wellness">Самочувствие</button></div>`}
function renderBody(){const rows=db().measurements.filter(m=>m.metric==='weight').sort((a,b)=>b.measuredAt.localeCompare(a.measuredAt));const dates=[...new Set(db().measurements.map(x=>x.measuredAt.slice(0,10)))].sort().reverse();return `<div class="buttons progress-actions"><button class="primary" data-action="add-weight">Записать вес</button><button class="secondary" data-action="add-measurements">Добавить замеры</button></div><section class="card"><h3>Динамика веса</h3>${chartSvg(dailyWeightRows().slice(-30))}</section><button class="secondary wide" data-action="add-custom-metric">+ Свой показатель</button><div class="card"><div class="between"><h3>Сравнение замеров</h3><button class="outline smallbtn" data-action="compare-body">Сравнить даты</button></div><p class="muted tiny">${dates.length>=2?`${prettyDate(dates[1])} → ${prettyDate(dates[0])}`:'Нужны измерения минимум за две даты'}</p></div><h2 class="subhead">История измерений</h2>${db().measurements.slice().sort((a,b)=>b.measuredAt.localeCompare(a.measuredAt)).slice(0,80).map(x=>`<div class="list-item between"><div><strong>${esc(allMetrics().find(z=>z[0]===x.metric)?.[1]||x.metric)}: ${esc(x.value)} ${esc(x.unit)}</strong><p class="muted tiny">${esc(x.measuredAt.replace('T',' ').slice(0,16))}</p></div><div class="buttons"><button class="secondary smallbtn" data-action="edit-measurement" data-id="${esc(x.id)}">Изменить</button><button class="secondary smallbtn danger" data-action="delete-measurement" data-id="${esc(x.id)}">Удалить</button></div></div>`).join('')||'<div class="empty">Измерений пока нет.</div>'}`}
function allExResults(){const res=new Map();for(const sess of Object.values(db().sessions))for(const p of (sess.exercisePlans||[])){const a=(sess.sets?.[p.id]||[]).filter(z=>z.done);if(!a.length)continue;const key=p.exerciseId||p.id;const curr=res.get(key)||{name:p.name,rows:[],count:0};curr.count++;curr.rows.push({date:sess.date,sets:a,program:sess.programName||'Разовая'});res.set(key,curr);}return [...res.entries()].map(([id,x])=>({id,...x}));}
function renderExerciseProgress(){const items=allExResults();return `${field('Найти упражнение','query',s.search,'search','id="exercise-search" placeholder="Поиск по истории"')}${items.filter(x=>x.name.toLowerCase().includes(s.search.toLowerCase())).map(x=>{const weights=exerciseProgressSeries(db(),x.id,'weight').map(y=>y.value),volumes=exerciseProgressSeries(db(),x.id,'volume').map(y=>y.value);const max=weights.length?Math.max(...weights):null,volume=volumes.length?volumes.reduce((a,b)=>a+b,0):null;return `<div class="card"><h3>${esc(x.name)}</h3><p class="tiny muted">${x.count} тренировок · максимальный вес ${max??'Нет данных'} кг · объём ${volume===null?'Нет данных':Math.round(volume)} кг</p><button class="outline smallbtn" data-action="exercise-history" data-value="${esc(x.id)}">История и графики</button></div>`}).join('')||'<div class="empty">Пока нет отмеченных выполненных подходов.</div>'}`}
function chartPainSvg(rows){
 if(!rows.length)return '<div class="empty">Нет оценок для выбранной зоны</div>';
 const w=340,h=140,xx=i=>14+i*(w-28)/Math.max(1,rows.length-1),yy=n=>h-14-n*(h-29)/10;
 const lines=(field,cls)=>rows.map((r,i)=>r[field]===null?'':`<circle class="${cls}" cx="${xx(i)}" cy="${yy(r[field])}" r="3.5"><title>${esc(r.date)}: ${r[field]}/10</title></circle>`).join('')+
  rows.map((r,i)=>{if(i===0||r[field]===null||rows[i-1][field]===null)return '';return `<line class="${cls}" x1="${xx(i-1)}" y1="${yy(rows[i-1][field])}" x2="${xx(i)}" y2="${yy(r[field])}"/>`}).join('');
 return `<div class="pain-legend"><span>● До тренировки</span><span>● После тренировки</span></div><svg class="chart pain-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Боль до и после тренировки, шкала от 0 до 10"><line x1="10" y1="14" x2="330" y2="14"/><line x1="10" y1="70" x2="330" y2="70"/><line x1="10" y1="126" x2="330" y2="126"/>${lines('before','before-line')}${lines('after','after-line')}</svg><div class="between tiny muted"><span>${esc(prettyDate(rows[0].date))}</span><span>${esc(prettyDate(rows.at(-1).date))}</span></div>`;
}
function renderWellness(){
 const all=Object.values(db().sessions).filter(x=>x.status!=='planned'&&(x.status==='completed'||x.status==='partial'||x.status==='in_progress'||x.wellness?.legacy)).sort((a,b)=>b.date.localeCompare(a.date));
 const zones=db().painZones.filter(z=>z.active||all.some(x=>x.wellness?.before?.pain?.[z.id]!==undefined||x.wellness?.after?.pain?.[z.id]!==undefined||x.wellness?.legacy?.pain?.[z.id]!==undefined));
 const selected=zones.find(z=>z.id===s.wellnessZone)||zones[0];
 const periodOptions=[['30','30 дней'],['90','90 дней'],['all','Весь период']];
 const windowDays=s.wellnessPeriod||'30',cutoff=windowDays==='all'?'0000-01-01':addDays(dateToday(),-Number(windowDays));
 const series=selected?wellnessSeries(db(),selected.id).filter(x=>x.date>=cutoff):[];
 const recent=all.filter(x=>x.date>=cutoff).slice(0,80);
 const summary=(key,phase)=>{const v=recent.map(x=>x.wellness?.[phase]?.[key]).filter(x=>Number.isInteger(x));return v.length?(v.reduce((a,b)=>a+b,0)/v.length).toFixed(1).replace('.',',')+'/10':'Нет данных'};
 return `<section class="card"><div class="between"><h3>Показатели самочувствия</h3>${selectField('Период','period',periodOptions,windowDays,'id="wellness-period"')}</div><div class="metric-grid"><div class="metric"><div class="mini">Энергия до</div><strong>${summary('energy','before')}</strong></div><div class="metric"><div class="mini">Усталость после</div><strong>${summary('fatigue','after')}</strong></div><div class="metric"><div class="mini">Тяжесть нагрузки</div><strong>${summary('exertion','after')}</strong></div></div></section><section class="card"><h3>Боль по зонам</h3>${selected?selectField('Болевая зона','zone',zones.map(z=>[z.id,z.name]),selected.id,'id="wellness-zone"'):'<p>Нет зон</p>'}${chartPainSvg(series)}<p class="tiny muted">«Нет данных» не считается нулём. Старые оценки 1.0 не относятся ни к «До», ни к «После».</p></section><h2 class="subhead">История самочувствия</h2>${recent.map(x=>{const a=x.wellness?.before,b=x.wellness?.after,l=x.wellness?.legacy;return `<details class="card"><summary>${esc(x.name)} · ${prettyDate(x.date)}</summary><p class="tiny muted"><strong>До:</strong> ${a?`Энергия ${a.energy??'Нет данных'}/10; ${formatPain(a.pain)}`:'Нет данных'}</p><p class="tiny muted"><strong>После:</strong> ${b?`Усталость ${b.fatigue??'Нет данных'}/10, нагрузка ${b.exertion??'Нет данных'}/10; ${formatPain(b.pain)}`:'Нет данных'}</p>${l?`<p class="tiny muted"><strong>Данные 1.0 (без отметки до/после):</strong> ${formatPain(l.pain)}</p>`:''}</details>`}).join('')||'<div class="empty">Нет тренировок за период.</div>'}`;
}
function formatPain(pain){return Object.entries(pain||{}).map(([k,v])=>`${esc(db().painZones.find(z=>z.id===k)?.name||k)} ${esc(v)}/10`).join(', ')||'Нет данных';}
function reportRange(date,mode){if(mode==='week'){const st=weekStart(date);return [st,addDays(st,6)]}const st=date.slice(0,7)+'-01',dt=new Date(Number(date.slice(0,4)),Number(date.slice(5,7)),0,12);return [st,dateISO(dt)];}
function renderReports(){
 const pr=comparablePeriods(s.reportDate,s.reportMode),a=pr.start,b=pr.end,today=dateToday();
 const prog=s.reportProgram||null,type=s.reportType||null;
 const sum=pr.selectedEnd?countPeriod(db(),a,pr.selectedEnd,today,prog,type):{percent:null,completed:0,denom:0,partial:0,missed:0,inProgress:0,oneOff:0,allCompleted:0,duration:0};
 const older=pr.selectedPrevEnd?countPeriod(db(),pr.prevStart,pr.selectedPrevEnd,today,prog,type):{percent:null};
 const diff=older.percent==null||sum.percent==null?null:sum.percent-older.percent;
 const relevant=Object.values(db().sessions).filter(x=>x.date>=a&&x.date<=(pr.selectedEnd||a)&&(!prog||x.programId===prog)&&(!type||x.type===type));
 const energies=relevant.map(x=>x.wellness?.before?.energy).filter(Number.isInteger);
 const average=energies.length?(energies.reduce((u,v)=>u+v,0)/energies.length).toFixed(1).replace('.',',')+'/10':'Нет данных';
 const weightRows=db().measurements.filter(x=>x.metric==='weight'&&x.measuredAt.slice(0,10)>=a&&x.measuredAt.slice(0,10)<=(pr.selectedEnd||a)).sort((x,y)=>x.measuredAt.localeCompare(y.measuredAt));
 const weightDelta=weightRows.length>=2?`${(weightRows.at(-1).value-weightRows[0].value)>0?'+':''}${Number((weightRows.at(-1).value-weightRows[0].value).toFixed(2))} кг`:'Нет данных';
 return `<div class="seg"><button class="${s.reportMode==='week'?'active':''}" data-action="report-mode" data-value="week">Неделя</button><button class="${s.reportMode==='month'?'active':''}" data-action="report-mode" data-value="month">Месяц</button></div><div class="calendar-toolbar" style="margin-top:12px"><button class="secondary smallbtn" data-action="report-prev">←</button><strong>${prettyDate(a)} — ${prettyDate(b)}</strong><button class="secondary smallbtn" data-action="report-next">→</button></div><div class="formgrid">${selectField('Программа','program',[['','Все программы'],...db().programs.map(p=>[p.id,p.name])],s.reportProgram,'id="report-program"')}${selectField('Тип активности','type',[['','Все активности'],...Object.entries(TYPE).map(([k,v])=>[k,v])],s.reportType,'id="report-type"')}</div><div class="card"><h3>Выполнение плана</h3><div class="data red">${sum.percent??'—'}${sum.percent===null?'':'%'}</div><p class="muted tiny">${sum.completed} из ${sum.denom} тренировок · Изменение: ${diff===null?'Недостаточно данных':`${diff>0?'+':''}${diff} п. п.`}</p>${pr.selectedEnd&&pr.selectedEnd!==b?'<p class="tiny muted">Текущий период ещё не завершён: сравнение по одинаковому количеству прошедших дней.</p>':''}</div><div class="metric-grid">${[['Выполнено',sum.completed],['Частично',sum.partial],['Пропущено',sum.missed],['В процессе',sum.inProgress],['Разовые завершены',sum.oneOff],['Разовые частично',sum.oneOffPartial||0],['Длительность, мин',sum.duration]].map(([k,v])=>`<div class="metric"><div class="mini">${k}</div><div class="data">${v}</div></div>`).join('')}</div><div class="card"><h3>Показатели за период</h3><p>Изменение веса: <strong>${weightDelta}</strong></p><p>Средняя энергия до тренировки: <strong>${average}</strong></p><p class="tiny muted">Вес и самочувствие рассчитываются по фактически записанным данным; отсутствующие значения не подменяются нулями.</p></div>`;
}
function renderProfile(){const zs=db().painZones.filter(x=>x.active),goals=db().goals.filter(x=>x.status!=='archived'),last=db().settings.lastExportAt;return `${title('Профиль')}<section class="card"><div class="between"><h3>Мои данные</h3><button class="secondary smallbtn" data-action="edit-profile">Изменить</button></div><p class="muted tiny">Рост: ${db().settings.profile.height||'—'} см · Дата рождения: ${db().settings.profile.birth||'—'}</p></section><section class="card"><div class="between"><h3>Мои цели</h3><button class="outline smallbtn" data-action="new-goal">+ Цель</button></div>${goals.map(g=>{const current=lastMeasurement(db(),g.metric)?.value,percent=current==null?null:goalProgress(g.baseline,g.target,current);return `<div class="list-item"><div class="between"><strong>${esc(allMetrics().find(m=>m[0]===g.metric)?.[1]||g.metric)}</strong><div class="buttons"><button class="secondary smallbtn" data-action="edit-goal" data-id="${esc(g.id)}">Изменить</button><button class="secondary smallbtn" data-action="archive-goal" data-id="${esc(g.id)}">Архив</button></div></div><p class="muted tiny">Начало ${g.baseline} → Цель ${g.target} · Сейчас ${current??'Нет данных'}</p><div class="progressbar"><i style="width:${percent||0}%"></i></div></div>`}).join('')||'<p class="muted tiny">Цели пока не созданы.</p>'}</section><section class="card"><h3>Архив целей</h3>${db().goals.filter(x=>x.status==='archived').map(g=>`<div class="list-item between"><span>${esc(allMetrics().find(m=>m[0]===g.metric)?.[1]||g.metric)}: ${esc(g.target)}</span><div class="buttons"><button class="secondary smallbtn" data-action="restore-goal" data-id="${esc(g.id)}">Восстановить</button><button class="secondary smallbtn danger" data-action="delete-goal" data-id="${esc(g.id)}">Удалить</button></div></div>`).join('')||'<p class="tiny muted">Нет архивных целей.</p>'}</section><section class="card"><div class="between"><h3>Настройки самочувствия</h3><button class="outline smallbtn" data-action="new-zone">+ Зона</button></div>${zs.map(z=>`<div class="list-item between"><span>${esc(z.name)}</span><div class="buttons"><button class="secondary smallbtn" aria-label="Поднять зону" data-action="move-zone" data-value="up" data-id="${esc(z.id)}">↑</button><button class="secondary smallbtn" aria-label="Опустить зону" data-action="move-zone" data-value="down" data-id="${esc(z.id)}">↓</button><button class="secondary smallbtn" data-action="edit-zone" data-id="${esc(z.id)}">Изменить</button><button class="secondary smallbtn danger" data-action="archive-zone" data-id="${esc(z.id)}">Скрыть</button></div></div>`).join('')}<button class="secondary smallbtn" data-action="restore-zone">Восстановить зону</button></section><section class="card"><h3>Безопасность</h3><div class="buttons"><button class="secondary" data-action="change-password">Изменить пароль</button><button class="outline" data-action="lock">Заблокировать</button></div><p class="muted tiny">Без автоматической блокировки при сворачивании.</p></section><section class="card"><h3>Резервные копии</h3><p class="muted tiny">Последний подтверждённый экспорт: ${last?esc(new Date(last).toLocaleDateString('ru-RU')):'Нет данных'}</p><div class="buttons"><button class="primary" data-action="backup-export">Создать копию</button><button class="secondary" data-action="backup-import">Восстановить</button></div><label class="row tiny muted" style="margin-top:12px"><input type="checkbox" id="backup-reminder" ${db().settings.backupReminder?'checked':''}> Напоминать раз в 7 дней</label></section><section class="card"><h3>О приложении</h3><p class="muted tiny">Тренировки 2.0 · тестовая сборка · данные локальные и зашифрованы.</p><p class="muted tiny">Офлайн-доступ после установки ресурсов; код обновляется отдельно от базы данных.</p>${db().legacy?`<p class="muted tiny">Перенос из 1.0: ${db().legacy.counts.dates} дат, ${db().legacy.counts.marks} отметок, ${db().legacy.counts.weights} значений веса.</p>`:''}</section>`}
function findWorkout(id,date){return workoutsForDate(db(),date).find(w=>w.id===id)||null}
function renderLegacySession(session){
 const names=new Map((session.exercisePlans||[]).map(ex=>[ex.id,ex.name]));
 const checks=Object.entries(session.legacyMeta?.checks||{}).filter(([,done])=>done);
 const weights=Object.entries(session.legacyMeta?.weights||{}).filter(([,val])=>val!==null&&val!=='');
 const log=session.wellness?.legacy?.pain||{};
 return `<button class="secondary smallbtn" data-action="session-exit">← Назад</button>${title(session.name||'Запись 1.0',`${prettyDate(session.date)} · архив`)}<div class="card alert"><h3>Импортировано из версии 1.0</h3><p class="tiny muted">Оригинальные значения сохранены. Фактические повторения и оценки «до/после» не восстанавливаются, если их не было в старой записи.</p></div><section class="card"><h3>Отметки выполнения</h3>${checks.map(([key])=>`<p class="tiny">✓ ${esc(names.get(key.replace(/\/\d+$/,''))||key)}</p>`).join('')||'<p class="muted tiny">Нет отметок.</p>'}</section><section class="card"><h3>Рабочие веса из 1.0</h3>${weights.map(([key,value])=>`<p class="tiny">${esc(names.get(key)||key)} · ${esc(value)} кг</p>`).join('')||'<p class="muted tiny">Нет записей веса.</p>'}<p class="muted tiny">В версии 1.0 вес был записан на упражнение за дату, а не отдельно по каждому подходу.</p></section><section class="card"><h3>Самочувствие и заметки</h3>${Object.entries(log).map(([key,val])=>`<p class="tiny">${esc(db().painZones.find(z=>z.id===key)?.name||key)}: ${esc(val)}/10</p>`).join('')||'<p class="muted tiny">Нет оценок боли.</p>'}<p>${esc(session.notes||'Нет заметок')}</p></section>`;
}
function renderSession(){const ss=db().sessions[s.sessionId];if(ss?.source==='legacy')return renderLegacySession(ss);let w=ss?findWorkout(ss.id,ss.date):findWorkout(s.sessionId,s.date);if(!w){s.sessionId=null;return renderToday()}const session=db().sessions[w.id]||null,st=statusFor(db(),w),plans=session?.exercisePlans||w.exercises||[];const allsets=Object.values(session?.sets||{}).flat(),done=allsets.filter(x=>x.done).length,canEdit=session?.status==='in_progress'||(s.correctingSession&&['completed','partial'].includes(session?.status));const sessionStart=!!session?.startedAt;const usesLoad=['strength','mixed'].includes(session?.type||w.type);
 return `<button class="secondary smallbtn" data-action="session-exit">← Назад</button><div style="margin-top:13px">${title(w.name,`${prettyDate(w.date)} · ${w.programName||'Разовая тренировка'}`)}</div><div class="card"><div class="between"><h3>Результат тренировки</h3>${statusBadge(st)}</div><p class="muted tiny">${done} отмеченных подходов${!sessionStart?' · Ещё не начата':''}</p><div class="progressbar"><i style="width:${allsets.length?done/allsets.length*100:0}%"></i></div></div>${!sessionStart?`<div class="card alert"><h3>${w.date<dateToday()?'Ретроспективная запись':'Перед началом тренировки'}</h3><p class="muted tiny">${w.date<dateToday()?'Оценки до и после необязательны; недостающие поля сохраняются как «Нет данных».':'Перед началом требуется заполнить самочувствие до тренировки.'}</p><button class="primary wide" data-action="start-workout" data-id="${esc(w.id)}" data-date="${esc(w.date)}">${w.date<dateToday()?'Внести результаты':'Начать тренировку'}</button></div>`:''}${s.correctingSession?'<div class="card alert"><strong>Исправление результатов</strong><p class="tiny muted">Изменения сохраняются автоматически, статус завершённой тренировки сохраняется.</p></div>':''}<h2 class="subhead">Упражнения</h2>${plans.length?plans.map((ex,i)=>{const expanded=s.expanded.has(ex.id);const sets=session?.sets?.[ex.id]||[];return `<details class="exercise-row" data-exid="${esc(ex.id)}" ${expanded?'open':''}><summary><span>${esc(ex.name)}</span><span class="muted tiny">${usesLoad?`${esc(ex.sets||1)} × ${esc(ex.reps??'—')} ${ex.weight!=null?`· ${esc(ex.weight)} кг`:''}`:'Отметка выполнения'} ▾</span></summary><div class="hr"></div>${sessionStart?sets.map((r,ix)=>`<div class="setrow ${usesLoad?'':'simple'}"><input aria-label="Выполнен подход ${ix+1}" type="checkbox" data-action="toggle-set" data-ex="${esc(ex.id)}" data-index="${ix}" ${r.done?'checked':''} ${!canEdit?'disabled':''}>${usesLoad?`<input aria-label="Вес, килограммы" data-action="edit-set" data-field="weight" data-ex="${esc(ex.id)}" data-index="${ix}" type="number" step="0.5" min="0" value="${esc(r.weight??'')}" placeholder="кг" ${!canEdit?'disabled':''}><input aria-label="Повторения" data-action="edit-set" data-field="reps" data-ex="${esc(ex.id)}" data-index="${ix}" type="number" min="0" step="1" value="${esc(r.reps??'')}" placeholder="повторы" ${!canEdit?'disabled':''}>`:`<span class="muted tiny">${r.done?'Выполнено':'Отметить выполнение'}${sets.length>1?` · ${ix+1}`:''}</span>`}</div>`).join(''):'<p class="muted tiny">Начни тренировку, чтобы отмечать подходы.</p>'}${ex.how?`<p class="tiny muted">Техника: ${esc(ex.how)}</p>`:''}<button class="secondary smallbtn" data-action="exercise-history" data-value="${esc(ex.exerciseId||ex.id)}">История упражнения</button>${sessionStart&&canEdit?`<button class="secondary smallbtn danger" data-action="remove-session-exercise" data-exid="${esc(ex.id)}">Убрать из результатов</button>`:''}</details>`}).join(''):'<div class="empty">Для этого типа занятий отметь длительность и при необходимости заметки.</div>'}${sessionStart&&canEdit?`<button class="outline wide add-session-exercise" data-action="add-session-exercise">+ Добавить упражнение к результатам</button>`:''}${sessionStart?`<section class="card"><h3>Фактические данные</h3><div class="formgrid">${field('Длительность, мин','duration',session.duration??'','number',`data-session-field="duration" min="0" step="1" ${canEdit?'':'disabled'}`)}${['cardio','tennis'].includes(session?.type||w.type)?field('Дистанция, км (необязательно)','distance',session.distance??'','number',`data-session-field="distance" min="0" step="0.01" ${canEdit?'':'disabled'}`):''}</div><label class="field">Заметки<textarea id="session-notes" ${canEdit?'':'disabled'}>${esc(session.notes)}</textarea></label></section><div class="session-nav"><div class="buttons"><button class="secondary" data-action="session-exit">Сохранить и выйти</button>${s.correctingSession?`<button class="primary" data-action="save-correction">Готово</button>`:canEdit?`<button class="primary" data-action="finish-workout">Завершить</button>`:`<button class="outline" data-action="start-correction">Исправить результат</button>`}</div></div>`:''}`}
function ratingHTML(label,key){return `<div class="rating-wrap"><div class="between"><label for="rate-${esc(key)}">${esc(label)} (0–10)</label><output id="out-${esc(key)}">Выбери</output></div><input class="rating" id="rate-${esc(key)}" type="range" min="0" max="10" step="1" value="5" data-rating="${esc(key)}" data-chosen="0"></div>`}
function assessmentForm(phase,zones,optional=false){const ratings=phase==='before'?[['energy','Энергия']]:[['fatigue','Усталость'],['exertion','Тяжесть нагрузки']];return `${optional?'<p class="muted tiny">Оценки необязательны. Можно оставить «Нет данных».</p>':'<p class="warning">Выбери значение каждого ползунка явно, включая 0.</p>'}${ratings.map(([key,label])=>ratingHTML(label,key)).join('')}${zones.map(z=>ratingHTML(z.name,'pain:'+z.id)).join('')}`}
function readAssessment(form,phase,zones,optional=false){const values={pain:{}},fields=[...form.querySelectorAll('[data-rating]')];if(optional&&fields.every(x=>x.dataset.chosen!=='1'))return null;if(!optional&&fields.some(x=>x.dataset.chosen!=='1'))throw Error('Выбери каждую оценку самочувствия. 0 тоже нужно выбрать явно.');for(const f of fields){if(f.dataset.chosen!=='1')continue;const val=Number(f.value),key=f.dataset.rating;if(key.startsWith('pain:'))values.pain[key.slice(5)]=val;else values[key]=val;}return values;}
function promptStart(w){if(w.date>dateToday())throw Error('Начать будущую тренировку можно в назначенный день');const retrospective=w.date<dateToday();if(retrospective){persist(d=>{const session=markStarted(d,w,null,true);session.retrospective=true;});s.sessionId=w.id;return;}
 const zones=db().painZones.filter(x=>x.active).map(x=>({id:x.id,name:x.name}));modal('Самочувствие до тренировки',assessmentForm('before',zones),async(_,form)=>{const before=readAssessment(form,'before',zones);await persist(d=>markStarted(d,w,before,false));s.sessionId=w.id;},'Начать тренировку');}
function promptFinish(w){const ses=db().sessions[w.id];if(!ses)throw Error('Тренировка не начата');const optional=ses.retrospective===true;const left=Object.values(ses.sets||{}).flat().some(x=>!x.done);const status=left?'partial':'completed';const body=`${selectField('Итоговый статус','status',[['completed','Выполнено'],['partial','Частично выполнено']],status)}<p class="tiny muted">${left?'Есть неотмеченные подходы. Выбери итог сознательно.':'Все отмеченные подходы выполнены.'}</p><div class="hr"></div>${assessmentForm('after',ses.painZoneSnapshot,optional)}`;
 modal('Самочувствие после тренировки',body,async(f,form)=>{const after=readAssessment(form,'after',ses.painZoneSnapshot,optional);await persist(d=>{finishSession(d,w,f.get('status'),after,optional);});s.sessionId=null;notify('Тренировка сохранена');},'Завершить тренировку');}
function createProgramModal(){modal('Новая программа',`${field('Название','name','','text','required maxlength="100"')}${selectField('Тип','mode',[['repeat','Повторяющаяся неделя'],['finite','Конечная программа']])}${field('Количество недель (для конечной)','weeks',8,'number','min="1" max="52"')}${field('Дата начала','start',dateToday(),'date','required')}`,async f=>{const name=String(f.get('name')).trim(),mode=f.get('mode'),weeks=mode==='repeat'?1:Number(f.get('weeks'));if(!name||!Number.isInteger(weeks)||weeks<1||weeks>52)throw Error('Проверь название и срок программы');await persist(d=>{const p=makeProgram(name,mode,weeks,f.get('start'));d.programs.push(p);s.programId=p.id;s.week=0;s.weekday=0;s.editorDraft=null;});},'Создать программу');}
function exerciseChoices(){return db().exercises.filter(x=>x.active!==false).sort((a,b)=>a.category.localeCompare(b.category,'ru')||a.name.localeCompare(b.name,'ru'));}
function exerciseOptionsHTML(type='strength'){const category=TYPE[type]||'Силовая';const opts=exerciseChoices().sort((a,b)=>(a.category===category?0:1)-(b.category===category?0:1));return `<option value="" selected disabled>Выбери упражнение</option>`+opts.map(x=>`<option value="${esc(x.id)}">${esc(x.category)} · ${esc(x.name)}</option>`).join('');}
function exerciseRowHTML(){return `<div class="oneoff-row list-item"><div class="between"><strong>Упражнение</strong><button type="button" class="secondary smallbtn" data-action="remove-oneoff-row" aria-label="Удалить упражнение">×</button></div><label class="field">Выбери упражнение<select name="exercise" required>${exerciseOptionsHTML($('#modal-form [name=type]')?.value||'strength')}</select></label><div class="formgrid">${field('Подходы','sets',3,'number','min="1" max="30" required')}${field('Повторения','reps',10,'number','min="0" max="999" required')}</div>${field('Вес, кг (если нужен)','weight','','number','min="0" step="0.5"')}</div>`;}
function readExerciseRows(form){return [...form.querySelectorAll('.oneoff-row')].map(row=>{const id=row.querySelector('[name="exercise"]').value,bank=db().exercises.find(x=>x.id===id);const sets=Number(row.querySelector('[name="sets"]').value),reps=Number(row.querySelector('[name="reps"]').value),raw=row.querySelector('[name="weight"]').value,weight=raw===''?null:Number(raw);if(!bank||!Number.isInteger(sets)||sets<1||sets>30||!Number.isInteger(reps)||reps<0||reps>999||(weight!==null&&(!Number.isFinite(weight)||weight<0)))throw Error('Проверь параметры упражнения');return{id:uid(),exerciseId:bank.id,name:bank.name,how:bank.how||'',sets,reps,weight};});}
function createOneoffModal(date){const bank=exerciseChoices();const body=`${field('Дата','date',date||s.date,'date','required')}${field('Название тренировки','name','','text','required maxlength="100"')}${workoutTypeField('strength')}<h3 class="subhead">Упражнения</h3><p class="muted tiny">Добавь упражнения из банка и затем отметь фактически выполненные подходы. Для тенниса и кардио можно записать только длительность.</p><div id="oneoff-exercise-list"></div>${bank.length?'<button type="button" class="outline wide oneoff-add" data-action="add-oneoff-row">+ Добавить упражнение</button>':'<p class="warning">Банк упражнений пуст. Перейди в «Программы → Банк упражнений».</p>'}`;
 modal('Новая разовая тренировка',body,async(f,form)=>{const name=String(f.get('name')||'').trim(),date=String(f.get('date'));if(!name)throw Error('Введи название');const exercises=readExerciseRows(form);let newId;await persist(d=>{const w=addOneOff(d,date,name,f.get('type'),exercises);newId=w.id;});s.date=date;s.month=date.slice(0,7);s.sessionReturnTab=s.tab;s.sessionId=newId;s.correctingSession=false;s.expanded.clear();if(exercises[0])s.expanded.add(exercises[0].id);render();window.scrollTo(0,0);},'Создать и открыть');}
function promptSessionExercise(){const sess=db().sessions[s.sessionId];if(!sess||sess.source==='legacy'||(!s.correctingSession&&sess.status!=='in_progress'))throw Error('Сначала открой исправление результатов');if(!exerciseChoices().length)throw Error('Банк упражнений пуст');modal('Добавить упражнение к результатам',`<div class="oneoff-row">${selectField('Упражнение','exercise',exerciseChoices().map(x=>[x.id,`${x.category} · ${x.name}`]))}<div class="formgrid">${field('Подходы','sets',3,'number','required min="1" max="30"')}${field('Повторения','reps',10,'number','required min="0" max="999"')}</div>${field('Вес, кг','weight','','number','min="0" step="0.5"')}</div>`,async(f,form)=>{const ex=readExerciseRows(form)[0];await persist(d=>{const ss=d.sessions[s.sessionId];ss.exercisePlans.push(ex);ss.sets[ex.id]=createSetResults([ex])[ex.id];ss.updatedAt=new Date().toISOString();});s.expanded.add(ex.id);},'Добавить');}
function workoutTypeField(selected='strength'){return selectField('Тип занятия','type',Object.entries(TYPE).filter(([k])=>k!=='mixed').map(([k,v])=>[k,v]),selected)}
function addTemplateModal(existingIndex=null){const existing=existingIndex===null?null:currentEditorDay()[existingIndex];modal(existing?'Изменить тренировку':'Новая тренировка',`${field('Название','name',existing?.name||'','text','required maxlength="100"')}${workoutTypeField(existing?.type)}${field('Плановая длительность, мин','duration',existing?.duration??'','number','min="0" step="1"')}`,async f=>{const name=String(f.get('name')).trim();if(!name)throw Error('Нужно название');const type=f.get('type'),duration=f.get('duration')===''?null:Number(f.get('duration'));updateEditor(arr=>{if(existingIndex===null)arr.push({...template(name,type),duration});else Object.assign(arr[existingIndex],{name,type,duration});});});}
function addExerciseToWorkout(index){const t=currentEditorDay()[index];const choices=db().exercises.filter(x=>x.active!==false);if(!choices.length){modal('Нет упражнений',`<p class="muted">Сначала создай упражнение в «Программы → Банк упражнений».</p><button class="secondary wide" type="button" data-action="close-modal">Понятно</button>`);return;}
 modal(`Добавить в «${t.name}»`,`${selectField('Упражнение','exercise',choices.map(x=>[x.id,`${x.name} · ${x.category}`]))}<div class="formgrid">${field('Подходы','sets',3,'number','min="1" max="30" required')}${field('Повторения','reps',10,'number','min="0" max="999" required')}${field('Плановый вес, кг','weight','','number','min="0" step="0.5"')}</div>`,async f=>{const ex=db().exercises.find(x=>x.id===f.get('exercise')),sets=Number(f.get('sets')),reps=Number(f.get('reps')),weight=f.get('weight')===''?null:Number(f.get('weight'));if(!ex||sets<1||sets>30)throw Error('Недопустимые параметры');updateEditor(arr=>arr[index].exercises.push({id:uid(),exerciseId:ex.id,name:ex.name,how:ex.how||'',sets,reps,weight}));});}
function editPlannedExercise(tindex,index){
 const ex=currentEditorDay()[tindex]?.exercises[index];if(!ex)return;
 modal('Плановая нагрузка',`${field('Подходы','sets',ex.sets??1,'number','min="1" max="30" required')}${field('Повторения','reps',ex.reps??'','number','min="0" max="999" step="1"')}${field('Вес, кг','weight',ex.weight??'','number','min="0" step="0.5"')}${field('Примечание','notes',ex.notes||'')}`,async f=>{
 const sets=Number(f.get('sets'));if(!Number.isInteger(sets)||sets<1||sets>30)throw Error('Проверь число подходов');
 const reps=f.get('reps')===''?null:Number(f.get('reps')),weight=f.get('weight')===''?null:Number(f.get('weight'));
 updateEditor(day=>Object.assign(day[tindex].exercises[index],{sets,reps,weight,notes:String(f.get('notes')||'')}));
 });
}
function duplicateWeekModal(){const p=activeProg();if(p.mode==='repeat'){notify('Повторяющаяся программа уже использует одну неделю');return;}const options=p.weeks.map((_,i)=>`<label class="row list-item"><input type="checkbox" name="week" value="${i}" ${i>s.week?'checked':''}> Неделя ${i+1}</label>`).join('');modal('Дублировать неделю',`<p class="muted tiny">Копирование заменит содержание выбранных недель. Прошлые результаты тренировок останутся без изменений.</p>${options}`,async f=>{const weeks=f.getAll('week').map(Number).filter(x=>x!==s.week);await persist(d=>{const p=d.programs.find(x=>x.id===s.programId),copy=structuredClone(p.weeks[s.week]);for(const ix of weeks)p.weeks[ix]=structuredClone(copy);});});}
function promptEditDay(w){
 const session=db().sessions[w.id];
 if(session&&['completed','partial','in_progress','legacy'].includes(session.status)){if(session.status==='legacy'){notify('История 1.0 доступна только для просмотра');return;}s.sessionReturnTab=s.tab;s.sessionId=w.id;s.correctingSession=['completed','partial'].includes(session.status);s.expanded.clear();if(session.exercisePlans?.[0])s.expanded.add(session.exercisePlans[0].id);render();window.scrollTo(0,0);return;}
 const current=structuredClone(w.exercises||[]),bank=db().exercises.filter(x=>x.active!==false);
 const list=current.map((ex,i)=>`<label class="row list-item"><input type="checkbox" name="remove" value="${i}"> ${esc(ex.name)} · ${esc(ex.sets??1)}×${esc(ex.reps??'—')} · ${esc(ex.weight??'—')} кг <span class="mini">Убрать</span></label>`).join('')||'<p class="tiny muted">Упражнения ещё не добавлены.</p>';
 const add=bank.length?`${selectField('Добавить упражнение из банка (необязательно)','newEx',[['','Не добавлять'],...bank.map(x=>[x.id,x.name])],'')}
 <div class="formgrid">${field('Подходы','sets',3,'number','min="1" max="30"')}${field('Повторения','reps',10,'number','min="0" max="999"')}</div>${field('Вес, кг','weight','','number','min="0" step="0.5"')}`:'<p class="tiny muted">Создай упражнения в банке, чтобы добавить их к этой тренировке.</p>';
 modal('Изменить только эту дату',`${field('Название','name',w.name,'text','required')}${workoutTypeField(w.type)}${field('Плановая длительность, мин','duration',w.duration??'','number','min="0"')}<h3>Упражнения</h3>${list}${add}<p class="muted tiny">Снимок для других дат и программы не изменится. Чтобы добавить несколько упражнений, открой редактор повторно.</p>`,async f=>{
  const name=String(f.get('name')||'').trim();if(!name)throw Error('Введи название');
  const copy=structuredClone(w.exercises||[]).filter((_,i)=>!f.getAll('remove').includes(String(i)));
  if(f.get('newEx')){
   const item=db().exercises.find(x=>x.id===f.get('newEx')),sets=Number(f.get('sets')),reps=Number(f.get('reps'));
   const weight=f.get('weight')===''?null:Number(f.get('weight'));
   if(!item||!Number.isInteger(sets)||sets<1||sets>30||!Number.isInteger(reps)||reps<0)throw Error('Проверь параметры упражнения');
   copy.push({id:uid(),exerciseId:item.id,name:item.name,how:item.how||'',sets,reps,weight});
  }
  const snapshot={...w,id:w.id,name,type:f.get('type'),duration:f.get('duration')===''?null:Number(f.get('duration')),exercises:copy};
  await persist(d=>{d.overrides[w.id]=snapshot});
 });
}

function bankExerciseModal(id=null){
 const ex=db().exercises.find(x=>x.id===id);
 modal(ex?'Изменить упражнение':'Новое упражнение',`${field('Название *','name',ex?.name||'','text','required maxlength="120"')}${selectField('Основная категория *','category',[...db().categories.map(x=>[x,x]),['__new__','+ Новая категория…']],ex?.category)}${field('Новая категория (если выбрана выше)','newCategory','','text','maxlength="60"')}${field('Мышечные группы через запятую','muscles',ex?.muscles?.join(', ')||'')}${field('Оборудование (можно добавить новое)','equipment',ex?.equipment||'')}${field('Место (можно добавить новое)','location',ex?.location||'')}${selectField('Уровень','level',[['','Не указан'],['Начальный','Начальный'],['Средний','Средний'],['Продвинутый','Продвинутый']],ex?.level||'')}${field('Техника','how',ex?.how||'')}${field('Альтернативы (через запятую)','alternatives',(ex?.alternatives||[]).join(', '))}`,async f=>{
 const name=String(f.get('name')).trim();if(!name)throw Error('Нужно название');
 const muscles=String(f.get('muscles')||'').split(',').map(x=>x.trim()).filter(Boolean);
 const category=f.get('category')==='__new__'?String(f.get('newCategory')||'').trim():String(f.get('category'));if(!category)throw Error('Выбери категорию или добавь новую');const value={name,category,muscles,equipment:String(f.get('equipment')||'').trim(),location:String(f.get('location')||'').trim(),level:f.get('level'),how:f.get('how'),alternatives:String(f.get('alternatives')||'').split(',').map(x=>x.trim()).filter(Boolean)};
 await persist(d=>{
  if(!d.categories.includes(value.category))d.categories.push(value.category);for(const m of muscles)if(!d.muscles.includes(m))d.muscles.push(m);
  if(value.equipment&&!d.equipment.includes(value.equipment))d.equipment.push(value.equipment);
  if(value.location&&!d.locations.includes(value.location))d.locations.push(value.location);
  const item=d.exercises.find(x=>x.id===id);
  if(item){Object.assign(item,value);
   // Only descriptive properties propagate; actual completed session snapshots are never touched.
   for(const pr of d.programs)for(const week of pr.weeks)for(const day of week)for(const training of day)for(const planned of training.exercises||[]){if(planned.exerciseId===item.id){planned.name=value.name;planned.how=value.how;}}
   for(const planned of Object.values(d.overrides))if(planned?.date>=dateToday())for(const pe of planned?.exercises||[]){if(pe.exerciseId===item.id){pe.name=value.name;pe.how=value.how;}}
  }else d.exercises.push({id:uid(),source:'custom',active:true,favorite:false,...value});
 });
 });
}
function addReferenceModal(key='categories'){const fields=[['categories','Категория'],['muscles','Мышечная группа'],['equipment','Оборудование'],['locations','Место']];modal('Новое значение справочника',`${selectField('Справочник','kind',fields.map(([k,v])=>[k,v]),key)}${field('Название','name','','text','required')}`,async f=>{const key=f.get('kind'),val=String(f.get('name')).trim();if(!val)throw Error('Нужно название');await persist(d=>{if(!d[key].includes(val))d[key].push(val);});});}
function allMetrics(){return [...METRICS,...(db().customMetrics||[]).map(m=>[m.id,m.name,m.unit])];}
function addCustomMetricModal(){modal('Новый показатель тела',`${field('Название показателя','name','','text','required maxlength="60"')}${field('Единица измерения','unit','см','text','required maxlength="20"')}`,async f=>{
 const name=String(f.get('name')||'').trim(),unit=String(f.get('unit')||'').trim();
 if(!name||!unit)throw Error('Укажи название и единицу');
 await persist(d=>{d.customMetrics??=[];if(allMetrics().some(([,label])=>label.toLocaleLowerCase('ru')===name.toLocaleLowerCase('ru')))throw Error('Такой показатель уже есть');d.customMetrics.push({id:uid(),name,unit});});
 });}
function editMeasurementModal(id){const m=db().measurements.find(x=>x.id===id);if(!m)return;const metric=allMetrics().find(([key])=>key===m.metric);
 modal('Изменить измерение',`${field('Дата и время','at',m.measuredAt,'datetime-local','required')}${field(`Значение, ${metric?.[2]||m.unit}`,'value',m.value,'number','min="0" step="0.1" required')}`,async f=>{
  const value=Number(f.get('value'));if(!Number.isFinite(value)||value<0||(m.metric==='weight'&&value===0))throw Error('Укажи корректное значение');
  await persist(d=>Object.assign(d.measurements.find(x=>x.id===id),{measuredAt:String(f.get('at')),value,updatedAt:new Date().toISOString()}));
 });}
function openMeasurementModal(extended=false){const now=new Date(),at=`${dateISO(now)}T${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
 if(!extended){modal('Записать вес',`${field('Дата и время измерения','at',at,'datetime-local','required')}${field('Вес, кг','weight','','number','min="1" max="500" step="0.1" required')}`,async f=>{const value=Number(f.get('weight'));if(!Number.isFinite(value)||value<=0)throw Error('Введи корректный вес');await persist(d=>d.measurements.push({id:uid(),metric:'weight',measuredAt:f.get('at'),value,unit:'кг',createdAt:new Date().toISOString()}));});return;}
 modal('Добавить замеры',`${field('Дата и время','at',at,'datetime-local','required')}<p class="muted tiny">Заполняй только нужные показатели.</p><div class="formgrid">${allMetrics().filter(m=>m[0]!=='weight').map(([key,label,unit])=>field(`${label}, ${unit}`,key,'','number','min="0" step="0.1"')).join('')}</div>`,async f=>{const rows=allMetrics().filter(m=>m[0]!=='weight'&&f.get(m[0])!=='').map(([metric,,unit])=>({id:uid(),metric,measuredAt:f.get('at'),value:Number(f.get(metric)),unit,createdAt:new Date().toISOString()}));if(!rows.length)throw Error('Заполни хотя бы одно измерение');await persist(d=>d.measurements.push(...rows));});}
function compareBodyHTML(a,b){
 const ds=[...new Set(db().measurements.map(m=>m.measuredAt.slice(0,10)))].sort().reverse(),choices=ds.map(x=>[x,prettyDate(x)]);
 const left=measurementsOnDate(db(),a),right=measurementsOnDate(db(),b);
 const items=allMetrics().filter(([key])=>left[key]||right[key]);
 return `<div class="formgrid">${selectField('Дата 1','a',choices,a,'id="compare-a"')}${selectField('Дата 2','b',choices,b,'id="compare-b"')}</div><div class="table-scroll"><table class="comparison"><thead><tr><th>Показатель</th><th>${esc(prettyDate(a))}</th><th>${esc(prettyDate(b))}</th><th>Изменение</th></tr></thead><tbody>${items.map(([k,label,unit])=>{const x=left[k]?.value,y=right[k]?.value;const d=x==null||y==null?'Нет данных':`${Number((y-x).toFixed(2))>0?'+':''}${Number((y-x).toFixed(2))} ${unit}`;return `<tr><th>${esc(label)}</th><td>${x==null?'Нет данных':esc(x)}</td><td>${y==null?'Нет данных':esc(y)}</td><td>${esc(d)}</td></tr>`}).join('')}</tbody></table></div>`;
}
function compareBodyModal(){const ds=[...new Set(db().measurements.map(m=>m.measuredAt.slice(0,10)))].sort().reverse();if(ds.length<2){notify('Нужно хотя бы две даты замеров');return;}modal('Сравнить замеры',compareBodyHTML(ds[1],ds[0]));}
function goalModal(id=null){
 const g=db().goals.find(x=>x.id===id),options=allMetrics().map(([k,label])=>[k,label]),metric=g?.metric||'weight',last=lastMeasurement(db(),metric);
 modal(g?'Редактировать цель':'Новая цель',`${selectField('Показатель','metric',options,metric,g?'disabled':'id="goal-metric"')}${field('Начальное значение','baseline',g?.baseline??last?.value??'','number',g?'readonly':'required step="0.1"')}${field('Целевое значение','target',g?.target??'','number','required step="0.1"')}${field('Планируемая дата (необязательно)','due',g?.due||'','date')}`,async f=>{
 const target=Number(f.get('target'));if(!Number.isFinite(target)||f.get('target')==='')throw Error('Укажи целевое значение');
 if(g){await persist(d=>{const obj=d.goals.find(x=>x.id===id);if(obj.target!==target)obj.history.push({target,at:new Date().toISOString()});obj.target=target;obj.due=f.get('due')||null;});return;}
 const baseline=Number(f.get('baseline'));if(!Number.isFinite(baseline)||f.get('baseline')==='')throw Error('Укажи начальное значение');
 await persist(d=>d.goals.push({id:uid(),metric:f.get('metric'),baseline,target,due:f.get('due')||null,status:'active',history:[{target,at:new Date().toISOString()}],createdAt:new Date().toISOString()}));
 });
}
function zoneModal(id=null){
 const z=db().painZones.find(x=>x.id===id);
 modal(z?'Изменить болевую зону':'Новая болевая зона',`${selectField('Область тела','body',[['Колено','Колено'],['Стопа','Стопа'],['Спина','Спина'],['Плечо','Плечо'],['Локоть','Локоть'],['Запястье','Запястье'],['Бедро','Бедро'],['Другое','Другое']],z?.body||'Колено')}${selectField('Сторона','side',[['Левая','Левая'],['Правая','Правая'],['Обе','Обе'],['Без стороны','Без стороны']],z?.side||'Левая')}${field('Название','name',z?.name||'')}`,async f=>{
 const body=f.get('body'),side=f.get('side'),name=String(f.get('name')||'').trim()||(side==='Без стороны'?body:`${side} ${body.toLowerCase()}`);
 await persist(d=>{if(z){Object.assign(d.painZones.find(x=>x.id===id),{name,body,side});}else d.painZones.push({id:uid(),name,body,side,active:true});});
 });
}
function openExerciseHistory(id,metric=s.exerciseMetric){
 const r=allExResults().find(x=>x.id===id);if(!r){notify('Выполненных подходов пока нет');return;}
 s.exerciseModalId=id;s.exerciseMetric=metric;
 const rows=exerciseProgressSeries(db(),id,metric).map(x=>({label:prettyDate(x.date,{day:'numeric',month:'short'}),value:x.value}));
 const choices=[['weight','Макс. вес'],['volume','Объём'],['reps','Повторы']];
 const body=`<div class="seg">${choices.map(([key,label])=>`<button type="button" class="${metric===key?'active':''}" data-action="exercise-metric" data-value="${key}">${label}</button>`).join('')}</div><p class="tiny muted">${metric==='reps'?'Максимум повторений в одном выполненном подходе':metric==='volume'?'Сумма вес × повторения за занятие':'Максимальный фактически выполненный вес'}</p>${chartSvg(rows)}${r.rows.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(x=>`<div class="list-item"><strong>${prettyDate(x.date)} · ${esc(x.program)}</strong>${x.sets.map(y=>`<p class="tiny muted">${y.weight??'Нет данных'} кг × ${y.reps??'Нет данных'} повт.</p>`).join('')}</div>`).join('')}`;
 if($('#dialog').open){$('#dialog-title').textContent=r.name;$('#dialog-content').innerHTML=body;}else modal(r.name,body);
}
function exportEncrypted(raw,filename){const blob=new Blob([raw],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),120000);}
async function backupExport(){await dbStore.queue;exportEncrypted(dbStore.encryptedExport(),`trenirovki-v2-${dateToday()}.encrypted.json`);if(confirm('Файл действительно сохранён в «Файлы» вне приложения?')){await persist(d=>{d.settings.lastExportAt=new Date().toISOString()});notify('Дата подтверждённого экспорта обновлена');}else notify('Файл подготовлен. Проверь его сохранение в «Файлы».');}
async function backupImport(){await dbStore.queue;exportEncrypted(dbStore.encryptedExport(),`trenirovki-v2-before-restore-${dateToday()}.encrypted.json`);if(!confirm('Перед восстановлением нужно сохранить страховочную зашифрованную копию текущей базы в «Файлы». Ты её сохранил?'))return;$('#backup-file').click();}
async function openBackupFile(file){const raw=await file.text();modal('Восстановить резервную копию',`<p class="warning">Восстановление полностью заменит текущую базу. Страховочная копия должна быть сохранена отдельно.</p>${field('Пароль от резервного файла','password','','password','required')}`,async f=>{const pw=f.get('password');await dbStore.validateBackup(raw,pw);if(!confirm('Заменить все текущие данные содержимым выбранной копии?'))throw Error('Восстановление отменено');await dbStore.restoreBackup(raw,pw);if(!db().settings?.starterLibraryVersion)await dbStore.change(d=>ensureStarterExercises(d));s.sessionId=null;notify('Резервная копия проверена и восстановлена');},'Восстановить');}
function backupReminder(){const d=db();if(!d?.settings.backupReminder)return;const last=d.settings.lastExportAt;if(!last||Date.now()-new Date(last).getTime()>=7*864e5)notify('Напоминание: создай зашифрованную резервную копию в профиле');}
document.addEventListener('click',async e=>{
 const nav=e.target.closest('[data-tab]');if(nav){navigate(nav.dataset.tab);return;}
 const t=e.target.closest('button[data-action]');if(!t)return;
 const action=t.dataset.action,id=t.dataset.id,value=t.dataset.value,date=t.dataset.date;
 try{
 if(action==='close-modal'){closeModal();return;}
 if(action==='month-prev'||action==='month-next'){const [y,m]=s.month.split('-').map(Number);const n=new Date(y,m-1+(action==='month-next'?1:-1),1,12);s.month=dateISO(n).slice(0,7);s.date=dateISO(n);render();return;}
 if(action==='cal-today'){s.date=dateToday();s.month=s.date.slice(0,7);render();return;}
 if(action==='calendar-mode'){s.calMode=value;render();return;}
 if(action==='select-date'){s.date=date;s.month=date.slice(0,7);render();return;}
 if(action==='add-oneoff'){createOneoffModal(date);return;}
 if(action==='open-workout'){s.date=date;s.sessionReturnTab=s.tab;s.sessionId=id;s.correctingSession=false;s.expanded.clear();const w=findWorkout(id,date);const sess=db().sessions[id];const first=(sess?.exercisePlans||w?.exercises||[])[0];if(first)s.expanded.add(first.id);render();window.scrollTo(0,0);return;}
 if(action==='edit-day'){const w=findWorkout(id,date);if(w)promptEditDay(w);return;}
 if(action==='add-oneoff-row'){const list=$('#oneoff-exercise-list');if(list){list.insertAdjacentHTML('beforeend',exerciseRowHTML());list.lastElementChild?.scrollIntoView({block:'nearest'});}return;}
 if(action==='remove-oneoff-row'){t.closest('.oneoff-row')?.remove();return;}
 if(action==='programs-mode'){s.programTab=value;render();return;}
 if(action==='new-program'){createProgramModal();return;}
 if(action==='edit-program'){s.programId=id;s.week=0;s.weekday=0;createEditorDraft();render();return;}
 if(action==='back-programs'){if(!discardUnsaved())return;s.programId=null;s.editorDraft=null;render();return;}
 if(action==='choose-week'){if(!discardUnsaved())return;s.week=Number(value);createEditorDraft();render();return;}
 if(action==='choose-weekday'){if(!discardUnsaved())return;s.weekday=Number(value);createEditorDraft();render();return;}
 if(action==='add-template'){addTemplateModal();return;}
 if(action==='edit-template'){addTemplateModal(Number(t.dataset.index));return;}
 if(action==='add-exercise-to-workout'){addExerciseToWorkout(Number(t.dataset.tindex));return;}
  if(action==='edit-planned-exercise'){editPlannedExercise(Number(t.dataset.tindex),Number(t.dataset.index));return;}
 if(action==='remove-template-exercise'){if(!confirm('Убрать упражнение из черновика? История сохранится.'))return;const wi=Number(t.dataset.tindex),ix=Number(t.dataset.index);updateEditor(arr=>arr[wi].exercises.splice(ix,1));return;}
 if(action==='remove-template'){if(!confirm('Убрать тренировку из черновика? История сохранится.'))return;const ix=Number(t.dataset.index);updateEditor(arr=>arr.splice(ix,1));return;}
 if(action==='save-program-day'){saveProgramDayModal();return;}
  if(action==='duplicate-week'){if(editorDirty()){notify('Сначала сохрани изменения дня');return;}duplicateWeekModal();return;}
 if(action==='edit-program-meta'){const p=activeProg();modal('Название программы',field('Название','name',p.name,'text','required'),async f=>await persist(d=>{d.programs.find(x=>x.id===s.programId).name=String(f.get('name'))}));return;}
 if(action==='archive-program'){if(!confirm('Отправить программу в архив? Будущее расписание будет остановлено.'))return;await persist(d=>archiveProgram(d.programs.find(p=>p.id===id),dateToday()));return;}
 if(action==='restore-program'){modal('Восстановить программу',field('Дата возобновления','date',dateToday(),'date','required'),async f=>await persist(d=>restoreProgram(d.programs.find(p=>p.id===id),f.get('date'))));return;}
 if(action==='delete-program'){if(!confirm('Окончательно удалить неиспользованную программу?'))return;await persist(d=>{if(Object.values(d.sessions).some(x=>x.programId===id))throw Error('Программа содержит историю. Используй архив.');d.programs=d.programs.filter(x=>x.id!==id)});return;}
 if(action==='bank-category'){s.bankCat=value;render();return;}
 if(action==='toggle-favorite'){await persist(d=>{const x=d.exercises.find(v=>v.id===id);if(x)x.favorite=!x.favorite;});return;}
 if(action==='hide-exercise'){if(!confirm('Скрыть упражнение из активного банка? История сохранится.'))return;await persist(d=>{const x=d.exercises.find(v=>v.id===id);if(x)x.active=false;});return;}
  if(action==='restore-exercise'){await persist(d=>{const x=d.exercises.find(v=>v.id===id);if(x)x.active=true;});return;}
  if(action==='delete-exercise'){if(exerciseUsed(id))throw Error('Упражнение используется. Скрывай его, чтобы сохранить историю.');if(!confirm('Окончательно удалить неиспользованное упражнение?'))return;await persist(d=>d.exercises=d.exercises.filter(x=>x.id!==id));return;}
 if(action==='new-exercise'||action==='edit-exercise'){bankExerciseModal(action==='edit-exercise'?id:null);return;}
 if(action==='add-reference'){addReferenceModal(value||'categories');return;}
  if(action==='rename-reference'){renameReferenceModal(value,Number(t.dataset.index));return;}
  if(action==='delete-reference'){const ix=Number(t.dataset.index),old=db()[value]?.[ix];if(old===undefined)return;if(referenceUsage(db(),value,old)){notify('Значение используется. Сначала измени упражнения.');return;}if(!confirm('Удалить неиспользуемое значение?'))return;await persist(d=>d[value].splice(ix,1));return;}
 if(action==='progress-mode'){s.progressTab=value;render();return;}
 if(action==='add-weight'||action==='add-measurements'){openMeasurementModal(action==='add-measurements');return;}
  if(action==='add-custom-metric'){addCustomMetricModal();return;}
  if(action==='edit-measurement'){editMeasurementModal(id);return;}
 if(action==='compare-body'){compareBodyModal();return;}
 if(action==='delete-measurement'){if(!confirm('Удалить эту запись измерения?'))return;await persist(d=>d.measurements=d.measurements.filter(m=>m.id!==id));return;}
 if(action==='exercise-history'){openExerciseHistory(value);return;}
 if(action==='exercise-metric'){openExerciseHistory(s.exerciseModalId,value);return;}
 if(action==='report-mode'){s.reportMode=value;render();return;}
 if(action==='report-prev'||action==='report-next'){const direction=action==='report-prev'?-1:1;s.reportDate=s.reportMode==='week'?addDays(s.reportDate,7*direction):dateISO(new Date(Number(s.reportDate.slice(0,4)),Number(s.reportDate.slice(5,7))-1+direction,8,12));render();return;}
 if(action==='edit-profile'){const p=db().settings.profile;modal('Мои данные',`${field('Рост, см','height',p.height||'','number','min="0"')}${field('Дата рождения','birth',p.birth||'','date')}`,async f=>await persist(d=>d.settings.profile={height:f.get('height'),birth:f.get('birth')}));return;}
 if(action==='new-goal'){goalModal();return;}
 if(action==='edit-goal'){goalModal(id);return;}
 if(action==='restore-goal'){await persist(d=>d.goals.find(x=>x.id===id).status='active');return;}
 if(action==='delete-goal'){if(!confirm('Удалить цель? История измерений останется.'))return;await persist(d=>d.goals=d.goals.filter(x=>x.id!==id));return;}
 if(action==='archive-goal'){await persist(d=>d.goals.find(x=>x.id===id).status='archived');return;}
 if(action==='new-zone'){zoneModal();return;}
 if(action==='edit-zone'){zoneModal(id);return;}
  if(action==='move-zone'){await persist(d=>{const a=d.painZones,ix=a.findIndex(z=>z.id===id),change=value==='up'?-1:1,to=ix+change;if(ix>=0&&to>=0&&to<a.length)[a[ix],a[to]]=[a[to],a[ix]];});return;}
 if(action==='archive-zone'){await persist(d=>d.painZones.find(x=>x.id===id).active=false);return;}
 if(action==='restore-zone'){const zones=db().painZones.filter(x=>!x.active);if(!zones.length){notify('Нет архивных зон');return;}modal('Восстановить зону',selectField('Зона','zone',zones.map(x=>[x.id,x.name])),async f=>await persist(d=>d.painZones.find(x=>x.id===f.get('zone')).active=true));return;}
 if(action==='change-password'){modal('Изменить пароль',`${field('Текущий пароль','old','','password','required')}${field('Новый пароль','new','','password','required minlength="12"')}${field('Повтори новый пароль','confirm','','password','required minlength="12"')}`,async f=>{if(f.get('new')!==f.get('confirm'))throw Error('Пароли не совпадают');await dbStore.changePassword(f.get('old'),f.get('new'));notify('Пароль изменён');});return;}
 if(action==='lock'){await dbStore.lock();showAuth();return;}
 if(action==='backup-export'){await backupExport();return;}
 if(action==='backup-import'){await backupImport();return;}
 if(action==='session-exit'){navigate(s.sessionReturnTab||'today');return;}
 if(action==='add-session-exercise'){promptSessionExercise();return;}
 if(action==='remove-session-exercise'){const exid=t.dataset.exid,ses=db().sessions[s.sessionId];if(!ses||(!s.correctingSession&&ses.status!=='in_progress'))throw Error('Открой исправление результатов');if(!confirm('Убрать это упражнение и его подходы из результатов этой тренировки? Действие нельзя отменить.'))return;await persist(d=>{const item=d.sessions[s.sessionId];item.exercisePlans=item.exercisePlans.filter(x=>x.id!==exid);delete item.sets[exid];item.updatedAt=new Date().toISOString();});s.expanded.delete(exid);return;}
 if(action==='start-correction'){s.correctingSession=true;render();return;}
 if(action==='save-correction'){s.correctingSession=false;render();notify('Исправления сохранены');return;}
 if(action==='start-workout'){const w=findWorkout(id,date);if(w)await promptStart(w);return;}
 if(action==='finish-workout'){const ses=db().sessions[s.sessionId],w=ses&&findWorkout(ses.id,ses.date);if(w)promptFinish(w);return;}
 if(action==='reopen-session'){s.correctingSession=true;render();return;}
 }catch(ex){err(ex)}
});
document.addEventListener('input',e=>{const t=e.target;
 if(t.matches('[data-rating]')){t.dataset.chosen='1';const out=document.getElementById('out-'+t.dataset.rating);if(out)out.textContent=t.value;return;}
 if(t.id==='bank-search'){s.bankQuery=t.value;return;}
 if(t.id==='exercise-search'){s.search=t.value;return;}
 if(t.id==='session-notes'){return;}
});
document.addEventListener('toggle',e=>{if(!e.target?.matches?.('details.exercise-row[data-exid]'))return;const id=e.target.dataset.exid;if(e.target.open)s.expanded.add(id);else s.expanded.delete(id);},true);
document.addEventListener('change',async e=>{const t=e.target;try{
 if(t.id==='wellness-zone'){s.wellnessZone=t.value;render();return;}
 if(t.id==='wellness-period'){s.wellnessPeriod=t.value;render();return;}
 if(t.id==='report-program'){s.reportProgram=t.value;render();return;}
 if(t.id==='report-type'){s.reportType=t.value;render();return;}
 if(t.id==='compare-a'||t.id==='compare-b'){$('#dialog-content').innerHTML=compareBodyHTML($('#compare-a').value,$('#compare-b').value);return;}
 if(t.id==='goal-metric'){const input=$('#modal-form [name="baseline"]');if(input)input.value=lastMeasurement(db(),t.value)?.value??'';return;}

 if(t.id==='backup-reminder'){await persist(d=>d.settings.backupReminder=t.checked);return;}
 if(t.id==='backup-file'){const f=t.files?.[0];t.value='';if(f)await openBackupFile(f);return;}
 if(t.id==='bank-search'){s.bankQuery=t.value;render();return;}
 if(t.id==='bank-muscle'){s.bankMuscle=t.value;render();return;}
 if(t.id==='bank-equipment'){s.bankEquipment=t.value;render();return;}
 if(t.id==='bank-location'){s.bankLocation=t.value;render();return;}
  if(t.id==='bank-level'){s.bankLevel=t.value;render();return;}
  if(t.id==='bank-source'){s.bankSource=t.value;render();return;}
 if(t.id==='bank-favorites'){s.bankOnlyFav=t.checked;render();return;}
  if(t.id==='bank-archived'){s.bankShowArchived=t.checked;render();return;}
 if(t.id==='exercise-search'){s.search=t.value;render();return;}
 if(t.dataset.action==='toggle-set'||t.dataset.action==='edit-set'){
   const id=s.sessionId,ex=t.dataset.ex,ix=Number(t.dataset.index),fld=t.dataset.field;
   await persist(d=>{const r=d.sessions[id]?.sets?.[ex]?.[ix];if(!r)throw Error('Подход не найден');if(d.sessions[id]?.status!=='in_progress'&&!s.correctingSession)throw Error('Открой исправление результатов');if(t.dataset.action==='toggle-set')r.done=t.checked;else r[fld]=t.value===''?null:Number(t.value);d.sessions[id].updatedAt=new Date().toISOString();});return;
 }
 if(t.dataset.sessionField){const id=s.sessionId,key=t.dataset.sessionField;await persist(d=>{if(d.sessions[id]?.status!=='in_progress'&&!s.correctingSession)throw Error('Открой исправление результатов');d.sessions[id][key]=t.value===''?null:Number(t.value);d.sessions[id].updatedAt=new Date().toISOString()});return;}
 if(t.id==='session-notes'){await persist(d=>{if(d.sessions[s.sessionId]?.status!=='in_progress'&&!s.correctingSession)throw Error('Открой исправление результатов');d.sessions[s.sessionId].notes=t.value});return;}
 }catch(ex){err(ex)}});
let skipLegacyImport=false;
function showAuth(){s.sessionId=null;$('#app').hidden=true;$('#auth').hidden=false;$('#auth-error').textContent='';const hasV2=dbStore.hasV2(),hasV1=dbStore.hasV1()&&!skipLegacyImport;$('#auth-title').textContent=hasV2?'Введи пароль':hasV1?'Перенос дневника 1.0':'Создать защищённое хранилище';$('#auth-desc').textContent=hasV2?'Открой зашифрованный дневник.':hasV1?'Используем пароль от 1.0 и перенесём записи в отдельную базу 2.0, не удаляя оригинал.':'Личные данные хранятся только на этом устройстве.';$('#auth-confirm-wrap').hidden=hasV2||hasV1;$('#auth-start-fresh').hidden=hasV2||!hasV1;$('#auth-import-v1').hidden=hasV2;$('#auth-submit').textContent=hasV2?'Открыть':hasV1?'Перенести данные':'Создать хранилище';$('#auth-pass').value='';$('#auth-confirm').value='';}
$('#auth-form').addEventListener('submit',async e=>{e.preventDefault();const password=$('#auth-pass').value,btn=$('#auth-submit');btn.disabled=true;$('#auth-error').textContent='';try{
 if(password.length<12)throw Error('Пароль должен содержать не менее 12 символов');
 if(dbStore.hasV2())await dbStore.open(password);
 else if(dbStore.hasV1()&&!skipLegacyImport){
  const raw=localStorage.getItem(V1_KEY),env=JSON.parse(raw),{data}=await unlockEnvelope(env,password,V1_FORMAT);
  const response=await fetch('./legacy-plan.json');if(!response.ok)throw Error('Не удалось загрузить каталог исходной программы');const oldPlan=await response.json();
  const migrated=migrateV1(data,oldPlan);await dbStore.create(password,migrated);
 }else{
  if(password!==$('#auth-confirm').value)throw Error('Пароли не совпадают');
  await dbStore.create(password,blankDB());
 }
 if(!db().settings?.starterLibraryVersion)await dbStore.change(d=>ensureStarterExercises(d));
 $('#auth-pass').value='';$('#auth-confirm').value='';render();backupReminder();
 }catch(ex){$('#auth-error').textContent=ex?.message||'Не удалось открыть базу';}finally{btn.disabled=false}});
$('#auth-start-fresh').addEventListener('click',()=>{if(dbStore.hasV2())return;skipLegacyImport=true;showAuth();});
// Separate HTTPS preview origins cannot read Safari/PWA localStorage from 1.0.
// This local-file migration creates a new encrypted 2.0 database without changing
// the imported file or the encrypted records in the existing 1.0 installation.
$('#auth-import-v1').addEventListener('click',()=>{
 if(dbStore.hasV2()){showAuth();return;}
 $('#auth-error').textContent='';$('#auth-import-file').value='';$('#auth-import-file').click();
});
$('#auth-import-file').addEventListener('change',async e=>{
 const file=e.target.files?.[0];if(!file)return;
 const button=$('#auth-import-v1'),submit=$('#auth-submit');button.disabled=true;submit.disabled=true;
 $('#auth-error').textContent='';
 try{
  if(dbStore.hasV2())throw Error('Хранилище 2.0 уже существует. Импорт в существующую базу запрещён.');
  const password=$('#auth-pass').value;
  if(password.length<12)throw Error('Сначала введи пароль от копии 1.0 (не менее 12 символов)');
  if(file.size>20*1024*1024)throw Error('Файл резервной копии слишком большой');
  const env=JSON.parse(await file.text());
  const {data}=await unlockEnvelope(env,password,V1_FORMAT);
  const response=await fetch('./legacy-plan.json');if(!response.ok)throw Error('Не удалось загрузить структуру программы 1.0');
  const converted=migrateV1(data,await response.json());
  // Confirm the import results before committing a new encrypted storage key.
  if(!confirm(`Перенести ${converted.legacy?.counts?.dates??0} дат из резервной копии 1.0 в новое защищённое хранилище 2.0? Исходная копия не изменится.`))return;
  await dbStore.create(password,converted);
  $('#auth-pass').value='';render();backupReminder();
 }catch(ex){$('#auth-error').textContent=ex?.message||'Не удалось перенести файл 1.0';}
 finally{button.disabled=false;submit.disabled=false;e.target.value='';}
});
if('serviceWorker' in navigator&&(location.protocol==='https:'||location.hostname==='localhost'||location.hostname==='127.0.0.1'))navigator.serviceWorker.register('./sw.js').catch(ex=>console.warn('PWA registration unavailable',ex));
showAuth();

window.addEventListener('beforeunload',e=>{if(editorDirty()){e.preventDefault();e.returnValue='';}});