const map=L.map("map").setView([34.93,139.85],12);

const attribution='<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">国土地理院</a>';
const tile=url=>L.tileLayer(url,{maxZoom:18,attribution,crossOrigin:true});
const standard=tile("https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png");
const pale=tile("https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png");
const photo=tile("https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg");

pale.addTo(map);

const measurementLayer=L.layerGroup().addTo(map);
const gpxTrackLayer=L.layerGroup().addTo(map);

L.control.layers(
  {
    "地理院地図・標準":standard,
    "地理院地図・淡色":pale,
    "地理院地図・空中写真":photo
  },
  {"GPX軌跡":gpxTrackLayer},
  {collapsed:false}
).addTo(map);

L.control.scale({position:"bottomleft",imperial:false,maxWidth:140}).addTo(map);

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
const outStrike=$("outStrike");
const outDip=$("outDip");
const outDir=$("outDir");
const msg=$("msg");
const count=$("count");
const completeCount=$("completeCount");
const pointTableBody=$("pointTableBody");
const gpxFilesInput=$("gpxFiles");
const gpxFileList=$("gpxFileList");
const exportCsvButton=$("exportCsv");
const exportGeoJsonButton=$("exportGeoJson");
const exportPngButton=$("exportPng");
const mapElement=$("map");

let measurements=[];
let nextInternalId=1;
let nextCreatedOrder=1;
let temporaryMarker=null;
let editingId=null;
let sortKey="createdOrder";
let sortAscending=true;

