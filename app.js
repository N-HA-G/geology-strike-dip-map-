const map=L.map("map").setView([34.93,139.85],12);

const attribution='<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">国土地理院</a>';
const tile=url=>L.tileLayer(url,{maxZoom:18,attribution,crossOrigin:true});
const standard=tile("https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png");
const pale=tile("https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png");
const photo=tile("https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg");

const baseLayers={"地理院地図・標準":standard,"地理院地図・淡色":pale,"地理院地図・空中写真":photo};
let currentBaseLayerName="地理院地図・淡色";
pale.addTo(map);

const measurementLayer=L.layerGroup().addTo(map);
const gpxTrackLayer=L.layerGroup().addTo(map);

L.control.layers(baseLayers,{"GPX軌跡":gpxTrackLayer},{collapsed:false}).addTo(map);
L.control.scale({position:"bottomleft",imperial:false,maxWidth:140}).addTo(map);

map.on("baselayerchange",event=>{
  currentBaseLayerName=event.name;
});

const $=id=>document.getElementById(id);
const pointForm=$("pointForm");
const formTitle=$("formTitle");
const savePointButton=$("savePoint");
const cancelEditButton=$("cancelEdit");
const pointIdInput=$("pointId");
const latInput=$("lat");
const lngInput=$("lng");
const strikeTextInput=$("strikeText");
const dipTextInput=$("dipText");
const surveyDateInput=$("surveyDate");
const lithologyInput=$("lithology");
const structureTypeInput=$("structureType");
const notesInput=$("notes");
const symbolSizeInput=$("symbolSize");
const symbolSizeValue=$("symbolSizeValue");
const outStrike=$("outStrike");
const outDip=$("outDip");
const outDir=$("outDir");
const msg=$("msg");
const count=$("count");
const completeCount=$("completeCount");
const pointTableBody=$("pointTableBody");
const applyTableChangesButton=$("applyTableChanges");
const discardTableChangesButton=$("discardTableChanges");
const draftStatus=$("draftStatus");
const gpxFilesInput=$("gpxFiles");
const excelFilesInput=$("excelFiles");
const loadExcelButton=$("loadExcel");
const gpxFileList=$("gpxFileList");
const loadProjectFileInput=$("loadProjectFile");
const exportCsvButton=$("exportCsv");
const exportGeoJsonButton=$("exportGeoJson");
const exportPngButton=$("exportPng");
const exportJpegButton=$("exportJpeg");
const exportPdfButton=$("exportPdf");
const mapElement=$("map");

const northArrowElement=document.createElement("div");
northArrowElement.className="north-arrow";
northArrowElement.setAttribute("aria-hidden","true");
northArrowElement.innerHTML=`
  <div class="north-arrow-label">N</div>
  <svg xmlns="http://www.w3.org/2000/svg" width="54" height="74" viewBox="0 0 54 74">
    <path d="M27 2 L45 48 L27 39 L9 48 Z" fill="#111111" stroke="#ffffff" stroke-width="2"/>
    <line x1="27" y1="38" x2="27" y2="70" stroke="#111111" stroke-width="4"/>
    <line x1="27" y1="38" x2="27" y2="70" stroke="#ffffff" stroke-width="7" style="paint-order:stroke"/>
  </svg>
</div>`;
mapElement.appendChild(northArrowElement);


let measurements=[];
let nextInternalId=1;
let nextCreatedOrder=1;
let temporaryMarker=null;
let editingId=null;
let sortKey="createdOrder";
let sortAscending=true;
let symbolScalePercent=100;
const tableDrafts=new Map();

let importedGpxFiles=[];
const importedGpxKeys=new Set();
const gpxColors=["#1f77b4","#d62728","#2ca02c","#9467bd","#ff7f0e","#17becf","#8c564b","#7f7f7f"];

const normalizeAzimuth=angle=>((angle%360)+360)%360;
function angularDifference(a,b){
  const d=Math.abs(normalizeAzimuth(a)-normalizeAzimuth(b));
  return Math.min(d,360-d);
}

function parseStrike(value){
  const text=String(value).trim().toUpperCase().replaceAll("°","").replace(/\s+/g,"");
  if(/^\d+(\.\d+)?$/.test(text)){
    const number=Number(text);
    if(number>=0&&number<360)return normalizeAzimuth(number);
    throw new Error("数字の走向は0°以上360°未満で入力してください．");
  }
  const match=text.match(/^([NS])(\d+(?:\.\d+)?)([EW])$/);
  if(!match)throw new Error("走向の形式を確認してください．例．N30E，N30°E，030．");
  const ns=match[1],angle=Number(match[2]),ew=match[3];
  if(angle<0||angle>90)throw new Error("四分円表記の角度は0〜90°で入力してください．");
  if(ns==="N"&&ew==="E")return angle;
  if(ns==="N"&&ew==="W")return normalizeAzimuth(360-angle);
  if(ns==="S"&&ew==="E")return 180-angle;
  return 180+angle;
}

const directionAzimuths={N:0,NE:45,E:90,SE:135,S:180,SW:225,W:270,NW:315};

function parseDip(value,strike){
  const text=String(value).trim().toUpperCase().replaceAll("°","").replace(/\s+/g,"");
  const match=text.match(/^(\d+(?:\.\d+)?)(NE|SE|SW|NW|N|E|S|W)$/);
  if(!match)throw new Error("傾斜の形式を確認してください．例．45SE，45°NW．");

  const dip=Number(match[1]);
  const directionLabel=match[2];
  if(dip<0||dip>90)throw new Error("傾斜角は0〜90°で入力してください．");

  const desired=directionAzimuths[directionLabel];
  const c1=normalizeAzimuth(strike+90);
  const c2=normalizeAzimuth(strike-90);

  return {
    dip,
    directionLabel,
    dipDirection:angularDifference(c1,desired)<=angularDifference(c2,desired)?c1:c2
  };
}

