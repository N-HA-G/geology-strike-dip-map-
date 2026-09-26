// Version 0.23.0．地質解釈線（褶曲軸・地質境界・断層など）の手動描画．

const interpretationLineLayer=L.layerGroup().addTo(map);
const interpretationDraftLayer=L.layerGroup().addTo(map);
const interpretationEditLayer=L.layerGroup().addTo(map);

const lineTypeInput=$("lineType");
const lineNameInput=$("lineName");
const lineCertaintyInput=$("lineCertainty");
const lineStyleInput=$("lineStyle");
const lineColorInput=$("lineColor");
const lineWidthInput=$("lineWidth");
const lineNotesInput=$("lineNotes");
const showLineLabelsInput=$("showLineLabels");
const startLineDrawingButton=$("startLineDrawing");
const finishLineDrawingButton=$("finishLineDrawing");
const undoLineVertexButton=$("undoLineVertex");
const cancelLineDrawingButton=$("cancelLineDrawing");
const updateSelectedLineButton=$("updateSelectedLine");
const finishLineEditButton=$("finishLineEdit");
const exportLineGeoJsonButton=$("exportLineGeoJson");
const clearInterpretationLinesButton=$("clearInterpretationLines");
const lineStatus=$("lineStatus");
const lineList=$("lineList");

const LINE_TYPE_LABELS={
  "fold-axis":"褶曲軸",
  "anticline-axis":"背斜軸",
  "syncline-axis":"向斜軸",
  "geologic-contact":"地質境界",
  "fault":"断層",
  "note-line":"任意線"
};
const LINE_TYPE_DEFAULTS={
  "fold-axis":{color:"#c62828",style:"solid",width:3},
  "anticline-axis":{color:"#c62828",style:"solid",width:3},
  "syncline-axis":{color:"#1565c0",style:"solid",width:3},
  "geologic-contact":{color:"#795548",style:"solid",width:2.5},
  "fault":{color:"#111111",style:"dashed",width:3},
  "note-line":{color:"#00875a",style:"dotted",width:2.5}
};

let interpretationLines=[];
let nextInterpretationLineId=1;
let lineDrawingActive=false;
let lineDraftLatLngs=[];
let lineDraftPolyline=null;
let selectedInterpretationLineId=null;
let lineVertexMarkers=[];
let showLineLabels=true;
let suppressLineTypeDefaults=false;

