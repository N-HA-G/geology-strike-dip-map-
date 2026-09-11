const map=L.map("map").setView([34.93,139.85],12);
const attr='<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">国土地理院</a>';
const std=L.tileLayer("https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png",{maxZoom:18,attribution:attr});
const pale=L.tileLayer("https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png",{maxZoom:18,attribution:attr});
const photo=L.tileLayer("https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg",{maxZoom:18,attribution:attr});
pale.addTo(map);
L.control.layers({"地理院地図・標準":std,"地理院地図・淡色":pale,"地理院地図・空中写真":photo},null,{collapsed:false}).addTo(map);

const $=id=>document.getElementById(id);
const form=$("form"),pointId=$("pointId"),lat=$("lat"),lng=$("lng"),strikeText=$("strikeText"),dipText=$("dipText");
const outStrike=$("outStrike"),outDip=$("outDip"),outDir=$("outDir"),msg=$("msg"),count=$("count");
const layer=L.layerGroup().addTo(map);
let temp=null,n=0;

const norm=a=>((a%360)+360)%360;
const diff=(a,b)=>{const d=Math.abs(norm(a)-norm(b));return Math.min(d,360-d)};

function parseStrike(v){
  const t=String(v).trim().toUpperCase().replaceAll("°","").replace(/\s+/g,"");
  if(/^\d+(\.\d+)?$/.test(t)){const x=Number(t);if(x>=0&&x<360)return norm(x);throw Error("数字の走向は0°以上360°未満で入力してください．")}
  const m=t.match(/^([NS])(\d+(?:\.\d+)?)([EW])$/);
  if(!m)throw Error("走向の形式を確認してください．例．N30E，N30°E，030．");
  const ns=m[1],a=Number(m[2]),ew=m[3];
  if(a<0||a>90)throw Error("四分円表記の角度は0〜90°で入力してください．");
  if(ns==="N"&&ew==="E")return a;
  if(ns==="N"&&ew==="W")return norm(360-a);
  if(ns==="S"&&ew==="E")return 180-a;
  return 180+a;
}

const dirs={N:0,NE:45,E:90,SE:135,S:180,SW:225,W:270,NW:315};

function parseDip(v,strike){
  const t=String(v).trim().toUpperCase().replaceAll("°","").replace(/\s+/g,"");
  const m=t.match(/^(\d+(?:\.\d+)?)(NE|SE|SW|NW|N|E|S|W)$/);
  if(!m)throw Error("傾斜の形式を確認してください．例．45SE，45°NW．");
  const dip=Number(m[1]),label=m[2];
  if(dip<0||dip>90)throw Error("傾斜角は0〜90°で入力してください．");
  const c1=norm(strike+90),c2=norm(strike-90),want=dirs[label];
  const d1=diff(c1,want),d2=diff(c2,want);
  return {dip,label,dipDirection:d1<=d2?c1:c2};
}

function convert(showError=true){
  try{
    const strike=parseStrike(strikeText.value);
    const d=parseDip(dipText.value,strike);
    outStrike.textContent=strike.toFixed(1)+"°";
    outDip.textContent=d.dip.toFixed(1)+"°";
    outDir.textContent=d.dipDirection.toFixed(1)+"°";
    if(showError){msg.textContent="";msg.className="msg"}
    return {strike,dip:d.dip,dipDirection:d.dipDirection};
  }catch(e){
    outStrike.textContent=outDip.textContent=outDir.textContent="―";
    if(showError){msg.textContent=e.message;msg.className="msg error"}
    return null;
  }
}
strikeText.addEventListener("input",()=>convert());
dipText.addEventListener("input",()=>convert());

function tempIcon(){
  return L.divIcon({className:"click-point-icon",html:'<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26"><circle cx="13" cy="13" r="7" fill="white" stroke="#b00020" stroke-width="2.5"/><circle cx="13" cy="13" r="2.5" fill="#b00020"/></svg>',iconSize:[26,26],iconAnchor:[13,13]});
}
map.on("click",e=>{
  lat.value=e.latlng.lat.toFixed(6);lng.value=e.latlng.lng.toFixed(6);
  if(temp)temp.setLatLng(e.latlng);else temp=L.marker(e.latlng,{icon:tempIcon(),interactive:false}).addTo(map);
  msg.textContent=`クリック地点を選択しました．緯度 ${lat.value}．経度 ${lng.value}．`;msg.className="msg success";
});

function symbolSvg(strike,dip,dir){
  const s=76,c=38,L=22,T=14,R=Math.PI/180,sr=strike*R,dr=dir*R;
  const sx=Math.sin(sr),sy=-Math.cos(sr),dx=Math.sin(dr),dy=-Math.cos(dr);
  const x1=c-sx*L,y1=c-sy*L,x2=c+sx*L,y2=c+sy*L,tx=c+dx*T,ty=c+dy*T;
  const qx=c+dx*24,qy=c+dy*24+4;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#111" stroke-width="2.4" stroke-linecap="round"/>
  <line x1="${c}" y1="${c}" x2="${tx}" y2="${ty}" stroke="#111" stroke-width="2.4" stroke-linecap="round"/>
  <text x="${qx}" y="${qy}" text-anchor="middle" dominant-baseline="middle" font-family="Arial,sans-serif" font-size="13" font-weight="700" fill="#111" stroke="#fff" stroke-width="3" paint-order="stroke">${Number(dip.toFixed(1))}</text></svg>`;
}
const icon=(s,d,r)=>L.divIcon({className:"strike-dip-icon",html:symbolSvg(s,d,r),iconSize:[76,76],iconAnchor:[38,38]});
const esc=s=>String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");

form.addEventListener("submit",e=>{
  e.preventDefault();
  const la=Number(lat.value),lo=Number(lng.value),c=convert();
  if(!Number.isFinite(la)||la<-90||la>90){msg.textContent="緯度を確認してください．";msg.className="msg error";return}
  if(!Number.isFinite(lo)||lo<-180||lo>180){msg.textContent="経度を確認してください．";msg.className="msg error";return}
  if(!c)return;
  const id=pointId.value.trim()||"(地点番号なし)";
  const m=L.marker([la,lo],{icon:icon(c.strike,c.dip,c.dipDirection),title:id}).addTo(layer);
  m.bindPopup(`<strong>${esc(id)}</strong><br>緯度．${la.toFixed(6)}<br>経度．${lo.toFixed(6)}<br>入力走向．${esc(strikeText.value)}<br>入力傾斜．${esc(dipText.value)}<br>走向方位角．${c.strike.toFixed(1)}°<br>傾斜角．${c.dip.toFixed(1)}°<br>傾斜方向．${c.dipDirection.toFixed(1)}°`);
  if(temp){map.removeLayer(temp);temp=null}
  count.textContent=String(++n);msg.textContent=`${id} を地図に追加しました．`;msg.className="msg success";m.openPopup();
});
$("clear").addEventListener("click",()=>{layer.clearLayers();if(temp){map.removeLayer(temp);temp=null}n=0;count.textContent="0";msg.textContent="表示中の測定地点をすべて削除しました．";msg.className="msg"});
convert(false);