function parseAttitudeInputs(showError=true){
  const rawStrike=strikeTextInput.value.trim();
  const rawDip=dipTextInput.value.trim();

  if(rawStrike===""&&rawDip===""){
    outStrike.textContent="未入力";
    outDip.textContent="未入力";
    outDir.textContent="未入力";
    if(showError){msg.textContent="";msg.className="msg";}
    return {hasAttitude:false,rawStrike:"",rawDip:"",strike:null,dip:null,dipDirection:null,dipDirectionLabel:""};
  }

  if(rawStrike===""||rawDip===""){
    outStrike.textContent=outDip.textContent=outDir.textContent="―";
    if(showError){
      msg.textContent="走向と傾斜は，両方入力するか，両方空欄にしてください．";
      msg.className="msg error";
    }
    return null;
  }

  try{
    const strike=parseStrike(rawStrike);
    const dipData=parseDip(rawDip,strike);
    outStrike.textContent=`${strike.toFixed(1)}°`;
    outDip.textContent=`${dipData.dip.toFixed(1)}°`;
    outDir.textContent=`${dipData.dipDirection.toFixed(1)}°`;
    if(showError){msg.textContent="";msg.className="msg";}
    return {
      hasAttitude:true,
      rawStrike,rawDip,
      strike,
      dip:dipData.dip,
      dipDirection:dipData.dipDirection,
      dipDirectionLabel:dipData.directionLabel
    };
  }catch(error){
    outStrike.textContent=outDip.textContent=outDir.textContent="―";
    if(showError){msg.textContent=error.message;msg.className="msg error";}
    return null;
  }
}

strikeTextInput.addEventListener("input",()=>parseAttitudeInputs());
dipTextInput.addEventListener("input",()=>parseAttitudeInputs());

