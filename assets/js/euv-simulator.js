(function(){
var S=[
{cat:"gen",t:"EUV source",s:"Tin plasma, 13.5 nm",title:"EUV source (laser-produced plasma)",
h:"Tin droplets about 25 µm across are fired at roughly 50,000 per second. A weak pre-pulse flattens each droplet into a thin disk, then a high-power CO₂ laser pulse turns it into a plasma of around 200,000 °C that radiates at 13.5 nm.",
e:"Only a few percent of laser energy becomes usable in-band EUV, so tens of kilowatts of drive laser feed a few hundred watts of EUV. Tin debris, droplet timing, and pulse-to-pulse dose stability are the core problems, and hydrogen gas flow sweeps debris away from the optics.",
k:["Wavelength 13.5 nm, about 92 eV per photon","Roughly 2% usable bandwidth","About 50,000 droplets per second"]},
{cat:"gen",t:"Collector + IF",s:"Multilayer mirror",title:"Collector and intermediate focus",
h:"A large ellipsoidal mirror surrounds the plasma. The plasma sits at one focus and the light is re-imaged to the second focus, the intermediate focus (IF), which is the handoff point into the scanner.",
e:"Every EUV mirror is a Bragg reflector of roughly 40 to 50 Mo/Si bilayers, each about 6.9 nm thick, peaking near 70% reflectivity. Tin deposition and heat slowly degrade the collector, so in-situ hydrogen-radical cleaning and lifetime management drive tool uptime.",
k:["Mo/Si multilayer coating","Peak reflectivity near 70%","Vacuum with low-pressure hydrogen"]},
{cat:"opt",t:"Illuminator",s:"Shapes the pupil",title:"Illuminator",
h:"Two facet mirrors act like a fly’s-eye integrator. The field facet mirror chops the beam into many channels that overlap into a uniform arc-shaped slit, and the pupil facet mirror sets the angles at which light strikes the mask.",
e:"Each layer wants its own pupil shape, such as dipole, quadrupole, or freeform, chosen by source-mask optimization. Tight pupils boost image contrast but can throw light away, so pupil fill trades imaging quality against throughput.",
k:["Köhler-type illumination","Programmable pupil shapes","Uniform scanning slit"]},
{cat:"mech",t:"Reticle stage",s:"Reflective mask",title:"Reticle stage and reflective mask",
h:"EUV masks reflect rather than transmit. A low-thermal-expansion substrate carries the Mo/Si mirror stack with an absorber pattern on top. Light arrives off-axis, about 6° on 0.33 NA tools, and the mask scans in sync with the wafer.",
e:"Oblique incidence causes mask 3D effects such as shadowing and pattern-dependent focus shifts. Buried multilayer defects are hard to repair, and pellicles must survive EUV heating while staying highly transparent. With 8x reduction along the scan, the reticle stage moves 8 times faster than the wafer stage.",
k:["Reflective Mo/Si mask with absorber pattern","High-NA pattern is 4x across and 8x along the scan","Scans in lockstep with the wafer"]},
{cat:"opt",t:"Projection optics",s:"Anamorphic 4x / 8x",title:"Projection optics (High-NA)",
h:"An all-reflective mirror train demagnifies the mask onto the wafer. Raising NA from 0.33 to 0.55 captures wider diffraction angles, so finer pitches still send enough diffraction orders into the lens to form an image.",
e:"Mirror figure errors must be held to the tens-of-picometers range across large apertures. To keep mask incidence angles manageable, the design is anamorphic, 4x across and 8x along the scan, which halves the exposure field. It also uses a central obscuration.",
k:["Numerical aperture 0.55","Anamorphic 4x / 8x reduction","Exposure field 26 × 16.5 mm"]},
{cat:"mech",t:"Wafer stage",s:"Resist + scan stage",title:"Wafer stage and resist",
h:"The wafer sits on an electrostatic chuck, since vacuum clamping doesn’t work in vacuum, on a magnetically levitated stage that scans under the slit while metrology tracks position, focus, and alignment.",
e:"Depth of focus shrinks as 1/NA², so leveling and focus tolerances tighten sharply and resists get thinner. Fewer photons per feature make stochastic defects such as bridges, breaks, and rough edges a yield limiter. Large dies must be stitched across two half-fields.",
k:["Nanometer-scale overlay","Thin resist films","Step-and-scan exposure"]}
];
function $(id){return document.getElementById(id);}
if(!$("diagram"))return;
var cur=0,layout="",NS="http://www.w3.org/2000/svg";
function el(n,a){var e=document.createElementNS(NS,n);for(var k in a)e.setAttribute(k,a[k]);return e;}
function render(){
  var box=$("diagram"),wide=box.clientWidth>=560,want=wide?"wide":"tall";
  if(want===layout)return;layout=want;box.innerHTML="";
  var w,h,pos,vb,i;
  if(wide){w=190;h=64;pos=[[20,24],[265,24],[510,24],[510,156],[265,156],[20,156]];vb="0 0 720 244";}
  else{w=308;h=60;pos=[];for(i=0;i<6;i++)pos.push([16,12+i*92]);vb="0 0 340 544";}
  var svg=el("svg",{viewBox:vb,role:"group","aria-label":"Six stages of the EUV light path"});
  var defs=el("defs",{}),m=el("marker",{id:"ah",viewBox:"0 0 10 10",refX:"8",refY:"5",markerWidth:"6",markerHeight:"6",orient:"auto-start-reverse"});
  var mp=el("path",{d:"M2 1L8 5L2 9",fill:"none","stroke-width":"1.6","stroke-linecap":"round","stroke-linejoin":"round"});mp.style.stroke="var(--euv)";
  m.appendChild(mp);defs.appendChild(m);svg.appendChild(defs);
  for(var j=0;j<5;j++){
    var a=pos[j],b=pos[j+1],x1,y1,x2,y2;
    if(a[1]===b[1]){y1=y2=a[1]+h/2;if(b[0]>a[0]){x1=a[0]+w+4;x2=b[0]-6;}else{x1=a[0]-4;x2=b[0]+w+6;}}
    else{x1=x2=a[0]+w/2;y1=a[1]+h+4;y2=b[1]-6;}
    svg.appendChild(el("line",{class:"beam",x1:x1,y1:y1,x2:x2,y2:y2,"marker-end":"url(#ah)"}));
  }
  S.forEach(function(st,i){
    var p=pos[i],g=el("g",{class:"node "+st.cat,tabindex:"0",role:"button","aria-label":"Stage "+(i+1)+": "+st.t,"data-i":i});
    g.appendChild(el("rect",{x:p[0],y:p[1],width:w,height:h,rx:"10"}));
    g.appendChild(el("circle",{class:"dot",cx:p[0]+18,cy:p[1]+h/2,r:"5"}));
    var t=el("text",{class:"t",x:p[0]+34,y:p[1]+h/2-3});t.textContent=st.t;g.appendChild(t);
    var s=el("text",{class:"s",x:p[0]+34,y:p[1]+h/2+16});s.textContent=st.s;g.appendChild(s);
    g.addEventListener("click",function(){show(i);});
    g.addEventListener("keydown",function(ev){if(ev.key==="Enter"||ev.key===" "){ev.preventDefault();show(i);}});
    svg.appendChild(g);
  });
  box.appendChild(svg);mark();
}
function mark(){document.querySelectorAll(".node").forEach(function(n){var on=+n.getAttribute("data-i")===cur;n.classList.toggle("on",on);n.setAttribute("aria-pressed",on?"true":"false");});}
function show(i){
  cur=i;var st=S[i];
  $("d-step").textContent="Stage "+(i+1)+" of 6 in the light path";
  $("d-t").textContent=st.title;$("d-h").textContent=st.h;$("d-e").textContent=st.e;
  var ul=$("d-k");ul.innerHTML="";
  st.k.forEach(function(f){var li=document.createElement("li");li.textContent=f;ul.appendChild(li);});
  $("next").textContent=i===5?"Back to the source":"Next stage";
  mark();
}
$("prev").addEventListener("click",function(){show(Math.max(0,cur-1));});
$("next").addEventListener("click",function(){show(cur===5?0:cur+1);});

var L=13.5,EPH=91.85*1.602e-19,ratios=[],cols=40,rows=6,noise=0;
function gauss(){var u=0,v=0;while(!u)u=Math.random();while(!v)v=Math.random();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);}
function sample(){cols=$("cv").clientWidth<520?24:40;ratios=[];for(var i=0;i<cols*rows;i++)ratios.push(1+(noise/100)*gauss());draw();}
function draw(){
  var c=$("cv"),dpr=window.devicePixelRatio||1,w=c.clientWidth,h=c.clientHeight;
  if(!w||!ratios.length)return;
  c.width=Math.round(w*dpr);c.height=Math.round(h*dpr);
  var x=c.getContext("2d");x.setTransform(dpr,0,0,dpr,0,0);x.clearRect(0,0,w,h);
  var cs=getComputedStyle(document.documentElement),good=cs.getPropertyValue("--cell").trim()||"#5A3FD1",badc=cs.getPropertyValue("--bad").trim()||"#D9571F";
  var pad=8,gap=2,cw=(w-2*pad-gap*(cols-1))/cols,ch=(h-2*pad-gap*(rows-1))/rows,bad=0;
  for(var r=0;r<rows;r++)for(var q=0;q<cols;q++){
    var ratio=ratios[r*cols+q],off=Math.abs(ratio-1)>0.05;if(off)bad++;
    x.globalAlpha=off?1:Math.max(0.15,Math.min(1,0.55+(ratio-1)*8));
    x.fillStyle=off?badc:good;x.fillRect(pad+q*(cw+gap),pad+r*(ch+gap),cw,ch);
  }
  x.globalAlpha=1;
  $("o-fl").textContent=bad+" of "+(cols*rows)+" pixels ("+(bad/(cols*rows)*100).toFixed(1)+"%) are more than 5% off nominal dose";
}
function upd(){
  var na=+$("na").value,k1=+$("k1").value,dose=+$("dose").value,R=+$("R").value,N=+$("N").value;
  $("na-v").textContent=na.toFixed(2);$("k1-v").textContent=k1.toFixed(2);$("dose-v").textContent=dose;$("R-v").textContent=Math.round(R*100)+"%";$("N-v").textContent=N;
  var cd=k1*L/na,dof=L/(na*na),tr=Math.pow(R,N)*100,ph=dose*1e-17/EPH*cd*cd;noise=100/Math.sqrt(ph);
  $("eq-cd").textContent="= "+k1.toFixed(2)+" × 13.5 nm / "+na.toFixed(2)+" = "+cd.toFixed(1)+" nm";
  $("eq-dof").textContent="= 1 × 13.5 nm / "+na.toFixed(2)+"² = "+Math.round(dof)+" nm";
  $("o-cd").textContent=cd.toFixed(1)+" nm";
  $("o-cd-n").textContent="0.33 NA at the same k₁: "+(k1*L/0.33).toFixed(1)+" nm";
  $("o-dof").textContent=Math.round(dof)+" nm";
  $("o-dof-n").textContent="0.33 NA reference: "+Math.round(L/(0.33*0.33))+" nm";
  $("o-tr").textContent=(tr<1?tr.toFixed(2):tr.toFixed(1))+"%";
  $("o-ph").textContent=Math.round(ph).toLocaleString();
  $("o-ns").textContent="±"+noise.toFixed(1)+"%";
  $("o-fld").textContent=na>0.4?"At this NA the optics are anamorphic (4x across, 8x along the scan), so the exposure field is 26 × 16.5 mm, half of a standard field. Dies larger than that must be stitched.":"At this NA the optics use a uniform 4x reduction and the full 26 × 33 mm exposure field.";
  document.querySelectorAll("[data-na]").forEach(function(b){b.setAttribute("aria-pressed",Math.abs(+b.getAttribute("data-na")-na)<0.001?"true":"false");});
  sample();
}
["na","k1","dose","R","N"].forEach(function(id){$(id).addEventListener("input",upd);});
document.querySelectorAll("[data-na]").forEach(function(b){b.addEventListener("click",function(){$("na").value=b.getAttribute("data-na");upd();});});
$("resample").addEventListener("click",sample);
var toggle=false;
function setv(o){for(var k in o)$(k).value=o[k];upd();var reduce=window.matchMedia("(prefers-reduced-motion: reduce)").matches;$("sim").scrollIntoView({behavior:reduce?"auto":"smooth",block:"start"});}
document.querySelectorAll("[data-try]").forEach(function(b){b.addEventListener("click",function(){
  var n=b.getAttribute("data-try");
  if(n==="1"){toggle=!toggle;setv({na:toggle?0.33:0.55,k1:0.3,dose:50,R:0.68,N:11});b.textContent=toggle?"Now switch to 0.55 NA":"Compare 0.33 and 0.55 NA";}
  if(n==="2")setv({na:0.55,k1:0.27,dose:22,R:0.68,N:11});
  if(n==="3")setv({na:0.55,k1:0.3,dose:50,R:0.64,N:13});
});});
var rt;window.addEventListener("resize",function(){clearTimeout(rt);rt=setTimeout(function(){render();sample();},150);});
try{window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change",draw);}catch(e){}
try{new MutationObserver(draw).observe(document.documentElement,{attributes:true,attributeFilter:["data-theme"]});}catch(e){}
render();show(0);upd();
if(document.fonts&&document.fonts.ready)document.fonts.ready.then(draw);
})();
