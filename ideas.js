/* Considered trip Ideas: optional location, dates, times and constraints. */
(function(root){
'use strict';
const calendar=root.VacationItinerary;
if(!calendar)throw Error('Itinerary date utilities must load before Ideas.');
const checked=value=>value===true||value==='on'||value==='true'||value==='1';
function normalizeDraft(source={}){
 return {...source,
  date:String(source.date||''),
  endDate:String(source.endDate||''),
  time:calendar.canonicalTime(source.time),
  endTime:calendar.canonicalTime(source.endTime),
  fixedDate:checked(source.fixedDate)
 };
}
function validateDraft(idea){
 if(!String(idea.name||'').trim())return 'Enter an idea, activity, or place.';
 if(idea.fixedDate&&!idea.date)return 'Select a date for this fixed-date idea.';
 if(idea.endDate&&!idea.date)return 'Select a start date before the end date.';
 if(idea.date&&idea.endDate&&idea.endDate<idea.date)return 'End date must be on or after the start date.';
 for(const field of ['time','endTime']){
  if(idea[field]&&!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(idea[field]))return 'Enter a valid local time.';
 }
 if(idea.endTime&&!idea.time)return 'Enter a start time before the end time.';
 if(idea.time&&idea.endTime&&idea.endTime<=idea.time)return 'End time must follow start time.';
 return '';
}
function fromItinerary(activity){
 return {name:activity.title,category:activity.category||'Other',notes:activity.notes||'',hours:activity.hours||'',
 date:activity.date||'',endDate:activity.endDate||'',time:activity.time||'',endTime:activity.endTime||'',
 fixedDate:!!activity.fixedDate,lat:activity.lat??null,lng:activity.lng??null};
}
function filterForList(rows,category='all',query=''){
 const needle=String(query||'').trim().toLocaleLowerCase();
 return rows.filter(x=>(category==='all'||x.category===category)&&(!needle||
  [x.name,x.notes,x.location,x.category].some(v=>String(v||'').toLocaleLowerCase().includes(needle))));
}
root.VacationIdeas=Object.freeze({normalizeDraft,validateDraft,fromItinerary,filterForList});
})(window);