function lineTypeLabel(type){return LINE_TYPE_LABELS[type]||String(type||"線");}
function lineDashArray(style,certainty){
  if(style==="dashed")return "10,7";
  if(style==="dotted")return "2,7";
  if(certainty==="inferred")return "10,7";
  return null;
}
function normalizeLineWidth(value){return clamp(Number(value)||3,1,10);}
function interpretationLineStyle(item){
  return {
    color:normalizeHexColor(item.color,"#c62828"),
    weight:normalizeLineWidth(item.width),
    opacity:.92,
    dashArray:lineDashArray(item.style,item.certainty),
    lineCap:"round",
    lineJoin:"round"
  };
}
function linePlainObject(item){
  return {
    id:item.id,
    name:item.name,
    type:item.type,
    certainty:item.certainty,
    style:item.style,
    color:item.color,
    width:item.width,
    notes:item.notes,
    visible:item.visible!==false,
    createdAt:item.createdAt,
    latlngs:item.latlngs.map(p=>({lat:Number(p.lat),lng:Number(p.lng)}))
  };
}
function linePopupHtml(item){
  const fields=[
    `<strong>${escapeHtml(item.name||lineTypeLabel(item.type))}</strong>`,
    `種類．${escapeHtml(lineTypeLabel(item.type))}`,
    `確度．${item.certainty==="inferred"?"推定":"確認"}`,
    item.notes?`補足．${escapeHtml(item.notes).replaceAll("\n","<br>")}`:""
  ].filter(Boolean);
  return fields.join("<br>");
}
function lineCenterLatLng(item){
  const pts=item.latlngs||[];
  if(!pts.length)return null;
  if(pts.length===1)return L.latLng(pts[0]);
  const half=Math.floor((pts.length-1)/2);
  return L.latLng((pts[half].lat+pts[half+1].lat)/2,(pts[half].lng+pts[half+1].lng)/2);
}
function applyInterpretationLineLabel(item){
  if(!item.layer)return;
  item.layer.unbindTooltip();
  if(!showLineLabels||item.visible===false||!item.name)return;
  item.layer.bindTooltip(escapeHtml(item.name),{
    permanent:true,
    direction:"center",
    className:"interpretation-line-label",
    opacity:.94
  });
}
function buildInterpretationLineLayer(item){
  const layer=L.polyline(item.latlngs.map(p=>[p.lat,p.lng]),interpretationLineStyle(item));
  layer.bindPopup(linePopupHtml(item));
  layer.on("click",e=>{
    L.DomEvent.stopPropagation(e);
    if(lineDrawingActive)return;
    selectInterpretationLine(item.id,{focus:false,editVertices:false});
  });
  item.layer=layer;
  if(item.visible!==false)layer.addTo(interpretationLineLayer);
  applyInterpretationLineLabel(item);
}
function rebuildInterpretationLine(item){
  if(item.layer)interpretationLineLayer.removeLayer(item.layer);
  buildInterpretationLineLayer(item);
  if(selectedInterpretationLineId===item.id&&lineVertexMarkers.length)renderSelectedLineVertices(item);
}
function createInterpretationLine(data){
  const defaults=LINE_TYPE_DEFAULTS[data.type]||LINE_TYPE_DEFAULTS["note-line"];
  const item={
    id:Number(data.id)||nextInterpretationLineId++,
    name:String(data.name||"").trim(),
    type:data.type||"fold-axis",
    certainty:data.certainty==="inferred"?"inferred":"confirmed",
    style:["solid","dashed","dotted"].includes(data.style)?data.style:defaults.style,
    color:normalizeHexColor(data.color,defaults.color),
    width:normalizeLineWidth(data.width??defaults.width),
    notes:String(data.notes||""),
    visible:data.visible!==false,
    createdAt:data.createdAt||new Date().toISOString(),
    latlngs:(data.latlngs||[]).map(p=>L.latLng(Number(p.lat),Number(p.lng))),
    layer:null
  };
  if(item.latlngs.length<2)return null;
  interpretationLines.push(item);
  nextInterpretationLineId=Math.max(nextInterpretationLineId,item.id+1);
  buildInterpretationLineLayer(item);
  renderInterpretationLineList();
  updateLineExportAvailability();
  return item;
}
function autoLineName(type){
  const base=lineTypeLabel(type);
  const count=interpretationLines.filter(i=>i.type===type).length+1;
  return `${base}${count}`;
}
function currentLineFormData(){
  const type=lineTypeInput.value||"fold-axis";
  const defaults=LINE_TYPE_DEFAULTS[type]||LINE_TYPE_DEFAULTS["note-line"];
  return {
    type,
    name:lineNameInput.value.trim(),
    certainty:lineCertaintyInput.value==="inferred"?"inferred":"confirmed",
    style:lineStyleInput.value||defaults.style,
    color:normalizeHexColor(lineColorInput.value,defaults.color),
    width:normalizeLineWidth(lineWidthInput.value),
    notes:lineNotesInput.value.trim()
  };
}
function setLineFormFromItem(item){
  suppressLineTypeDefaults=true;
  lineTypeInput.value=item.type;
  lineNameInput.value=item.name;
  lineCertaintyInput.value=item.certainty;
  lineStyleInput.value=item.style;
  lineColorInput.value=item.color;
  lineWidthInput.value=String(item.width);
  lineNotesInput.value=item.notes;
  suppressLineTypeDefaults=false;
}
function resetLineForm({keepType=true}={}){
  const type=keepType?lineTypeInput.value:"fold-axis";
  const defaults=LINE_TYPE_DEFAULTS[type]||LINE_TYPE_DEFAULTS["note-line"];
  lineNameInput.value="";
  lineCertaintyInput.value="confirmed";
  lineStyleInput.value=defaults.style;
  lineColorInput.value=defaults.color;
  lineWidthInput.value=String(defaults.width);
  lineNotesInput.value="";
}
function updateLineButtons(){
  finishLineDrawingButton.disabled=!lineDrawingActive||lineDraftLatLngs.length<2;
  undoLineVertexButton.disabled=!lineDrawingActive||lineDraftLatLngs.length===0;
  cancelLineDrawingButton.disabled=!lineDrawingActive;
  startLineDrawingButton.disabled=lineDrawingActive;
  const selected=interpretationLines.some(i=>i.id===selectedInterpretationLineId);
  updateSelectedLineButton.disabled=!selected||lineDrawingActive;
  finishLineEditButton.disabled=!selected||lineVertexMarkers.length===0||lineDrawingActive;
  lineStatus.textContent=lineDrawingActive
    ?`描画中．${lineDraftLatLngs.length}頂点（地図をクリックして頂点追加）`
    :selected
      ?`選択中．${interpretationLines.find(i=>i.id===selectedInterpretationLineId)?.name||"線"}`
      :"待機中";
}
function clearLineDraft(){
  interpretationDraftLayer.clearLayers();
  lineDraftLatLngs=[];
  lineDraftPolyline=null;
  updateLineButtons();
}
function redrawLineDraft(){
  interpretationDraftLayer.clearLayers();
  if(lineDraftLatLngs.length){
    lineDraftLatLngs.forEach((p,index)=>{
      L.circleMarker(p,{radius:4,color:"#b00020",weight:2,fillColor:"#fff",fillOpacity:1,interactive:false})
        .bindTooltip(String(index+1),{permanent:false})
        .addTo(interpretationDraftLayer);
    });
  }
  if(lineDraftLatLngs.length>=2){
    lineDraftPolyline=L.polyline(lineDraftLatLngs,{...interpretationLineStyle({...currentLineFormData(),visible:true}),opacity:.68,dashArray:"6,5",interactive:false}).addTo(interpretationDraftLayer);
  }
  updateLineButtons();
}
function setLineDrawingMode(active){
  lineDrawingActive=Boolean(active);
  window.__geologyLineDrawingActive=lineDrawingActive;
  mapElement.classList.toggle("line-drawing-active",lineDrawingActive);
  updateLineButtons();
}
function startLineDrawing(){
  if(lineDrawingActive)return;
  if(window.__geologyDistanceMeasureActive){
    msg.textContent="距離計測中です．先に「計測終了」または「計測線を消去」を実行してください．";
    msg.className="msg error";
    return;
  }
  finishVertexEdit();
  selectedInterpretationLineId=null;
  clearLineDraft();
  setLineDrawingMode(true);
  msg.textContent="線描画を開始しました．地図をクリックして頂点を追加し，「線を確定」で終了します．";
  msg.className="msg success";
}
function finishLineDrawing(){
  if(!lineDrawingActive||lineDraftLatLngs.length<2)return;
  const attrs=currentLineFormData();
  if(!attrs.name)attrs.name=autoLineName(attrs.type);
  const item=createInterpretationLine({...attrs,latlngs:lineDraftLatLngs});
  setLineDrawingMode(false);
  clearLineDraft();
  if(item){
    selectInterpretationLine(item.id,{focus:false,editVertices:false});
    msg.textContent=`${item.name} を追加しました．`;
    msg.className="msg success";
  }
  resetLineForm({keepType:true});
}
function cancelLineDrawing(){
  if(lineDraftLatLngs.length&&!confirmAction("描画中の線を破棄します．"))return;
  setLineDrawingMode(false);
  clearLineDraft();
  msg.textContent="線描画をキャンセルしました．";
  msg.className="msg";
}
function undoLineVertex(){
  if(!lineDraftLatLngs.length)return;
  lineDraftLatLngs.pop();
  redrawLineDraft();
}
function finishVertexEdit(){
  interpretationEditLayer.clearLayers();
  lineVertexMarkers=[];
  updateLineButtons();
}
function renderSelectedLineVertices(item){
  finishVertexEdit();
  if(!item)return;
  item.latlngs.forEach((p,index)=>{
    const marker=L.marker(p,{
      draggable:true,
      icon:L.divIcon({className:"line-vertex-handle",html:'<span></span>',iconSize:[16,16],iconAnchor:[8,8]})
    }).addTo(interpretationEditLayer);
    marker.on("drag",e=>{
      item.latlngs[index]=e.target.getLatLng();
      item.layer?.setLatLngs(item.latlngs);
      applyInterpretationLineLabel(item);
    });
    marker.on("dragend",()=>{renderInterpretationLineList();});
    lineVertexMarkers.push(marker);
  });
  updateLineButtons();
}
function selectInterpretationLine(id,{focus=false,editVertices=false}={}){
  const item=interpretationLines.find(i=>i.id===Number(id));
  if(!item)return;
  selectedInterpretationLineId=item.id;
  setLineFormFromItem(item);
  if(focus&&item.layer){
    const bounds=item.layer.getBounds();
    if(bounds.isValid())map.fitBounds(bounds,{padding:[50,50],maxZoom:20});
  }
  if(editVertices)renderSelectedLineVertices(item);else finishVertexEdit();
  renderInterpretationLineList();
  updateLineButtons();
}
function updateSelectedLine(){
  const item=interpretationLines.find(i=>i.id===selectedInterpretationLineId);
  if(!item)return;
  const attrs=currentLineFormData();
  if(!attrs.name)attrs.name=autoLineName(attrs.type);
  Object.assign(item,attrs);
  rebuildInterpretationLine(item);
  renderInterpretationLineList();
  msg.textContent=`${item.name} の属性を更新しました．`;
  msg.className="msg success";
}
function deleteInterpretationLine(id){
  const item=interpretationLines.find(i=>i.id===Number(id));
  if(!item)return;
  if(!confirmAction(`線「${item.name||lineTypeLabel(item.type)}」を削除します．`))return;
  if(item.layer)interpretationLineLayer.removeLayer(item.layer);
  interpretationLines=interpretationLines.filter(i=>i.id!==item.id);
  if(selectedInterpretationLineId===item.id){selectedInterpretationLineId=null;finishVertexEdit();resetLineForm({keepType:true});}
  renderInterpretationLineList();
  updateLineExportAvailability();
}
function setInterpretationLineVisibility(item,visible){
  item.visible=Boolean(visible);
  if(item.visible){if(item.layer&&!interpretationLineLayer.hasLayer(item.layer))item.layer.addTo(interpretationLineLayer);}else if(item.layer&&interpretationLineLayer.hasLayer(item.layer)){interpretationLineLayer.removeLayer(item.layer);}
  applyInterpretationLineLabel(item);
}
function renderInterpretationLineList(){
  if(!lineList)return;
  if(!interpretationLines.length){
    lineList.innerHTML='<div class="line-list-empty">まだ線はありません．</div>';
    updateLineButtons();
    return;
  }
  lineList.innerHTML=interpretationLines.map(item=>`
    <div class="interpretation-line-row ${item.id===selectedInterpretationLineId?"selected":""}" data-line-id="${item.id}">
      <input class="line-visibility" type="checkbox" ${item.visible!==false?"checked":""} aria-label="${escapeHtml(item.name)}を表示">
      <span class="line-swatch" style="background:${escapeHtml(item.color)}"></span>
      <div class="line-row-main">
        <strong>${escapeHtml(item.name||lineTypeLabel(item.type))}</strong>
        <small>${escapeHtml(lineTypeLabel(item.type))}・${item.certainty==="inferred"?"推定":"確認"}・${item.latlngs.length}頂点</small>
      </div>
      <div class="line-row-actions">
        <button type="button" data-line-action="focus">地図へ</button>
        <button type="button" data-line-action="edit">頂点編集</button>
        <button type="button" data-line-action="select">属性</button>
        <button type="button" class="danger" data-line-action="delete">削除</button>
      </div>
    </div>
  `).join("");
  updateLineButtons();
}
function updateLineExportAvailability(){
  if(exportLineGeoJsonButton)exportLineGeoJsonButton.disabled=interpretationLines.length===0;
}
function lineGeoJsonFeature(item){
  return {
    type:"Feature",
    geometry:{type:"LineString",coordinates:item.latlngs.map(p=>[Number(p.lng),Number(p.lat)])},
    properties:{
      feature_class:"interpretation_line",
      line_id:item.id,
      name:item.name,
      line_type:item.type,
      line_type_label:lineTypeLabel(item.type),
      certainty:item.certainty,
      line_style:item.style,
      color:item.color,
      width_px:item.width,
      visible:item.visible!==false,
      notes:item.notes,
      created_at:item.createdAt
    }
  };
}
function exportInterpretationLinesGeoJson(){
  if(!interpretationLines.length)return;
  const geo={type:"FeatureCollection",name:"geologic_interpretation_lines",features:interpretationLines.map(lineGeoJsonFeature)};
  downloadBlob(`${sanitizeFilename(outputFilenameInput.value)}_lines.geojson`,new Blob([JSON.stringify(geo,null,2)],{type:"application/geo+json;charset=utf-8"}));
  msg.textContent="解釈線GeoJSONを出力しました．QGISではLineStringレイヤとして読み込めます．";
  msg.className="msg success";
}
function clearInterpretationLinesState(){
  interpretationLineLayer.clearLayers();
  interpretationDraftLayer.clearLayers();
  interpretationEditLayer.clearLayers();
  interpretationLines=[];
  nextInterpretationLineId=1;
  selectedInterpretationLineId=null;
  lineVertexMarkers=[];
  setLineDrawingMode(false);
  clearLineDraft();
  renderInterpretationLineList();
  updateLineExportAvailability();
}
function restoreInterpretationLines(list){
  clearInterpretationLinesState();
  (Array.isArray(list)?list:[]).forEach(createInterpretationLine);
  renderInterpretationLineList();
}
function interpretationLinesForProject(){return interpretationLines.map(linePlainObject);}

