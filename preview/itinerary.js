/* Trip itinerary domain: local-time schedule, fixed dates, priorities and reservations.
   Times are interpreted as wall-clock times at the destination, never as UTC. */
(function(root){
'use strict';
const RESERVATION_STATUSES=['none','needed','booked'];
const boolean=value=>value===true||value==='on'||value==='true'||value==='1';
function canonicalTime(value){
 const raw=String(value??'').trim();
 if(!raw)return '';
 return /^([01][0-9]|2[0-3]):[0-5][0-9](?::[0-5][0-9])?$/.test(raw)?raw.slice(0,5):raw;
}
function normalizeDraft(source={}){
 const record={...source};
 record.time=canonicalTime(record.time);
 record.endTime=canonicalTime(record.endTime);
 record.fixedDate=boolean(record.fixedDate);
 record.mustDo=boolean(record.mustDo);
 record.reservationStatus=RESERVATION_STATUSES.includes(record.reservationStatus)?record.reservationStatus:'none';
 record.confirmationCode=String(record.confirmationCode??'').trim();
 record.bookingUrl=String(record.bookingUrl??'').trim();
 if(record.category!=='Lodging')record.endDate='';
 return record;
}
function validateDraft(record){
 if(!String(record.title??'').trim())return 'Enter an activity or stop.';
 if(record.category==='Lodging'&&(!record.date||!record.endDate||record.endDate<=record.date))return 'Lodging checkout must be after check-in.';
 if(record.fixedDate&&!record.date)return 'Select a date for a fixed-date event.';
 for(const name of ['time','endTime']){
  if(record[name]&&!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(record[name]))return 'Enter a valid local time.';
 }
 if(record.endTime&&!record.time)return 'Enter a start time before an end time.';
 if(record.time&&record.endTime&&record.endTime<=record.time)return 'End time must follow start time on the same day.';
 if(record.bookingUrl&&!/^https?:\/\/[^\s]+$/i.test(record.bookingUrl))return 'Booking link must be an http:// or https:// URL.';
 return '';
}
function formatTime(value){
 const raw=canonicalTime(value);
 if(!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(raw))return '';
 const [hours,minutes]=raw.split(':').map(Number);
 return ((hours+11)%12+1)+':'+String(minutes).padStart(2,'0')+(hours>=12?' PM':' AM');
}
function compareEntries(a,b){
 const date=(a.date||'9999-12-31').localeCompare(b.date||'9999-12-31');
 if(date)return date;
 const time=(canonicalTime(a.time)||'99:99').localeCompare(canonicalTime(b.time)||'99:99');
 if(time)return time;
 if(Boolean(a.mustDo)!==Boolean(b.mustDo))return a.mustDo?-1:1;
 return String(a.title||'').localeCompare(String(b.title||''));
}
function outsideTrip(entry,trip){
 if(!entry?.date||!trip)return false;
 return !!((trip.start&&entry.date<trip.start)||(trip.end&&entry.date>trip.end));
}
function filterForView(rows,view='all'){
 if(view==='unscheduled')return rows.filter(x=>!x.date);
 if(view==='booking')return rows.filter(x=>x.reservationStatus==='needed');
 if(view==='mustdo')return rows.filter(x=>!!x.mustDo);
 return rows;
}
root.VacationItinerary=Object.freeze({normalizeDraft,validateDraft,formatTime,compareEntries,outsideTrip,canonicalTime,filterForView,RESERVATION_STATUSES:Object.freeze(RESERVATION_STATUSES)});
})(window);
