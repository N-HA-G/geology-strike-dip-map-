const $=id=>document.getElementById(id);
const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
const normalizeAzimuth=angle=>((Number(angle)%360)+360)%360;
const angularDifference=(a,b)=>{const d=Math.abs(normalizeAzimuth(a)-normalizeAzimuth(b));return Math.min(d,360-d);};
const escapeHtml=value=>String(value??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
const confirmAction=message=>window.confirm(`${message}\n\n本当に良いですか？`);
const sanitizeFilename=value=>String(value||"strike_dip_map").trim().replace(/[\\/:*?"<>|]/g,"_").replace(/\s+/g,"_")||"strike_dip_map";
const timestampText=()=>{const n=new Date(),p=v=>String(v).padStart(2,"0");return `${n.getFullYear()}${p(n.getMonth()+1)}${p(n.getDate())}_${p(n.getHours())}${p(n.getMinutes())}${p(n.getSeconds())}`;};

const KUMAGAYA=[36.1084285,139.3621856];
const map=L.map("map",{maxZoom:24,minZoom:5,zoomSnap:.25,zoomDelta:.25,wheelPxPerZoomLevel:90}).setView(KUMAGAYA,16);
const attribution='<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">国土地理院</a>';
const tile=url=>L.tileLayer(url,{maxNativeZoom:18,maxZoom:24,attribution,crossOrigin:true});
const standard=tile("https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png");
const pale=tile("https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png");
const photo=tile("https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg");
const baseLayers={"地理院地図・標準":standard,"地理院地図・淡色":pale,"地理院地図・空中写真":photo};
let currentBaseLayerName="地理院地図・淡色"; pale.addTo(map);
const declutterLeaderLayer=L.layerGroup().addTo(map);
const measurementLayer=L.layerGroup().addTo(map);
const gpxTrackLayer=L.layerGroup().addTo(map);
L.control.layers(baseLayers,{"記号ずらし補助線":declutterLeaderLayer,"GPX軌跡":gpxTrackLayer},{collapsed:false}).addTo(map);
L.control.scale({position:"bottomleft",imperial:false,maxWidth:140}).addTo(map);
map.on("baselayerchange",e=>currentBaseLayerName=e.name);

const mapElement=$("map");
const northArrowElement=document.createElement("div");
northArrowElement.className="north-arrow";
northArrowElement.innerHTML='<div class="north-arrow-label">N</div><svg xmlns="http://www.w3.org/2000/svg" width="48" height="66" viewBox="0 0 54 74"><path d="M27 2 L45 48 L27 39 L9 48 Z" fill="#111" stroke="#fff" stroke-width="2"/><line x1="27" y1="38" x2="27" y2="70" stroke="#fff" stroke-width="8"/><line x1="27" y1="38" x2="27" y2="70" stroke="#111" stroke-width="4"/></svg>';
mapElement.appendChild(northArrowElement);

const pointForm=$("pointForm"),formTitle=$("formTitle"),savePointButton=$("savePoint"),cancelEditButton=$("cancelEdit");
const pointIdInput=$("pointId"),latInput=$("lat"),lngInput=$("lng"),strikeTextInput=$("strikeText"),dipTextInput=$("dipText"),surveyDateInput=$("surveyDate"),lithologyInput=$("lithology"),structureTypeInput=$("structureType"),colorGroupInput=$("colorGroup"),notesInput=$("notes");
const outStrike=$("outStrike"),outDip=$("outDip"),outDir=$("outDir"),outTrueStrike=$("outTrueStrike"),msg=$("msg"),count=$("count"),completeCount=$("completeCount"),pointTableBody=$("pointTableBody");
const showPointIdInput=$("showPointId"),pointIdDistanceInput=$("pointIdDistance"),pointIdDistanceValue=$("pointIdDistanceValue"),showDipValueInput=$("showDipValue"),showStrikeValueInput=$("showStrikeValue"),useCorrectedValuesInput=$("useCorrectedValues"),symbolSizeInput=$("symbolSize"),symbolSizeValue=$("symbolSizeValue"),autoDeclutterInput=$("autoDeclutter"),declutterGapInput=$("declutterGap"),declutterGapValue=$("declutterGapValue");
const declinationDirectionInput=$("declinationDirection"),declinationValueInput=$("declinationValue"),applyDeclinationAllButton=$("applyDeclinationAll");
const zoomSlider=$("zoomSlider"),zoomValue=$("zoomValue");
const newColorNameInput=$("newColorName"),newColorValueInput=$("newColorValue"),addColorDefinitionButton=$("addColorDefinition"),colorDefinitionList=$("colorDefinitionList");
const gpxFilesInput=$("gpxFiles"),excelFilesInput=$("excelFiles"),loadProjectFileInput=$("loadProjectFile"),gpxFileList=$("gpxFileList");
const applyTableChangesButton=$("applyTableChanges"),discardTableChangesButton=$("discardTableChanges"),draftStatus=$("draftStatus");
const bulkVisibilityFieldInput=$("bulkVisibilityField"),bulkVisibilityValueInput=$("bulkVisibilityValue"),bulkVisibilityCount=$("bulkVisibilityCount");
const showOnlyBulkMatchesButton=$("showOnlyBulkMatches"),showBulkMatchesButton=$("showBulkMatches"),hideBulkMatchesButton=$("hideBulkMatches"),showAllPointsButton=$("showAllPoints"),hideAllPointsButton=$("hideAllPoints");
const paperSizeInput=$("paperSize"),paperOrientationInput=$("paperOrientation"),marginPresetInput=$("marginPreset"),paperMarginInput=$("paperMargin"),imageDpiInput=$("imageDpi"),lockPrintScaleInput=$("lockPrintScale"),outputScaleInput=$("outputScale");
const outputFilenameInput=$("outputFilename"),outputTitleInput=$("outputTitle"),outputDateInput=$("outputDate"),outputAuthorInput=$("outputAuthor"),outputInfoInput=$("outputInfo");
const viewTemplateNameInput=$("viewTemplateName"),viewTemplateSelect=$("viewTemplateSelect");
const exportCsvButton=$("exportCsv"),exportGeoJsonButton=$("exportGeoJson"),exportPointExcelButton=$("exportPointExcel");

let measurements=[];
let nextInternalId=1,nextCreatedOrder=1,temporaryMarker=null,editingId=null;
let symbolScalePercent=100,autoDeclutterEnabled=true,declutterGapPx=8,declutterUpdateQueued=false;
let showPointId=true,pointIdDistancePx=31,showDipValue=true,showStrikeValue=false,useCorrectedValues=true;
let globalDeclinationSigned=0;
const tableDrafts=new Map();
let colorDefinitions=[{id:"default",name:"標準",color:"#111111"}],nextColorDefinitionId=1;
let importedGpxFiles=[];
const importedGpxKeys=new Set();
const gpxColors=["#1f77b4","#d62728","#2ca02c","#9467bd","#ff7f0e","#17becf","#8c564b","#7f7f7f"];

function normalizeGeologyInput(value){
  return String(value??"").normalize("NFKC").trim();
}
function parseStrike(value){
  const text=normalizeGeologyInput(value).toUpperCase().replaceAll("°","").replace(/\s+/g,"");
  if(/^\d+(\.\d+)?$/.test(text)){const n=Number(text);if(n>=0&&n<360)return normalizeAzimuth(n);throw new Error("数字の走向は0°以上360°未満で入力してください．");}
  const m=text.match(/^([NS])(\d+(?:\.\d+)?)([EW])$/); if(!m)throw new Error("走向の形式を確認してください．例．N30E，N30°E，030．");
  const ns=m[1],a=Number(m[2]),ew=m[3]; if(a<0||a>90)throw new Error("四分円表記の角度は0〜90°です．");
  if(ns==="N"&&ew==="E")return a;if(ns==="N"&&ew==="W")return normalizeAzimuth(360-a);if(ns==="S"&&ew==="E")return 180-a;return 180+a;
}
const directionAzimuths={N:0,NE:45,E:90,SE:135,S:180,SW:225,W:270,NW:315};
function parseDip(value,strike){
  const text=normalizeGeologyInput(value).toUpperCase().replaceAll("°","").replace(/\s+/g,"");
  const m=text.match(/^(\d+(?:\.\d+)?)(NE|SE|SW|NW|N|E|S|W)$/);if(!m)throw new Error("傾斜の形式を確認してください．例．45SE，45°NW．");
  const dip=Number(m[1]),directionLabel=m[2];if(dip<0||dip>90)throw new Error("傾斜角は0〜90°です．");
  const desired=directionAzimuths[directionLabel],c1=normalizeAzimuth(strike+90),c2=normalizeAzimuth(strike-90);
  return {dip,directionLabel,dipDirection:angularDifference(c1,desired)<=angularDifference(c2,desired)?c1:c2};
}
function currentDeclinationSigned(){const v=clamp(Number(declinationValueInput.value)||0,0,30);return declinationDirectionInput.value==="E"?v:-v;}
function correctedAzimuth(raw,declinationSigned){return raw==null?null:normalizeAzimuth(raw+Number(declinationSigned||0));}
function isExcludedAttitudeValue(value){
  const text=normalizeGeologyInput(value).toUpperCase().replace(/\s+/g,"");
  return ["非採用","除外","未採用","EXCLUDED","N/A","NA","-","―","—"].includes(text);
}
function parseAttitudePair(rawStrike,rawDip,declinationSigned=globalDeclinationSigned){
  const s=String(rawStrike??"").trim(),d=String(rawDip??"").trim(),dec=Number(declinationSigned||0);
  if(isExcludedAttitudeValue(s))return {hasAttitude:false,rawStrike:s,rawDip:d,strikeRaw:null,dip:null,dipDirectionRaw:null,dipDirectionLabel:"",declinationSigned:dec,strikeTrue:null,dipDirectionTrue:null};
  if(!s&&!d)return {hasAttitude:false,rawStrike:"",rawDip:"",strikeRaw:null,dip:null,dipDirectionRaw:null,dipDirectionLabel:"",declinationSigned:dec,strikeTrue:null,dipDirectionTrue:null};
  if(!s||!d)throw new Error("走向と傾斜は両方入力するか，両方空欄にしてください．");
  const strikeRaw=parseStrike(s),dipData=parseDip(d,strikeRaw);
  return {hasAttitude:true,rawStrike:s,rawDip:d,strikeRaw,dip:dipData.dip,dipDirectionRaw:dipData.dipDirection,dipDirectionLabel:dipData.directionLabel,declinationSigned:dec,strikeTrue:correctedAzimuth(strikeRaw,dec),dipDirectionTrue:correctedAzimuth(dipData.dipDirection,dec)};
}
function parseAttitudeInputs(showError=true){
  try{
    const att=parseAttitudePair(strikeTextInput.value,dipTextInput.value,currentDeclinationSigned());
    outStrike.textContent=att.hasAttitude?`${att.strikeRaw.toFixed(1)}°`:"未入力";outDip.textContent=att.hasAttitude?`${att.dip.toFixed(1)}°`:"未入力";outDir.textContent=att.hasAttitude?`${att.dipDirectionRaw.toFixed(1)}°`:"未入力";outTrueStrike.textContent=att.hasAttitude?`${att.strikeTrue.toFixed(1)}°`:"―";
    if(showError){msg.textContent="";msg.className="msg";}return att;
  }catch(error){outStrike.textContent=outDip.textContent=outDir.textContent=outTrueStrike.textContent="―";if(showError){msg.textContent=error.message;msg.className="msg error";}return null;}
}
strikeTextInput.addEventListener("input",()=>parseAttitudeInputs());dipTextInput.addEventListener("input",()=>parseAttitudeInputs());declinationDirectionInput.addEventListener("change",()=>parseAttitudeInputs(false));declinationValueInput.addEventListener("input",()=>parseAttitudeInputs(false));

function normalizeHexColor(value,fallback="#111111"){const t=String(value??"").trim();if(/^#[0-9a-f]{6}$/i.test(t))return t.toLowerCase();if(/^[0-9a-f]{6}$/i.test(t))return `#${t.toLowerCase()}`;return fallback;}
function getColorDefinition(id){return colorDefinitions.find(d=>d.id===id)||colorDefinitions[0];}
function findColorDefinitionByName(name){const k=String(name??"").trim().toLocaleLowerCase("ja");return k?colorDefinitions.find(d=>d.name.trim().toLocaleLowerCase("ja")===k)||null:null;}
function ensureColorDefinition(name,color="#111111"){const clean=String(name??"").trim();if(!clean)return getColorDefinition("default");const existing=findColorDefinitionByName(clean);if(existing){if(color)existing.color=normalizeHexColor(color,existing.color);return existing;}const d={id:`color-${nextColorDefinitionId++}`,name:clean,color:normalizeHexColor(color)};colorDefinitions.push(d);renderColorDefinitions();return d;}
function pointSymbolColor(item){return normalizeHexColor(getColorDefinition(item.colorDefinitionId||"default")?.color,"#111111");}
function renderColorGroupOptions(){const current=colorGroupInput.value||"default";colorGroupInput.innerHTML=colorDefinitions.map(d=>`<option value="${escapeHtml(d.id)}">${escapeHtml(d.name)}</option>`).join("");colorGroupInput.value=colorDefinitions.some(d=>d.id===current)?current:"default";}
function renderColorDefinitions(){renderColorGroupOptions();colorDefinitionList.innerHTML=colorDefinitions.map(d=>`<div class="color-definition-row" data-color-definition-id="${escapeHtml(d.id)}"><input class="color-definition-name" type="text" value="${escapeHtml(d.name)}" ${d.id==="default"?"readonly":""}><input class="color-definition-picker" type="color" value="${normalizeHexColor(d.color)}"><span class="color-definition-code">${normalizeHexColor(d.color)}</span><button type="button" class="delete-color-definition" ${d.id==="default"?"disabled":""}>削除</button></div>`).join("");}
addColorDefinitionButton.addEventListener("click",()=>{const name=newColorNameInput.value.trim();if(!name)return;if(findColorDefinitionByName(name)){msg.textContent="同じ色区分名があります．";msg.className="msg error";return;}ensureColorDefinition(name,newColorValueInput.value);newColorNameInput.value="";renderColorDefinitions();});
colorDefinitionList.addEventListener("change",e=>{const row=e.target.closest("[data-color-definition-id]");if(!row)return;const d=getColorDefinition(row.dataset.colorDefinitionId);if(e.target.classList.contains("color-definition-picker")){d.color=normalizeHexColor(e.target.value,d.color);rebuildAllMeasurementMarkers();renderColorDefinitions();}else if(e.target.classList.contains("color-definition-name")&&d.id!=="default"){const n=e.target.value.trim();if(n&&!colorDefinitions.some(x=>x.id!==d.id&&x.name===n))d.name=n;renderColorDefinitions();renderMeasurements();}});
colorDefinitionList.addEventListener("click",e=>{const b=e.target.closest(".delete-color-definition");if(!b)return;const id=b.closest("[data-color-definition-id]")?.dataset.colorDefinitionId;if(!id||id==="default")return;const d=getColorDefinition(id);if(!confirmAction(`色区分「${d.name}」を削除します．対象ポイントは標準色へ戻します．`))return;measurements.forEach(i=>{if(i.colorDefinitionId===id)i.colorDefinitionId="default";});colorDefinitions=colorDefinitions.filter(x=>x.id!==id);renderColorDefinitions();rebuildAllMeasurementMarkers();renderMeasurements();});