map.on("click",e=>{
  if(!lineDrawingActive)return;
  lineDraftLatLngs.push(e.latlng);
  redrawLineDraft();
});

lineTypeInput.addEventListener("change",()=>{
  if(suppressLineTypeDefaults)return;
  const defaults=LINE_TYPE_DEFAULTS[lineTypeInput.value]||LINE_TYPE_DEFAULTS["note-line"];
  lineColorInput.value=defaults.color;
  lineStyleInput.value=defaults.style;
  lineWidthInput.value=String(defaults.width);
  redrawLineDraft();
});
[lineCertaintyInput,lineStyleInput,lineColorInput,lineWidthInput].forEach(el=>el.addEventListener("input",()=>{if(lineDrawingActive)redrawLineDraft();}));
showLineLabelsInput.addEventListener("change",()=>{
  showLineLabels=showLineLabelsInput.checked;
  interpretationLines.forEach(applyInterpretationLineLabel);
});
startLineDrawingButton.addEventListener("click",startLineDrawing);
finishLineDrawingButton.addEventListener("click",finishLineDrawing);
undoLineVertexButton.addEventListener("click",undoLineVertex);
cancelLineDrawingButton.addEventListener("click",cancelLineDrawing);
updateSelectedLineButton.addEventListener("click",updateSelectedLine);
finishLineEditButton.addEventListener("click",()=>{finishVertexEdit();msg.textContent="頂点編集を終了しました．";msg.className="msg success";});
exportLineGeoJsonButton.addEventListener("click",exportInterpretationLinesGeoJson);
clearInterpretationLinesButton.addEventListener("click",()=>{
  if(!interpretationLines.length)return;
  if(!confirmAction("すべての解釈線を削除します．"))return;
  clearInterpretationLinesState();
  msg.textContent="解釈線をすべて削除しました．";
  msg.className="msg";
});
lineList.addEventListener("change",e=>{
  const row=e.target.closest("[data-line-id]");
  if(!row||!e.target.classList.contains("line-visibility"))return;
  const item=interpretationLines.find(i=>i.id===Number(row.dataset.lineId));
  if(!item)return;
  setInterpretationLineVisibility(item,e.target.checked);
});
lineList.addEventListener("click",e=>{
  const button=e.target.closest("button[data-line-action]");
  if(!button)return;
  const row=button.closest("[data-line-id]");
  const id=Number(row?.dataset.lineId);
  if(button.dataset.lineAction==="focus")selectInterpretationLine(id,{focus:true,editVertices:false});
  if(button.dataset.lineAction==="edit")selectInterpretationLine(id,{focus:false,editVertices:true});
  if(button.dataset.lineAction==="select")selectInterpretationLine(id,{focus:false,editVertices:false});
  if(button.dataset.lineAction==="delete")deleteInterpretationLine(id);
});

document.addEventListener("keydown",e=>{
  if(e.key==="Escape"&&lineDrawingActive){e.preventDefault();cancelLineDrawing();}
  if((e.key==="Backspace"||e.key==="Delete")&&lineDrawingActive&&document.activeElement===document.body){e.preventDefault();undoLineVertex();}
});

resetLineForm({keepType:true});
showLineLabelsInput.checked=true;
renderInterpretationLineList();
updateLineExportAvailability();
updateLineButtons();
