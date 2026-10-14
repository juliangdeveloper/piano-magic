// Bench legato con muestras reales (University of Iowa MIS, Piano.mf.*.aiff → f32le 48 kHz mono en /workspace/pianos).
var fs=require('fs'),P=require('/workspace/piano-magic/js/pitch.js'),M=require('/workspace/piano-magic/js/instrument/mic-notes.js');
var SR=48000,N=2048,HOP=Math.round(SR*M.HOP_MS/1000);var cache={};
function load(f){if(!cache[f]){var b=fs.readFileSync(f);var x=new Float32Array(b.buffer,b.byteOffset,b.length/4);var o=0;for(;o<x.length;o++)if(Math.abs(x[o])>0.02)break;var pk=0;for(var i=o;i<o+SR;i++)pk=Math.max(pk,Math.abs(x[i]));cache[f]=x.subarray(Math.max(0,o-100)).map(v=>v/pk*0.5);}return cache[f];}
var mels={'C4-D4-E4-F4':['C4','D4','E4','F4','E4','D4','C4'],'E3-G3-D4':['E3','G3','D4','E3','G3','D4','B3','A3']};
var tot=0,hit=0,fals=0,lat=[];
Object.keys(mels).forEach(function(mk){[100,120,80].forEach(function(bpm){['damper','pedal'].forEach(function(mode){['','.mic'].forEach(function(suf){[1,0.1].forEach(function(g){
 var seq=mels[mk],step=Math.round(SR*60/bpm/(bpm>=120?2:1)),y=new Float32Array(step*(seq.length+3));
 seq.forEach(function(n,k){var x=load(n+suf+'.raw');for(var i=0;i<SR*2.5&&k*step+i<y.length&&i<x.length;i++){var env=(mode==='damper'&&i>step)?Math.exp(-(i-step)/(SR*0.08)):1;y[k*step+i]+=x[i]*g*env;}});
 for(var i=0;i<y.length;i++)y[i]+=(Math.random()-.5)*0.0006;
 var st=M.create(),ons=[];for(var p=N;p<=y.length;p+=HOP){var o=M.observe(st,y.subarray(p-N,p),SR,P);var ev=M.hop(st,{midi:o.name?o.midi:null,name:o.name});if(ev.on)ons.push([ev.on,p/SR]);}
 var got=[];seq.forEach(function(n,k){tot++;var t0=k*step/SR,t1=t0+step/SR;var f=ons.find(o=>o[0]===n&&o[1]>=t0&&o[1]<t1+0.05);if(f){hit++;lat.push(f[1]-t0);got.push(n+'('+Math.round((f[1]-t0)*1000)+')');}else got.push('×'+n);});
 var exp=seq.length;fals+=Math.max(0,ons.filter(o=>seq.indexOf(o[0])<0).length);
 if(process.env.V)console.log(mk,bpm,mode,suf||'flat',g,got.join(' '),'| ons',ons.map(o=>o[0]).join(' '));});});});});});
lat.sort((a,b)=>a-b);console.log('detección',hit+'/'+tot,Math.round(100*hit/tot)+'%','· notas ajenas',fals,'· latencia mediana',Math.round(1000*lat[lat.length>>1]),'ms p90',Math.round(1000*lat[Math.floor(lat.length*.9)]),'ms');