function temporaryPointIcon(){
  return L.divIcon({
    className:"click-point-icon",
    html:'<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26"><circle cx="13" cy="13" r="7" fill="white" stroke="#b00020" stroke-width="2.5"/><circle cx="13" cy="13" r="2.5" fill="#b00020"/></svg>',
    iconSize:[26,26],iconAnchor:[13,13]
  });
}
function positionPointIcon(){
  return L.divIcon({
    className:"position-point-icon",
    html:'<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30"><circle cx="15" cy="15" r="7" fill="#fff" stroke="#8a5b00" stroke-width="3"/><circle cx="15" cy="15" r="2.5" fill="#8a5b00"/></svg>',
    iconSize:[30,30],iconAnchor:[15,15]
  });
}
function strikeDipSvg(strike,dip,dipDirection){
  const scale=symbolScalePercent/100;
  const size=76*scale,center=size/2;
  const strikeHalfLength=22*scale,dipTickLength=14*scale,radians=Math.PI/180;
  const sr=strike*radians,dr=dipDirection*radians;
  const sx=Math.sin(sr),sy=-Math.cos(sr),dx=Math.sin(dr),dy=-Math.cos(dr);
  const x1=center-sx*strikeHalfLength,y1=center-sy*strikeHalfLength;
  const x2=center+sx*strikeHalfLength,y2=center+sy*strikeHalfLength;
  const tx=center+dx*dipTickLength,ty=center+dy*dipTickLength;
  const textX=center+dx*24*scale,textY=center+dy*24*scale+4*scale;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#111" stroke-width="${2.4*scale}" stroke-linecap="round"/>
  <line x1="${center}" y1="${center}" x2="${tx}" y2="${ty}" stroke="#111" stroke-width="${2.4*scale}" stroke-linecap="round"/>
  <text x="${textX}" y="${textY}" text-anchor="middle" dominant-baseline="middle" font-family="Arial,sans-serif" font-size="${13*scale}" font-weight="700" fill="#111" stroke="#fff" stroke-width="${3*scale}" paint-order="stroke">${Number(dip.toFixed(1))}</text></svg>`;
}
function strikeDipIcon(strike,dip,dipDirection){
  const size=76*(symbolScalePercent/100);
  return L.divIcon({className:"strike-dip-icon",html:strikeDipSvg(strike,dip,dipDirection),iconSize:[size,size],iconAnchor:[size/2,size/2]});
}

function rebuildAllMeasurementMarkers(){
  measurements.forEach(item=>rebuildMarker(item));
}

function updateSymbolSize(value,rebuild=true){
  const parsed=Number(value);
  symbolScalePercent=Number.isFinite(parsed)?Math.min(200,Math.max(50,parsed)):100;
  symbolSizeInput.value=String(symbolScalePercent);
  symbolSizeValue.textContent=`${symbolScalePercent}％`;
  if(rebuild)rebuildAllMeasurementMarkers();
}

symbolSizeInput.addEventListener("input",()=>{
  updateSymbolSize(symbolSizeInput.value,true);
});

map.on("click",event=>{
  latInput.value=event.latlng.lat.toFixed(6);
  lngInput.value=event.latlng.lng.toFixed(6);
  if(temporaryMarker){
    temporaryMarker.setLatLng(event.latlng);
  }else{
    temporaryMarker=L.marker(event.latlng,{icon:temporaryPointIcon(),interactive:false}).addTo(map);
  }
  msg.textContent=`クリック地点を選択しました．緯度 ${latInput.value}．経度 ${lngInput.value}．`;
  msg.className="msg success";
});

function escapeHtml(value){
  return String(value??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
}
const pointStatus=item=>item.hasAttitude?"入力済み":"未入力";

function popupHtml(item){
  const att=item.hasAttitude
    ?`入力走向．${escapeHtml(item.rawStrike)}<br>入力傾斜．${escapeHtml(item.rawDip)}<br>走向方位角．${item.strike.toFixed(1)}°<br>傾斜角．${item.dip.toFixed(1)}°<br>傾斜方向．${item.dipDirection.toFixed(1)}°`
    :"<strong>走向・傾斜は未入力です．</strong><br>一覧の編集ボタンから入力できます．";

  const extra=[
    item.surveyDate?`測定日．${escapeHtml(item.surveyDate)}`:"",
    item.lithology?`岩種・地層名．${escapeHtml(item.lithology)}`:"",
    item.structureType?`面・構造．${escapeHtml(item.structureType)}`:"",
    item.notes?`補足情報．${escapeHtml(item.notes).replaceAll("\n","<br>")}`:""
  ].filter(Boolean).join("<br>");

  return `<strong>${escapeHtml(item.pointId)}</strong><br>由来．${escapeHtml(item.source)}<br>緯度．${item.latitude.toFixed(6)}<br>経度．${item.longitude.toFixed(6)}<br>${att}${extra?`<br>${extra}`:""}`;
}

function buildMarker(item){
  const icon=item.hasAttitude?strikeDipIcon(item.strike,item.dip,item.dipDirection):positionPointIcon();
  item.marker=L.marker([item.latitude,item.longitude],{icon,title:item.pointId}).addTo(measurementLayer);
  item.marker.bindPopup(popupHtml(item));
}
function rebuildMarker(item){
  if(item.marker)measurementLayer.removeLayer(item.marker);
  buildMarker(item);
}

function plainPoint(item){
  return {
    id:item.id,
    createdOrder:item.createdOrder,
    pointId:item.pointId,
    latitude:item.latitude,
    longitude:item.longitude,
    source:item.source,
    sourceFile:item.sourceFile,
    sourceType:item.sourceType,
    hasAttitude:item.hasAttitude,
    rawStrike:item.rawStrike,
    rawDip:item.rawDip,
    strike:item.strike,
    dip:item.dip,
    dipDirection:item.dipDirection,
    dipDirectionLabel:item.dipDirectionLabel,
    surveyDate:item.surveyDate,
    lithology:item.lithology,
    structureType:item.structureType,
    notes:item.notes,
    gpxTime:item.gpxTime
  };
}

function createPoint(data){
  const item={
    id:data.id??nextInternalId++,
    createdOrder:data.createdOrder??nextCreatedOrder++,
    pointId:data.pointId||`P${String(nextCreatedOrder-1).padStart(3,"0")}`,
    latitude:data.latitude,
    longitude:data.longitude,
    source:data.source||"手動",
    sourceFile:data.sourceFile||"",
    sourceType:data.sourceType||"manual",
    hasAttitude:Boolean(data.hasAttitude),
    rawStrike:data.rawStrike||"",
    rawDip:data.rawDip||"",
    strike:data.strike??null,
    dip:data.dip??null,
    dipDirection:data.dipDirection??null,
    dipDirectionLabel:data.dipDirectionLabel||"",
    surveyDate:data.surveyDate||"",
    lithology:data.lithology||"",
    structureType:data.structureType||"",
    notes:data.notes||"",
    gpxTime:data.gpxTime||"",
    marker:null
  };
  measurements.push(item);
  buildMarker(item);
  nextInternalId=Math.max(nextInternalId,item.id+1);
  nextCreatedOrder=Math.max(nextCreatedOrder,item.createdOrder+1);
  return item;
}

function resetForm(){
  editingId=null;
  formTitle.textContent="ポイントを追加";
  savePointButton.textContent="ポイントを追加";
  cancelEditButton.hidden=true;
  strikeTextInput.value="";
  dipTextInput.value="";
  surveyDateInput.value="";
  lithologyInput.value="";
  structureTypeInput.value="";
  notesInput.value="";
  parseAttitudeInputs(false);
}
function startEditing(item){
  editingId=item.id;
  formTitle.textContent=`ポイントを編集．${item.pointId}`;
  savePointButton.textContent="ポイントを更新";
  cancelEditButton.hidden=false;
  pointIdInput.value=item.pointId;
  latInput.value=item.latitude.toFixed(6);
  lngInput.value=item.longitude.toFixed(6);
  strikeTextInput.value=item.rawStrike;
  dipTextInput.value=item.rawDip;
  surveyDateInput.value=item.surveyDate||"";
  lithologyInput.value=item.lithology||"";
  structureTypeInput.value=item.structureType||"";
  notesInput.value=item.notes||"";
  parseAttitudeInputs(false);
  map.setView([item.latitude,item.longitude],Math.max(map.getZoom(),17));
  item.marker.openPopup();
  document.querySelector(".input-panel").scrollIntoView({behavior:"smooth",block:"start"});
}
cancelEditButton.addEventListener("click",()=>{
  resetForm();
  msg.textContent="編集をキャンセルしました．";
  msg.className="msg";
});

pointForm.addEventListener("submit",event=>{
  event.preventDefault();
  const latitude=Number(latInput.value),longitude=Number(lngInput.value);
  if(!Number.isFinite(latitude)||latitude<-90||latitude>90){msg.textContent="緯度を確認してください．";msg.className="msg error";return;}
  if(!Number.isFinite(longitude)||longitude<-180||longitude>180){msg.textContent="経度を確認してください．";msg.className="msg error";return;}

  const attitude=parseAttitudeInputs();
  if(!attitude)return;

  const inputPointId=pointIdInput.value.trim()||`P${String(nextCreatedOrder).padStart(3,"0")}`;

  if(editingId!==null){
    const item=measurements.find(entry=>entry.id===editingId);
    if(!item)return;
    item.pointId=inputPointId;
    item.latitude=latitude;
    item.longitude=longitude;
    item.hasAttitude=attitude.hasAttitude;
    item.rawStrike=attitude.rawStrike;
    item.rawDip=attitude.rawDip;
    item.strike=attitude.strike;
    item.dip=attitude.dip;
    item.dipDirection=attitude.dipDirection;
    item.dipDirectionLabel=attitude.dipDirectionLabel;
    item.surveyDate=surveyDateInput.value;
    item.lithology=lithologyInput.value.trim();
    item.structureType=structureTypeInput.value;
    item.notes=notesInput.value.trim();
    rebuildMarker(item);
    tableDrafts.delete(item.id);
    if(temporaryMarker){map.removeLayer(temporaryMarker);temporaryMarker=null;}
    renderMeasurements();
    msg.textContent=`${item.pointId} を更新しました．`;
    msg.className="msg success";
    item.marker.openPopup();
    resetForm();
    return;
  }

  const item=createPoint({
    pointId:inputPointId,latitude,longitude,source:"手動",sourceType:"manual",
    hasAttitude:attitude.hasAttitude,rawStrike:attitude.rawStrike,rawDip:attitude.rawDip,
    strike:attitude.strike,dip:attitude.dip,dipDirection:attitude.dipDirection,dipDirectionLabel:attitude.dipDirectionLabel,
    surveyDate:surveyDateInput.value,
    lithology:lithologyInput.value.trim(),
    structureType:structureTypeInput.value,
    notes:notesInput.value.trim()
  });

  if(temporaryMarker){map.removeLayer(temporaryMarker);temporaryMarker=null;}
  renderMeasurements();
  msg.textContent=item.hasAttitude?`${item.pointId} を走向・傾斜付きで追加しました．`:`${item.pointId} を位置ポイントとして追加しました．`;
  msg.className="msg success";
  item.marker.openPopup();
  resetForm();
});

function comparableValue(item,key){
  const value=key==="status"?pointStatus(item):item[key];
  return value===null||value===undefined||value===""?null:value;
}
function getSortedMeasurements(){
  return [...measurements].sort((a,b)=>{
    const av=comparableValue(a,sortKey),bv=comparableValue(b,sortKey);
    if(av===null&&bv===null)return 0;
    if(av===null)return 1;
    if(bv===null)return -1;
    const result=(typeof av==="number"&&typeof bv==="number")
      ?av-bv
      :String(av).localeCompare(String(bv),"ja",{numeric:true,sensitivity:"base"});
    return sortAscending?result:-result;
  });
}
function updateSortButtons(){
  document.querySelectorAll(".sort-button").forEach(button=>{
    const active=button.dataset.sort===sortKey;
    button.classList.toggle("active",active);
    button.classList.toggle("desc",active&&!sortAscending);
    const th=button.closest("th");
    if(th)th.setAttribute("aria-sort",active?(sortAscending?"ascending":"descending"):"none");
  });
}
document.querySelectorAll(".sort-button").forEach(button=>{
  button.addEventListener("click",()=>{
    const newKey=button.dataset.sort;
    if(sortKey===newKey){sortAscending=!sortAscending;}else{sortKey=newKey;sortAscending=true;}
    renderMeasurements();
  });
});

const formatNumberOrBlank=value=>Number.isFinite(value)?`${value.toFixed(1)}°`:"";

function editableValue(item,key){
  const draft=tableDrafts.get(item.id);
  if(draft&&Object.prototype.hasOwnProperty.call(draft,key)){
    return draft[key];
  }
  return item[key]??"";
}

function setTableDraft(id,key,value){
  const current=tableDrafts.get(id)||{};
  current[key]=value;
  tableDrafts.set(id,current);
  updateDraftState();
}

function updateDraftState(){
  const count=tableDrafts.size;
  applyTableChangesButton.disabled=count===0;
  discardTableChangesButton.disabled=count===0;
  draftStatus.textContent=count===0
    ?"未反映の変更なし"
    :`未反映の変更．${count}地点`;
  draftStatus.classList.toggle("dirty",count>0);
}

function tableInput(dataId,field,value,type="text",extra=""){
  return `<input
    class="table-editor"
    data-edit-id="${dataId}"
    data-field="${field}"
    type="${type}"
    value="${escapeHtml(value)}"
    ${extra}
  >`;
}

function tableTextarea(dataId,field,value){
  return `<textarea
    class="table-editor table-notes-editor"
    data-edit-id="${dataId}"
    data-field="${field}"
    rows="2"
  >${escapeHtml(value)}</textarea>`;
}

function parseAttitudePair(rawStrike,rawDip){
  const strikeText=String(rawStrike??"").trim();
  const dipText=String(rawDip??"").trim();

  if(strikeText===""&&dipText===""){
    return {
      hasAttitude:false,
      rawStrike:"",
      rawDip:"",
      strike:null,
      dip:null,
      dipDirection:null,
      dipDirectionLabel:""
    };
  }

  if(strikeText===""||dipText===""){
    throw new Error("走向と傾斜は，両方入力するか，両方空欄にしてください．");
  }

  const strike=parseStrike(strikeText);
  const dipData=parseDip(dipText,strike);

  return {
    hasAttitude:true,
    rawStrike:strikeText,
    rawDip:dipText,
    strike,
    dip:dipData.dip,
    dipDirection:dipData.dipDirection,
    dipDirectionLabel:dipData.directionLabel
  };
}

function renderMeasurements(){
  count.textContent=String(measurements.length);
  completeCount.textContent=String(measurements.filter(item=>item.hasAttitude).length);
  exportCsvButton.disabled=measurements.length===0;
  exportGeoJsonButton.disabled=measurements.length===0;
  pointTableBody.innerHTML="";

  const sorted=getSortedMeasurements();

  if(sorted.length===0){
    pointTableBody.innerHTML='<tr><td colspan="16" class="empty">まだポイントはありません．</td></tr>';
    updateSortButtons();
    updateDraftState();
    return;
  }

  sorted.forEach((item,index)=>{
    const row=document.createElement("tr");
    const draft=tableDrafts.get(item.id);
    if(draft)row.classList.add("draft-row");

    row.innerHTML=`
      <td>${index+1}</td>
      <td>${tableInput(item.id,"pointId",editableValue(item,"pointId"))}</td>
      <td class="${item.hasAttitude?"status-complete":"status-pending"}">${pointStatus(item)}</td>
      <td>${escapeHtml(item.source)}</td>
      <td>${tableInput(item.id,"latitude",editableValue(item,"latitude"),"number",'step="0.000001"')}</td>
      <td>${tableInput(item.id,"longitude",editableValue(item,"longitude"),"number",'step="0.000001"')}</td>
      <td>${tableInput(item.id,"rawStrike",editableValue(item,"rawStrike"))}</td>
      <td>${tableInput(item.id,"rawDip",editableValue(item,"rawDip"))}</td>
      <td>${formatNumberOrBlank(item.strike)}</td>
      <td>${formatNumberOrBlank(item.dip)}</td>
      <td>${formatNumberOrBlank(item.dipDirection)}</td>
      <td>${tableInput(item.id,"surveyDate",editableValue(item,"surveyDate"),"date")}</td>
      <td>${tableInput(item.id,"lithology",editableValue(item,"lithology"))}</td>
      <td>${tableInput(item.id,"structureType",editableValue(item,"structureType"))}</td>
      <td>${tableTextarea(item.id,"notes",editableValue(item,"notes"))}</td>
      <td><div class="table-actions">
        <button type="button" data-action="focus" data-id="${item.id}">地図へ</button>
        <button type="button" data-action="edit" data-id="${item.id}">上のフォームで編集</button>
        <button type="button" class="delete-button" data-action="delete" data-id="${item.id}">削除</button>
      </div></td>`;

    pointTableBody.appendChild(row);
  });

  updateSortButtons();
  updateDraftState();
}

pointTableBody.addEventListener("input",event=>{
  const editor=event.target.closest("[data-edit-id][data-field]");
  if(!editor)return;

  const id=Number(editor.dataset.editId);
  const field=editor.dataset.field;

  setTableDraft(id,field,editor.value);

  const row=editor.closest("tr");
  if(row)row.classList.add("draft-row");
});

pointTableBody.addEventListener("click",event=>{
  const button=event.target.closest("button[data-action]");
  if(!button)return;
  const id=Number(button.dataset.id);
  const item=measurements.find(entry=>entry.id===id);
  if(!item)return;

  if(button.dataset.action==="focus"){
    map.setView([item.latitude,item.longitude],Math.max(map.getZoom(),17));
    item.marker.openPopup();
  }
  if(button.dataset.action==="edit")startEditing(item);
  if(button.dataset.action==="delete"){
    if(item.marker)measurementLayer.removeLayer(item.marker);
    measurements=measurements.filter(entry=>entry.id!==id);
    tableDrafts.delete(id);
    if(editingId===id)resetForm();
    renderMeasurements();
    msg.textContent=`${item.pointId} を削除しました．`;
    msg.className="msg";
  }
});

applyTableChangesButton.addEventListener("click",()=>{
  if(tableDrafts.size===0)return;

  const prepared=[];

  try{
    for(const [id,draft] of tableDrafts.entries()){
      const item=measurements.find(entry=>entry.id===id);
      if(!item)continue;

      const pointId=String(
        Object.prototype.hasOwnProperty.call(draft,"pointId")
          ? draft.pointId
          : item.pointId
      ).trim()||item.pointId;

      const latitude=Number(
        Object.prototype.hasOwnProperty.call(draft,"latitude")
          ? draft.latitude
          : item.latitude
      );

      const longitude=Number(
        Object.prototype.hasOwnProperty.call(draft,"longitude")
          ? draft.longitude
          : item.longitude
      );

      if(!Number.isFinite(latitude)||latitude<-90||latitude>90){
        throw new Error(`${pointId}．緯度を確認してください．`);
      }

      if(!Number.isFinite(longitude)||longitude<-180||longitude>180){
        throw new Error(`${pointId}．経度を確認してください．`);
      }

      const rawStrike=Object.prototype.hasOwnProperty.call(draft,"rawStrike")
        ? draft.rawStrike
        : item.rawStrike;

      const rawDip=Object.prototype.hasOwnProperty.call(draft,"rawDip")
        ? draft.rawDip
        : item.rawDip;

      const attitude=parseAttitudePair(rawStrike,rawDip);

      prepared.push({
        item,
        values:{
          pointId,
          latitude,
          longitude,
          ...attitude,
          surveyDate:String(
            Object.prototype.hasOwnProperty.call(draft,"surveyDate")
              ? draft.surveyDate
              : item.surveyDate
          ).trim(),
          lithology:String(
            Object.prototype.hasOwnProperty.call(draft,"lithology")
              ? draft.lithology
              : item.lithology
          ).trim(),
          structureType:String(
            Object.prototype.hasOwnProperty.call(draft,"structureType")
              ? draft.structureType
              : item.structureType
          ).trim(),
          notes:String(
            Object.prototype.hasOwnProperty.call(draft,"notes")
              ? draft.notes
              : item.notes
          ).trim()
        }
      });
    }
  }catch(error){
    msg.textContent=`一覧の変更を反映できませんでした．${error.message}`;
    msg.className="msg error";
    return;
  }

  prepared.forEach(({item,values})=>{
    Object.assign(item,values);
    rebuildMarker(item);
  });

  const changedCount=tableDrafts.size;
  tableDrafts.clear();

  renderMeasurements();

  msg.textContent=`一覧の変更を${changedCount}地点へ一括反映しました．`;
  msg.className="msg success";
});

discardTableChangesButton.addEventListener("click",()=>{
  const changedCount=tableDrafts.size;
  tableDrafts.clear();
  renderMeasurements();
  msg.textContent=`未反映の変更${changedCount}地点分を元に戻しました．`;
  msg.className="msg";
});

$("clearPoints").addEventListener("click",()=>{
  measurementLayer.clearLayers();
  if(temporaryMarker){map.removeLayer(temporaryMarker);temporaryMarker=null;}
  measurements=[];
  tableDrafts.clear();
  resetForm();
  renderMeasurements();
  msg.textContent="登録ポイントをすべて削除しました．";
  msg.className="msg";
});

function getExcelValue(row,names){
  for(const name of names){
    if(Object.prototype.hasOwnProperty.call(row,name)){
      return row[name];
    }
  }
  return "";
}

function normalizeExcelDate(value){
  if(value===null||value===undefined||value==="")return "";
  const text=String(value).trim();
  const match=text.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/);
  if(match){
    return `${match[1]}-${String(match[2]).padStart(2,"0")}-${String(match[3]).padStart(2,"0")}`;
  }
  return text;
}

function prepareExcelRows(file,workbook){
  const sheetName=workbook.SheetNames.includes("入力テンプレート")
    ?"入力テンプレート"
    :workbook.SheetNames[0];

  if(!sheetName)throw new Error(`${file.name} にシートがありません．`);

  const sheet=workbook.Sheets[sheetName];
  const rows=XLSX.utils.sheet_to_json(sheet,{defval:"",raw:false});
  const prepared=[];
  const errors=[];

  rows.forEach((row,index)=>{
    const excelRow=index+2;
    const pointId=String(getExcelValue(row,["地点番号","point_id","Point ID"])).trim();
    const latRaw=getExcelValue(row,["緯度","latitude","lat"]);
    const lngRaw=getExcelValue(row,["経度","longitude","lon","lng"]);
    const rawStrike=String(getExcelValue(row,["走向","raw_strike","strike"])).trim();
    const rawDip=String(getExcelValue(row,["傾斜","raw_dip","dip"])).trim();
    const surveyDate=normalizeExcelDate(getExcelValue(row,["測定日","survey_date","date"]));
    const lithology=String(getExcelValue(row,["岩種・地層名","lithology"])).trim();
    const structureType=String(getExcelValue(row,["面・構造","structure_type","structure"])).trim();
    const notes=String(getExcelValue(row,["補足情報","notes","note"])).trim();

    const isBlank=[pointId,latRaw,lngRaw,rawStrike,rawDip,surveyDate,lithology,structureType,notes]
      .every(value=>String(value??"").trim()==="");
    if(isBlank)return;

    const latitude=Number(latRaw);
    const longitude=Number(lngRaw);

    if(!Number.isFinite(latitude)||latitude<-90||latitude>90){
      errors.push(`${excelRow}行目．緯度が不正です．`);
      return;
    }
    if(!Number.isFinite(longitude)||longitude<-180||longitude>180){
      errors.push(`${excelRow}行目．経度が不正です．`);
      return;
    }

    let attitude;
    try{
      attitude=parseAttitudePair(rawStrike,rawDip);
    }catch(error){
      errors.push(`${excelRow}行目．${error.message}`);
      return;
    }

    prepared.push({
      pointId:pointId||`P${String(nextCreatedOrder+prepared.length).padStart(3,"0")}`,
      latitude,
      longitude,
      source:`Excel．${file.name}`,
      sourceFile:file.name,
      sourceType:"excel",
      ...attitude,
      surveyDate,
      lithology,
      structureType,
      notes,
      gpxTime:""
    });
  });

  if(errors.length>0){
    throw new Error(`${file.name} の入力エラー．${errors.slice(0,6).join(" ")}${errors.length>6?` ほか${errors.length-6}件．`:""}`);
  }

  return prepared;
}

loadExcelButton.addEventListener("click",async()=>{
  const files=Array.from(excelFilesInput.files||[]);
  if(files.length===0){
    msg.textContent="読み込むExcelファイルを選択してください．";
    msg.className="msg error";
    return;
  }

  if(typeof XLSX==="undefined"){
    msg.textContent="Excel読込ライブラリを読み込めませんでした．通信環境を確認してください．";
    msg.className="msg error";
    return;
  }

  let importedFileCount=0;
  let importedPointCount=0;
  const bounds=[];

  for(const file of files){
    try{
      const buffer=await file.arrayBuffer();
      const workbook=XLSX.read(buffer,{type:"array",cellDates:false});
      const prepared=prepareExcelRows(file,workbook);

      prepared.forEach(data=>{
        const item=createPoint(data);
        importedPointCount++;
        bounds.push([item.latitude,item.longitude]);
      });

      importedFileCount++;
    }catch(error){
      console.error(error);
      msg.textContent=error.message;
      msg.className="msg error";
      renderMeasurements();
      return;
    }
  }

  renderMeasurements();

  if(bounds.length>0){
    map.fitBounds(bounds,{padding:[30,30],maxZoom:16});
  }

  msg.textContent=`Excel ${importedFileCount}ファイルから${importedPointCount}地点を読み込みました．`;
  msg.className="msg success";
});

function directChildText(node,localName){
  for(const child of node.children){
    if(child.localName===localName)return child.textContent.trim();
  }
  return "";
}
const xmlElements=(parent,localName)=>Array.from(parent.getElementsByTagNameNS("*",localName));
function safeCoordinate(value,min,max){
  const number=Number(value);
  return Number.isFinite(number)&&number>=min&&number<=max?number:null;
}
function readGpxPoint(element,fallbackName,sourceFile,sourceType){
  const latitude=safeCoordinate(element.getAttribute("lat"),-90,90);
  const longitude=safeCoordinate(element.getAttribute("lon"),-180,180);
  if(latitude===null||longitude===null)return null;
  return {
    pointId:directChildText(element,"name")||fallbackName,
    latitude,longitude,
    source:`GPX．${sourceFile}`,
    sourceFile,sourceType,gpxTime:directChildText(element,"time"),
    hasAttitude:false,rawStrike:"",rawDip:"",strike:null,dip:null,dipDirection:null,dipDirectionLabel:"",
    surveyDate:"",lithology:"",structureType:"",notes:""
  };
}
function drawTrackSegment(points,color){
  if(points.length<2)return;
  L.polyline(points,{color,weight:3,opacity:.78}).addTo(gpxTrackLayer);
}
function redrawAllGpxTracks(){
  gpxTrackLayer.clearLayers();
  importedGpxFiles.forEach(file=>{
    (file.segments||[]).forEach(segment=>drawTrackSegment(segment,file.color||"#1f77b4"));
  });
}
function parseAndImportGpx(xmlText,file,fileIndex){
  const parser=new DOMParser();
  const xml=parser.parseFromString(xmlText,"application/xml");
  if(xmlElements(xml,"parsererror").length>0)throw new Error(`${file.name} はGPX/XMLとして読み込めませんでした．`);
  const color=gpxColors[fileIndex%gpxColors.length];
  const record={name:file.name,waypointCount:0,routePointCount:0,trackCount:0,trackPointCount:0,color,segments:[]};

  xmlElements(xml,"wpt").forEach((element,index)=>{
    const point=readGpxPoint(element,`${file.name.replace(/\.gpx$/i,"")}_WPT${String(index+1).padStart(3,"0")}`,file.name,"gpx-wpt");
    if(point){createPoint(point);record.waypointCount++;}
  });

  xmlElements(xml,"rte").forEach((route,routeIndex)=>{
    const routePoints=Array.from(route.children).filter(child=>child.localName==="rtept");
    const line=[];
    routePoints.forEach((element,pointIndex)=>{
      const point=readGpxPoint(element,`${file.name.replace(/\.gpx$/i,"")}_R${routeIndex+1}_${String(pointIndex+1).padStart(3,"0")}`,file.name,"gpx-rtept");
      if(point){
        createPoint(point);
        record.routePointCount++;
        line.push([point.latitude,point.longitude]);
      }
    });
    if(line.length>=2){record.segments.push(line);drawTrackSegment(line,color);}
  });

  xmlElements(xml,"trk").forEach(track=>{
    record.trackCount++;
    Array.from(track.children).filter(child=>child.localName==="trkseg").forEach(segment=>{
      const line=[];
      Array.from(segment.children).filter(child=>child.localName==="trkpt").forEach(trackPoint=>{
        const latitude=safeCoordinate(trackPoint.getAttribute("lat"),-90,90);
        const longitude=safeCoordinate(trackPoint.getAttribute("lon"),-180,180);
        if(latitude!==null&&longitude!==null){
          line.push([latitude,longitude]);
          record.trackPointCount++;
        }
      });
      if(line.length>=2){record.segments.push(line);drawTrackSegment(line,color);}
    });
  });

  return record;
}
function renderGpxFileList(){
  if(importedGpxFiles.length===0){
    gpxFileList.textContent="読み込んだGPXはありません．";
    return;
  }
  gpxFileList.innerHTML=`<ul>${importedGpxFiles.map(file=>`
    <li>${escapeHtml(file.name)}．WPT ${file.waypointCount}点．RTE点 ${file.routePointCount}点．TRK ${file.trackCount}本．TRKPT ${file.trackPointCount}点．</li>
  `).join("")}</ul>`;
}

$("loadGpx").addEventListener("click",async()=>{
  const files=Array.from(gpxFilesInput.files||[]);
  if(files.length===0){
    msg.textContent="読み込むGPXファイルを選択してください．";
    msg.className="msg error";
    return;
  }

  let loaded=0,skipped=0;
  const newBounds=[];

  for(const file of files){
    const key=`${file.name}::${file.size}::${file.lastModified}`;
    if(importedGpxKeys.has(key)){skipped++;continue;}
    try{
      const text=await file.text();
      const beforeIds=new Set(measurements.map(item=>item.id));
      const record=parseAndImportGpx(text,file,importedGpxFiles.length);
      importedGpxFiles.push(record);
      importedGpxKeys.add(key);
      loaded++;
      measurements.filter(item=>!beforeIds.has(item.id)).forEach(item=>newBounds.push([item.latitude,item.longitude]));
    }catch(error){
      console.error(error);
      msg.textContent=error.message;
      msg.className="msg error";
    }
  }

  renderMeasurements();
  renderGpxFileList();
  if(newBounds.length>0)map.fitBounds(newBounds,{padding:[30,30],maxZoom:16});

  if(loaded>0){
    msg.textContent=`${loaded}個のGPXファイルを読み込みました．${skipped>0?`同一ファイル${skipped}個は重複のためスキップしました．`:""}`;
    msg.className="msg success";
  }else if(skipped>0){
    msg.textContent="選択したGPXはすでに読み込み済みです．";
    msg.className="msg";
  }
});

$("clearGpxTracks").addEventListener("click",()=>{
  gpxTrackLayer.clearLayers();
  importedGpxFiles=[];
  importedGpxKeys.clear();
  renderGpxFileList();
  msg.textContent="GPX軌跡を消去しました．GPX由来の位置ポイントは残しています．";
  msg.className="msg";
});

function csvEscape(value){
  const text=String(value??"");
  return text.includes(",")||text.includes('"')||text.includes("\n")||text.includes("\r")
    ?`"${text.replaceAll('"','""')}"`
    :text;
}
function downloadBlob(filename,blob){
  const url=URL.createObjectURL(blob);
  const link=document.createElement("a");
  link.href=url;
  link.download=filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

exportCsvButton.addEventListener("click",()=>{
  if(measurements.length===0)return;
  const header=["point_id","status","source","source_file","source_type","latitude","longitude","raw_strike","raw_dip","strike_azimuth_deg","dip_deg","dip_direction_deg","dip_direction_label","survey_date","lithology","structure_type","notes","gpx_time"];
  const rows=getSortedMeasurements().map(item=>[
    item.pointId,pointStatus(item),item.source,item.sourceFile,item.sourceType,
    item.latitude.toFixed(6),item.longitude.toFixed(6),item.rawStrike,item.rawDip,
    item.strike===null?"":item.strike.toFixed(1),
    item.dip===null?"":item.dip.toFixed(1),
    item.dipDirection===null?"":item.dipDirection.toFixed(1),
    item.dipDirectionLabel,item.surveyDate,item.lithology,item.structureType,item.notes,item.gpxTime
  ]);
  const csv=[header,...rows].map(row=>row.map(csvEscape).join(",")).join("\r\n");
  downloadBlob("strike_dip_points.csv",new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8"}));
  msg.textContent="CSVを出力しました．";
  msg.className="msg success";
});

exportGeoJsonButton.addEventListener("click",()=>{
  if(measurements.length===0)return;
  const geojson={
    type:"FeatureCollection",
    name:"strike_dip_points",
    features:getSortedMeasurements().map(item=>({
      type:"Feature",
      geometry:{type:"Point",coordinates:[item.longitude,item.latitude]},
      properties:{
        point_id:item.pointId,status:pointStatus(item),source:item.source,source_file:item.sourceFile,source_type:item.sourceType,
        raw_strike:item.rawStrike,raw_dip:item.rawDip,strike_azimuth_deg:item.strike,dip_deg:item.dip,dip_direction_deg:item.dipDirection,
        dip_direction_label:item.dipDirectionLabel,
        survey_date:item.surveyDate,
        lithology:item.lithology,
        structure_type:item.structureType,
        notes:item.notes,
        gpx_time:item.gpxTime
      }
    }))
  };
  downloadBlob("strike_dip_points.geojson",new Blob([JSON.stringify(geojson,null,2)],{type:"application/geo+json;charset=utf-8"}));
  msg.textContent="GeoJSONを出力しました．";
  msg.className="msg success";
});

function timestampText(){
  const now=new Date();
  const pad=value=>String(value).padStart(2,"0");
  return `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

async function captureMapCanvas(){
  map.closePopup();
  mapElement.classList.add("exporting");
  await new Promise(resolve=>setTimeout(resolve,300));
  try{
    return await html2canvas(mapElement,{useCORS:true,backgroundColor:"#ffffff",scale:2,logging:false});
  } finally {
    mapElement.classList.remove("exporting");
  }
}

exportPngButton.addEventListener("click",async()=>{
  try{
    msg.textContent="PNG画像を作成しています．";
    msg.className="msg success";
    const canvas=await captureMapCanvas();
    canvas.toBlob(blob=>{
      if(!blob){msg.textContent="PNG画像の生成に失敗しました．";msg.className="msg error";return;}
      downloadBlob(`strike_dip_map_${timestampText()}.png`,blob);
      msg.textContent="PNG画像を出力しました．";
      msg.className="msg success";
    },"image/png");
  }catch(error){
    console.error(error);
    msg.textContent="PNG画像の生成に失敗しました．";
    msg.className="msg error";
  }
});

exportJpegButton.addEventListener("click",async()=>{
  try{
    msg.textContent="JPEG画像を作成しています．";
    msg.className="msg success";
    const canvas=await captureMapCanvas();
    canvas.toBlob(blob=>{
      if(!blob){msg.textContent="JPEG画像の生成に失敗しました．";msg.className="msg error";return;}
      downloadBlob(`strike_dip_map_${timestampText()}.jpg`,blob);
      msg.textContent="JPEG画像を出力しました．";
      msg.className="msg success";
    },"image/jpeg",0.95);
  }catch(error){
    console.error(error);
    msg.textContent="JPEG画像の生成に失敗しました．";
    msg.className="msg error";
  }
});

exportPdfButton.addEventListener("click",async()=>{
  try{
    msg.textContent="PDFを作成しています．";
    msg.className="msg success";
    const canvas=await captureMapCanvas();
    const imgData=canvas.toDataURL("image/jpeg",0.95);
    const {jsPDF}=window.jspdf;
    const landscape=canvas.width>=canvas.height;
    const pdf=new jsPDF({orientation:landscape?"landscape":"portrait",unit:"mm",format:"a4"});
    const pageW=pdf.internal.pageSize.getWidth();
    const pageH=pdf.internal.pageSize.getHeight();
    const margin=10;
    const usableW=pageW-margin*2;
    const usableH=pageH-margin*2;
    const ratio=Math.min(usableW/canvas.width, usableH/canvas.height);
    const drawW=canvas.width*ratio;
    const drawH=canvas.height*ratio;
    const x=(pageW-drawW)/2;
    const y=(pageH-drawH)/2;
    pdf.addImage(imgData,"JPEG",x,y,drawW,drawH);
    pdf.save(`strike_dip_map_${timestampText()}.pdf`);
    msg.textContent="PDFを出力しました．";
    msg.className="msg success";
  }catch(error){
    console.error(error);
    msg.textContent="PDFの生成に失敗しました．";
    msg.className="msg error";
  }
});

function buildProjectState(){
  const center=map.getCenter();
  return {
    appName:"geology-strike-dip-map",
    version:"0.9.0",
    savedAt:new Date().toISOString(),
    mapState:{
      center:[center.lat,center.lng],
      zoom:map.getZoom(),
      baseLayerName:currentBaseLayerName
    },
    sortState:{
      sortKey,sortAscending
    },
    displayState:{
      symbolScalePercent
    },
    tableDrafts:Array.from(tableDrafts.entries()),
    points:measurements.map(plainPoint),
    gpxFiles:importedGpxFiles.map(file=>({
      name:file.name,
      waypointCount:file.waypointCount,
      routePointCount:file.routePointCount,
      trackCount:file.trackCount,
      trackPointCount:file.trackPointCount,
      color:file.color,
      segments:file.segments||[]
    }))
  };
}

$("saveProjectJson").addEventListener("click",()=>{
  const state=buildProjectState();
  downloadBlob(
    `strike_dip_project_${timestampText()}.json`,
    new Blob([JSON.stringify(state,null,2)],{type:"application/json;charset=utf-8"})
  );
  msg.textContent="作業状態をJSONで保存しました．";
  msg.className="msg success";
});

function clearAllState(){
  measurementLayer.clearLayers();
  gpxTrackLayer.clearLayers();
  if(temporaryMarker){map.removeLayer(temporaryMarker);temporaryMarker=null;}
  measurements=[];
  tableDrafts.clear();
  importedGpxFiles=[];
  importedGpxKeys.clear();
  nextInternalId=1;
  nextCreatedOrder=1;
  editingId=null;
  resetForm();
}

function applyProjectState(state){
  clearAllState();

  if(state.sortState){
    sortKey=state.sortState.sortKey||"createdOrder";
    sortAscending=state.sortState.sortAscending!==false;
  }

  if(state.displayState){
    updateSymbolSize(state.displayState.symbolScalePercent??100,false);
  }else{
    updateSymbolSize(100,false);
  }

  (state.points||[]).forEach(point=>createPoint(point));

  (state.tableDrafts||[]).forEach(entry=>{
    if(Array.isArray(entry)&&entry.length===2){
      const id=Number(entry[0]);
      if(measurements.some(item=>item.id===id)){
        tableDrafts.set(id,entry[1]||{});
      }
    }
  });

  importedGpxFiles=(state.gpxFiles||[]).map(file=>({
    name:file.name||"project-track",
    waypointCount:file.waypointCount||0,
    routePointCount:file.routePointCount||0,
    trackCount:file.trackCount||0,
    trackPointCount:file.trackPointCount||0,
    color:file.color||"#1f77b4",
    segments:file.segments||[]
  }));

  redrawAllGpxTracks();

  if(state.mapState){
    const targetName=state.mapState.baseLayerName;
    if(targetName&&baseLayers[targetName]&&targetName!==currentBaseLayerName){
      Object.entries(baseLayers).forEach(([name,layer])=>{
        if(map.hasLayer(layer)&&name!==targetName)map.removeLayer(layer);
      });
      if(!map.hasLayer(baseLayers[targetName]))baseLayers[targetName].addTo(map);
      currentBaseLayerName=targetName;
    }

    if(Array.isArray(state.mapState.center)&&state.mapState.center.length===2){
      map.setView(state.mapState.center,state.mapState.zoom??12);
    }
  }

  renderMeasurements();
  renderGpxFileList();
}

$("loadProjectJson").addEventListener("click",async()=>{
  const file=loadProjectFileInput.files?.[0];
  if(!file){
    msg.textContent="読み込むJSONファイルを選択してください．";
    msg.className="msg error";
    return;
  }

  try{
    const text=await file.text();
    const state=JSON.parse(text);

    if(state.appName!=="geology-strike-dip-map"){
      throw new Error("このJSONは本ツールの保存形式ではない可能性があります．");
    }

    applyProjectState(state);
    msg.textContent="作業状態を読み込みました．";
    msg.className="msg success";
  }catch(error){
    console.error(error);
    msg.textContent="JSONの読込に失敗しました．";
    msg.className="msg error";
  }
});

updateSymbolSize(100,false);
parseAttitudeInputs(false);
renderMeasurements();
renderGpxFileList();