const importedGpxFiles=[];
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

  const ns=match[1];
  const angle=Number(match[2]);
  const ew=match[3];

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
    return {
      hasAttitude:false,rawStrike:"",rawDip:"",
      strike:null,dip:null,dipDirection:null,dipDirectionLabel:""
    };
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
  const size=76,center=38,strikeHalfLength=22,dipTickLength=14,radians=Math.PI/180;
  const strikeRadians=strike*radians,dipRadians=dipDirection*radians;
  const strikeX=Math.sin(strikeRadians),strikeY=-Math.cos(strikeRadians);
  const dipX=Math.sin(dipRadians),dipY=-Math.cos(dipRadians);

  const x1=center-strikeX*strikeHalfLength;
  const y1=center-strikeY*strikeHalfLength;
  const x2=center+strikeX*strikeHalfLength;
  const y2=center+strikeY*strikeHalfLength;
  const tickX=center+dipX*dipTickLength;
  const tickY=center+dipY*dipTickLength;
  const textX=center+dipX*24;
  const textY=center+dipY*24+4;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#111" stroke-width="2.4" stroke-linecap="round"/>
  <line x1="${center}" y1="${center}" x2="${tickX}" y2="${tickY}" stroke="#111" stroke-width="2.4" stroke-linecap="round"/>
  <text x="${textX}" y="${textY}" text-anchor="middle" dominant-baseline="middle" font-family="Arial,sans-serif" font-size="13" font-weight="700" fill="#111" stroke="#fff" stroke-width="3" paint-order="stroke">${Number(dip.toFixed(1))}</text>
  </svg>`;
}

function strikeDipIcon(strike,dip,dipDirection){
  return L.divIcon({
    className:"strike-dip-icon",
    html:strikeDipSvg(strike,dip,dipDirection),
    iconSize:[76,76],iconAnchor:[38,38]
  });
}

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
  return String(value??"")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

const pointStatus=item=>item.hasAttitude?"入力済み":"未入力";

function popupHtml(item){
  const attitude=item.hasAttitude
    ?`入力走向．${escapeHtml(item.rawStrike)}<br>入力傾斜．${escapeHtml(item.rawDip)}<br>走向方位角．${item.strike.toFixed(1)}°<br>傾斜角．${item.dip.toFixed(1)}°<br>傾斜方向．${item.dipDirection.toFixed(1)}°`
    :"<strong>走向・傾斜は未入力です．</strong><br>一覧の編集ボタンから入力できます．";

  return `<strong>${escapeHtml(item.pointId)}</strong><br>由来．${escapeHtml(item.source)}<br>緯度．${item.latitude.toFixed(6)}<br>経度．${item.longitude.toFixed(6)}<br>${attitude}`;
}

function buildMarker(item){
  const icon=item.hasAttitude
    ?strikeDipIcon(item.strike,item.dip,item.dipDirection)
    :positionPointIcon();

  item.marker=L.marker([item.latitude,item.longitude],{icon,title:item.pointId}).addTo(measurementLayer);
  item.marker.bindPopup(popupHtml(item));
}

function rebuildMarker(item){
  if(item.marker)measurementLayer.removeLayer(item.marker);
  buildMarker(item);
}

function createPoint(data){
  const item={
    id:nextInternalId++,
    createdOrder:nextCreatedOrder++,
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
    gpxTime:data.gpxTime||"",
    marker:null
  };
  measurements.push(item);
  buildMarker(item);
  return item;
}

function resetForm(){
  editingId=null;
  formTitle.textContent="ポイントを追加";
  savePointButton.textContent="ポイントを追加";
  cancelEditButton.hidden=true;
  strikeTextInput.value="";
  dipTextInput.value="";
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

  const latitude=Number(latInput.value);
  const longitude=Number(lngInput.value);

  if(!Number.isFinite(latitude)||latitude<-90||latitude>90){
    msg.textContent="緯度を確認してください．";
    msg.className="msg error";
    return;
  }

  if(!Number.isFinite(longitude)||longitude<-180||longitude>180){
    msg.textContent="経度を確認してください．";
    msg.className="msg error";
    return;
  }

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

    rebuildMarker(item);

    if(temporaryMarker){
      map.removeLayer(temporaryMarker);
      temporaryMarker=null;
    }

    renderMeasurements();
    msg.textContent=`${item.pointId} を更新しました．`;
    msg.className="msg success";
    item.marker.openPopup();
    resetForm();
    return;
  }

  const item=createPoint({
    pointId:inputPointId,
    latitude,longitude,
    source:"手動",
    sourceType:"manual",
    hasAttitude:attitude.hasAttitude,
    rawStrike:attitude.rawStrike,
    rawDip:attitude.rawDip,
    strike:attitude.strike,
    dip:attitude.dip,
    dipDirection:attitude.dipDirection,
    dipDirectionLabel:attitude.dipDirectionLabel
  });

  if(temporaryMarker){
    map.removeLayer(temporaryMarker);
    temporaryMarker=null;
  }

  renderMeasurements();

  msg.textContent=item.hasAttitude
    ?`${item.pointId} を走向・傾斜付きで追加しました．`
    :`${item.pointId} を位置ポイントとして追加しました．`;

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
    const av=comparableValue(a,sortKey);
    const bv=comparableValue(b,sortKey);

    if(av===null&&bv===null)return 0;
    if(av===null)return 1;
    if(bv===null)return -1;

    let result;
    if(typeof av==="number"&&typeof bv==="number"){
      result=av-bv;
    }else{
      result=String(av).localeCompare(String(bv),"ja",{numeric:true,sensitivity:"base"});
    }

    return sortAscending?result:-result;
  });
}

function updateSortButtons(){
  document.querySelectorAll(".sort-button").forEach(button=>{
    const active=button.dataset.sort===sortKey;
    button.classList.toggle("active",active);
    button.classList.toggle("desc",active&&!sortAscending);

    const th=button.closest("th");
    if(th){
      th.setAttribute("aria-sort",active?(sortAscending?"ascending":"descending"):"none");
    }
  });
}

document.querySelectorAll(".sort-button").forEach(button=>{
  button.addEventListener("click",()=>{
    const newKey=button.dataset.sort;

    if(sortKey===newKey){
      sortAscending=!sortAscending;
    }else{
      sortKey=newKey;
      sortAscending=true;
    }

    renderMeasurements();
  });
});

const formatNumberOrBlank=value=>Number.isFinite(value)?`${value.toFixed(1)}°`:"";

function renderMeasurements(){
  count.textContent=String(measurements.length);
  completeCount.textContent=String(measurements.filter(item=>item.hasAttitude).length);
  exportCsvButton.disabled=measurements.length===0;
  exportGeoJsonButton.disabled=measurements.length===0;
  pointTableBody.innerHTML="";

  const sorted=getSortedMeasurements();

  if(sorted.length===0){
    pointTableBody.innerHTML='<tr><td colspan="12" class="empty">まだポイントはありません．</td></tr>';
    updateSortButtons();
    return;
  }

  sorted.forEach((item,index)=>{
    const row=document.createElement("tr");
    row.innerHTML=`
      <td>${index+1}</td>
      <td>${escapeHtml(item.pointId)}</td>
      <td class="${item.hasAttitude?"status-complete":"status-pending"}">${pointStatus(item)}</td>
      <td>${escapeHtml(item.source)}</td>
      <td>${item.latitude.toFixed(6)}</td>
      <td>${item.longitude.toFixed(6)}</td>
      <td>${escapeHtml(item.rawStrike)}</td>
      <td>${escapeHtml(item.rawDip)}</td>
      <td>${formatNumberOrBlank(item.strike)}</td>
      <td>${formatNumberOrBlank(item.dip)}</td>
      <td>${formatNumberOrBlank(item.dipDirection)}</td>
      <td>
        <div class="table-actions">
          <button type="button" data-action="focus" data-id="${item.id}">地図へ</button>
          <button type="button" data-action="edit" data-id="${item.id}">編集</button>
          <button type="button" class="delete-button" data-action="delete" data-id="${item.id}">削除</button>
        </div>
      </td>`;
    pointTableBody.appendChild(row);
  });

  updateSortButtons();
}

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

  if(button.dataset.action==="edit"){
    startEditing(item);
  }

  if(button.dataset.action==="delete"){
    if(item.marker)measurementLayer.removeLayer(item.marker);
    measurements=measurements.filter(entry=>entry.id!==id);
    if(editingId===id)resetForm();
    renderMeasurements();
    msg.textContent=`${item.pointId} を削除しました．`;
    msg.className="msg";
  }
});

$("clearPoints").addEventListener("click",()=>{
  measurementLayer.clearLayers();
  if(temporaryMarker){
    map.removeLayer(temporaryMarker);
    temporaryMarker=null;
  }
  measurements=[];
  resetForm();
  renderMeasurements();
  msg.textContent="登録ポイントをすべて削除しました．";
  msg.className="msg";
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
    sourceFile,
    sourceType,
    gpxTime:directChildText(element,"time"),
    hasAttitude:false,
    rawStrike:"",
    rawDip:"",
    strike:null,
    dip:null,
    dipDirection:null,
    dipDirectionLabel:""
  };
}

function drawTrackSegment(points,color){
  if(points.length<2)return;
  L.polyline(points,{color,weight:3,opacity:.78}).addTo(gpxTrackLayer);
}

function parseAndImportGpx(xmlText,file,fileIndex){
  const parser=new DOMParser();
  const xml=parser.parseFromString(xmlText,"application/xml");

  if(xmlElements(xml,"parsererror").length>0){
    throw new Error(`${file.name} はGPX/XMLとして読み込めませんでした．`);
  }

  const color=gpxColors[fileIndex%gpxColors.length];

  let waypointCount=0;
  let routePointCount=0;
  let trackCount=0;
  let trackPointCount=0;

  xmlElements(xml,"wpt").forEach((element,index)=>{
    const point=readGpxPoint(
      element,
      `${file.name.replace(/\.gpx$/i,"")}_WPT${String(index+1).padStart(3,"0")}`,
      file.name,
      "gpx-wpt"
    );

    if(point){
      createPoint(point);
      waypointCount++;
    }
  });

  xmlElements(xml,"rte").forEach((route,routeIndex)=>{
    const routePoints=Array.from(route.children).filter(child=>child.localName==="rtept");
    const line=[];

    routePoints.forEach((element,pointIndex)=>{
      const point=readGpxPoint(
        element,
        `${file.name.replace(/\.gpx$/i,"")}_R${routeIndex+1}_${String(pointIndex+1).padStart(3,"0")}`,
        file.name,
        "gpx-rtept"
      );

      if(point){
        createPoint(point);
        routePointCount++;
        line.push([point.latitude,point.longitude]);
      }
    });

    drawTrackSegment(line,color);
  });

  xmlElements(xml,"trk").forEach(track=>{
    trackCount++;

    Array.from(track.children)
      .filter(child=>child.localName==="trkseg")
      .forEach(segment=>{
        const line=[];

        Array.from(segment.children)
          .filter(child=>child.localName==="trkpt")
          .forEach(trackPoint=>{
            const latitude=safeCoordinate(trackPoint.getAttribute("lat"),-90,90);
            const longitude=safeCoordinate(trackPoint.getAttribute("lon"),-180,180);

            if(latitude!==null&&longitude!==null){
              line.push([latitude,longitude]);
              trackPointCount++;
            }
          });

        drawTrackSegment(line,color);
      });
  });

  return {name:file.name,waypointCount,routePointCount,trackCount,trackPointCount,color};
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

  let loaded=0;
  let skipped=0;
  const newBounds=[];

  for(const file of files){
    const key=`${file.name}::${file.size}::${file.lastModified}`;

    if(importedGpxKeys.has(key)){
      skipped++;
      continue;
    }

    try{
      const text=await file.text();
      const beforeIds=new Set(measurements.map(item=>item.id));
      const result=parseAndImportGpx(text,file,importedGpxFiles.length);

      importedGpxFiles.push(result);
      importedGpxKeys.add(key);
      loaded++;

      measurements
        .filter(item=>!beforeIds.has(item.id))
        .forEach(item=>newBounds.push([item.latitude,item.longitude]));
    }catch(error){
      console.error(error);
      msg.textContent=error.message;
      msg.className="msg error";
    }
  }

  renderMeasurements();
  renderGpxFileList();

  if(newBounds.length>0){
    map.fitBounds(newBounds,{padding:[30,30],maxZoom:16});
  }

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
  msg.textContent="GPXの軌跡線を消去しました．GPX由来の位置ポイントは残しています．";
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

  const header=[
    "point_id","status","source","source_file","source_type",
    "latitude","longitude","raw_strike","raw_dip",
    "strike_azimuth_deg","dip_deg","dip_direction_deg",
    "dip_direction_label","gpx_time"
  ];

  const rows=getSortedMeasurements().map(item=>[
    item.pointId,
    pointStatus(item),
    item.source,
    item.sourceFile,
    item.sourceType,
    item.latitude.toFixed(6),
    item.longitude.toFixed(6),
    item.rawStrike,
    item.rawDip,
    item.strike===null?"":item.strike.toFixed(1),
    item.dip===null?"":item.dip.toFixed(1),
    item.dipDirection===null?"":item.dipDirection.toFixed(1),
    item.dipDirectionLabel,
    item.gpxTime
  ]);

  const csv=[header,...rows].map(row=>row.map(csvEscape).join(",")).join("\r\n");

  downloadBlob(
    "strike_dip_points.csv",
    new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8"})
  );

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
      geometry:{
        type:"Point",
        coordinates:[item.longitude,item.latitude]
      },
      properties:{
        point_id:item.pointId,
        status:pointStatus(item),
        source:item.source,
        source_file:item.sourceFile,
        source_type:item.sourceType,
        raw_strike:item.rawStrike,
        raw_dip:item.rawDip,
        strike_azimuth_deg:item.strike,
        dip_deg:item.dip,
        dip_direction_deg:item.dipDirection,
        dip_direction_label:item.dipDirectionLabel,
        gpx_time:item.gpxTime
      }
    }))
  };

  downloadBlob(
    "strike_dip_points.geojson",
    new Blob([JSON.stringify(geojson,null,2)],{type:"application/geo+json;charset=utf-8"})
  );

  msg.textContent="GeoJSONを出力しました．";
  msg.className="msg success";
});

function timestampText(){
  const now=new Date();
  const pad=value=>String(value).padStart(2,"0");
  return `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

exportPngButton.addEventListener("click",async()=>{
  try{
    msg.textContent="PNG画像を作成しています．";
    msg.className="msg success";

    map.closePopup();
    mapElement.classList.add("exporting");

    await new Promise(resolve=>setTimeout(resolve,300));

    const canvas=await html2canvas(mapElement,{
      useCORS:true,
      backgroundColor:"#ffffff",
      scale:2,
      logging:false
    });

    mapElement.classList.remove("exporting");

    canvas.toBlob(blob=>{
      if(!blob){
        msg.textContent="PNG画像の生成に失敗しました．";
        msg.className="msg error";
        return;
      }

      downloadBlob(`strike_dip_map_${timestampText()}.png`,blob);
      msg.textContent="PNG画像を出力しました．";
      msg.className="msg success";
    },"image/png");
  }catch(error){
    mapElement.classList.remove("exporting");
    msg.textContent="PNG画像の生成に失敗しました．";
    msg.className="msg error";
    console.error(error);
  }
});

parseAttitudeInputs(false);
renderMeasurements();
renderGpxFileList();
