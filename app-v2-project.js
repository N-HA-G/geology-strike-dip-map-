function buildProjectState(){
  const c=map.getCenter();
  return {
    appName:"geology-strike-dip-map",
    version:"0.24.0",
    savedAt:new Date().toISOString(),
    mapState:{center:[c.lat,c.lng],zoom:map.getZoom(),baseLayerName:currentBaseLayerName},
    displayState:{showPointId,pointIdDistancePx,showDipValue,showStrikeValue,useCorrectedValues,symbolScalePercent,autoDeclutterEnabled,declutterGapPx,showLineLabels},
    declinationState:{signed:globalDeclinationSigned,direction:declinationDirectionInput.value,value:Number(declinationValueInput.value)||0},
    exportState:{
      ...getExportSettings(),
      filename:outputFilenameInput.value,
      title:outputTitleInput.value,
      date:outputDateInput.value,
      author:outputAuthorInput.value,
      info:outputInfoInput.value
    },
    viewTemplates:getTemplates(),
    colorDefinitions:colorDefinitions.map(x=>({...x})),nextColorDefinitionId,
    points:measurements.map(plainPoint),gpxFiles:importedGpxFiles,interpretationLines:interpretationLinesForProject(),distanceMeasurement:distanceMeasurementForProject()
  };
}

$("saveProjectJson").addEventListener("click",()=>{
  if(!confirmAction("現在の作業状態をJSONで保存します．"))return;
  downloadBlob(
    `${sanitizeFilename(outputFilenameInput.value)}_project_${timestampText()}.json`,
    new Blob([JSON.stringify(buildProjectState(),null,2)],{type:"application/json;charset=utf-8"})
  );
});

function clearAllState(){
  measurementLayer.clearLayers();declutterLeaderLayer.clearLayers();gpxTrackLayer.clearLayers();
  clearInterpretationLinesState();
  clearDistanceMeasurementState({silent:true});
  measurements=[];tableDrafts.clear();importedGpxFiles=[];importedGpxKeys.clear();
  colorDefinitions=[{id:"default",name:"標準",color:"#111111"}];nextColorDefinitionId=1;
  nextInternalId=1;nextCreatedOrder=1;editingId=null;resetForm();
}

function applyProjectState(state){
  clearAllState();
  if(Array.isArray(state.colorDefinitions)&&state.colorDefinitions.length)colorDefinitions=state.colorDefinitions;
  nextColorDefinitionId=Number(state.nextColorDefinitionId)||colorDefinitions.length+1;
  renderColorDefinitions();

  globalDeclinationSigned=Number(state.declinationState?.signed)||0;
  declinationDirectionInput.value=state.declinationState?.direction||(globalDeclinationSigned>=0?"E":"W");
  declinationValueInput.value=String(state.declinationState?.value??Math.abs(globalDeclinationSigned));
  (state.points||[]).forEach(createPoint);
  restoreInterpretationLines(state.interpretationLines||[]);
  restoreDistanceMeasurementState(state.distanceMeasurement||null);
  importedGpxFiles=state.gpxFiles||[];
  redrawAllGpxTracks();

  const d=state.displayState||{};
  showPointIdInput.checked=d.showPointId!==false;
  pointIdDistanceInput.value=String(d.pointIdDistancePx??31);
  showDipValueInput.checked=d.showDipValue!==false;
  showStrikeValueInput.checked=Boolean(d.showStrikeValue);
  useCorrectedValuesInput.checked=d.useCorrectedValues!==false;
  symbolSizeInput.value=String(d.symbolScalePercent??100);
  autoDeclutterInput.checked=d.autoDeclutterEnabled!==false;
  declutterGapInput.value=String(d.declutterGapPx??8);
  showLineLabelsInput.checked=d.showLineLabels!==false;
  showLineLabels=showLineLabelsInput.checked;
  interpretationLines.forEach(applyInterpretationLineLabel);
  updateDisplaySettings();

  const ex=state.exportState||{};
  if(ex.paperSize)paperSizeInput.value=ex.paperSize;
  if(ex.orientation)paperOrientationInput.value=ex.orientation;
  if(ex.marginMm!=null){paperMarginInput.disabled=false;marginPresetInput.value="custom";paperMarginInput.value=ex.marginMm;}
  if(ex.dpi)imageDpiInput.value=String(ex.dpi);
  lockPrintScaleInput.checked=Boolean(ex.fixedScale);
  outputScaleInput.value=String(ex.scaleDenominator??1000);
  outputFilenameInput.value=ex.filename||"strike_dip_map";
  outputTitleInput.value=ex.title||"";
  outputDateInput.value=ex.date||"";
  outputAuthorInput.value=ex.author||"";
  outputInfoInput.value=ex.info||"";

  // 位置・縮尺テンプレートもプロジェクトJSONに含めて復元する．
  // 旧バージョンのJSONにviewTemplatesがない場合は，現在ブラウザに保存済みのテンプレートを残す．
  if(Array.isArray(state.viewTemplates)){
    setTemplates(state.viewTemplates,{silent:true});
  }

  const ms=state.mapState;
  if(ms?.baseLayerName&&baseLayers[ms.baseLayerName]){
    Object.values(baseLayers).forEach(l=>map.removeLayer(l));
    baseLayers[ms.baseLayerName].addTo(map);
    currentBaseLayerName=ms.baseLayerName;
  }
  if(ms?.center)map.setView(ms.center,ms.zoom??16);
  renderMeasurements();renderGpxFileList();
}

$("loadProjectJson").addEventListener("click",async()=>{
  const file=loadProjectFileInput.files?.[0];
  if(!file){msg.textContent="JSONを選択してください．";return;}
  if(!confirmAction("現在の作業状態を置き換えてJSONを読み込みます．"))return;
  try{
    const state=JSON.parse(await file.text());
    if(state.appName!=="geology-strike-dip-map")throw new Error("本ツールのJSON形式ではありません．");
    applyProjectState(state);
    msg.textContent="作業状態を読み込みました．";msg.className="msg success";
  }catch(error){msg.textContent=error.message;msg.className="msg error";}
});

const TEMPLATE_KEY="strikeDipMapViewTemplatesV020";
const LEGACY_TEMPLATE_KEYS=["strikeDipMapViewTemplatesV014"];
let templateMemory=[];

function normalizeTemplateList(value){
  return Array.isArray(value)
    ?value.filter(t=>t&&typeof t==="object"&&String(t.name??"").trim()).map(t=>({...t,name:String(t.name).trim()}))
    :[];
}

function readTemplateStorage(){
  // 新キーを優先し，なければ旧キーから移行する．
  try{
    const current=localStorage.getItem(TEMPLATE_KEY);
    if(current!==null){
      const parsed=normalizeTemplateList(JSON.parse(current));
      templateMemory=parsed;
      return parsed;
    }

    for(const key of LEGACY_TEMPLATE_KEYS){
      const legacy=localStorage.getItem(key);
      if(legacy===null)continue;
      const parsed=normalizeTemplateList(JSON.parse(legacy));
      templateMemory=parsed;
      try{localStorage.setItem(TEMPLATE_KEY,JSON.stringify(parsed));}catch{}
      return parsed;
    }
  }catch(error){
    console.warn("位置・縮尺テンプレートの読み込みに失敗しました．",error);
  }
  return [...templateMemory];
}

function getTemplates(){
  return readTemplateStorage();
}

function setTemplates(value,{silent=false}={}){
  const list=normalizeTemplateList(value);
  templateMemory=list;
  let persistent=true;

  try{
    localStorage.setItem(TEMPLATE_KEY,JSON.stringify(list));
    // 書き込み直後に再読込して，実際に保存されたことを確認する．
    const verify=normalizeTemplateList(JSON.parse(localStorage.getItem(TEMPLATE_KEY)||"[]"));
    if(JSON.stringify(verify)!==JSON.stringify(list))persistent=false;
  }catch(error){
    persistent=false;
    console.warn("位置・縮尺テンプレートをブラウザへ保存できませんでした．",error);
  }

  renderTemplateOptions();

  if(!silent&&!persistent){
    msg.textContent="テンプレートは現在の画面では使えますが，ブラウザの保存領域へ書き込めませんでした．作業JSONを保存するとテンプレートも一緒に保持できます．";
    msg.className="msg error";
  }

  return persistent;
}

function renderTemplateOptions(selectedName=""){
  const list=getTemplates();
  viewTemplateSelect.innerHTML='<option value="">選択してください</option>'+list.map((t,i)=>{
    const scale=t.scaleDenominator?` ／ 1:${Number(t.scaleDenominator).toLocaleString("ja-JP")}`:"";
    return `<option value="${i}">${escapeHtml(t.name)}${scale}</option>`;
  }).join("");

  if(selectedName){
    const index=list.findIndex(t=>t.name===selectedName);
    if(index>=0)viewTemplateSelect.value=String(index);
  }
}

$("saveViewTemplate").addEventListener("click",()=>{
  const name=viewTemplateNameInput.value.trim();
  if(!name){msg.textContent="テンプレート名を入力してください．";msg.className="msg error";return;}
  const settings=getExportSettings();
  const scaleText=settings.fixedScale?`1:${settings.scaleDenominator.toLocaleString("ja-JP")}`:`地図Zoom ${Number(map.getZoom()).toFixed(2)}`;
  if(!confirmAction(`「${name}」として現在の位置・${scaleText}・表示／出力設定を保存します．`))return;
  const c=map.getCenter();
  const entry={
    name,
    center:[c.lat,c.lng],
    zoom:map.getZoom(),
    baseLayerName:currentBaseLayerName,
    paperSize:paperSizeInput.value,
    orientation:paperOrientationInput.value,
    marginMm:Number(paperMarginInput.value)||0,
    dpi:Number(imageDpiInput.value)||300,
    fixedScale:settings.fixedScale,
    scaleDenominator:settings.scaleDenominator,
    display:{showPointId,pointIdDistancePx,showDipValue,showStrikeValue,useCorrectedValues,symbolScalePercent,autoDeclutterEnabled,declutterGapPx,showLineLabels}
  };
  const list=getTemplates(),idx=list.findIndex(t=>t.name===name);
  if(idx>=0)list[idx]=entry;else list.push(entry);
  const persistent=setTemplates(list,{silent:true});
  renderTemplateOptions(name);
  viewTemplateNameInput.value=name;
  msg.textContent=persistent
    ?`テンプレート「${name}」を保存しました．次回ページを開いたときも保存済みテンプレートに残ります．`
    :`テンプレート「${name}」を現在の画面に保存しました．ブラウザの永続保存が使えないため，作業JSONにも保存しておくことをおすすめします．`;
  msg.className=persistent?"msg success":"msg error";
});

$("loadViewTemplate").addEventListener("click",()=>{
  const value=viewTemplateSelect.value;
  if(value==="")return;
  const t=getTemplates()[Number(value)];
  if(!t)return;
  if(t.baseLayerName&&baseLayers[t.baseLayerName]){
    Object.values(baseLayers).forEach(l=>map.removeLayer(l));
    baseLayers[t.baseLayerName].addTo(map);
    currentBaseLayerName=t.baseLayerName;
  }
  if(Array.isArray(t.center)&&t.center.length===2)map.setView(t.center,t.zoom??map.getZoom());
  paperSizeInput.value=t.paperSize||paperSizeInput.value;
  paperOrientationInput.value=t.orientation||paperOrientationInput.value;
  marginPresetInput.value="custom";paperMarginInput.disabled=false;paperMarginInput.value=t.marginMm??paperMarginInput.value;
  if(t.dpi)imageDpiInput.value=String(t.dpi);
  lockPrintScaleInput.checked=Boolean(t.fixedScale);
  outputScaleInput.value=String(t.scaleDenominator??1000);

  const d=t.display||{};
  showPointIdInput.checked=d.showPointId!==false;
  pointIdDistanceInput.value=String(d.pointIdDistancePx??31);
  showDipValueInput.checked=d.showDipValue!==false;
  showStrikeValueInput.checked=Boolean(d.showStrikeValue);
  useCorrectedValuesInput.checked=d.useCorrectedValues!==false;
  symbolSizeInput.value=String(d.symbolScalePercent??100);
  autoDeclutterInput.checked=d.autoDeclutterEnabled!==false;
  declutterGapInput.value=String(d.declutterGapPx??8);
  showLineLabelsInput.checked=d.showLineLabels!==false;
  showLineLabels=showLineLabelsInput.checked;
  interpretationLines.forEach(applyInterpretationLineLabel);
  updateDisplaySettings();

  viewTemplateNameInput.value=t.name;
  const scaleText=t.fixedScale?`縮尺 1:${Number(t.scaleDenominator??1000).toLocaleString("ja-JP")}`:`Zoom ${Number(t.zoom??map.getZoom()).toFixed(2)}`;
  msg.textContent=`テンプレート「${t.name}」を呼び出しました．${scaleText}を復元しました．`;
  msg.className="msg success";
});

$("deleteViewTemplate").addEventListener("click",()=>{
  const value=viewTemplateSelect.value;
  if(value==="")return;
  const idx=Number(value),list=getTemplates(),t=list[idx];
  if(!t)return;
  if(!confirmAction(`テンプレート「${t.name}」を削除します．`))return;
  list.splice(idx,1);setTemplates(list,{silent:true});
  viewTemplateSelect.value="";
  if(viewTemplateNameInput.value.trim()===t.name)viewTemplateNameInput.value="";
  msg.textContent=`テンプレート「${t.name}」を削除しました．`;
  msg.className="msg success";
});

outputDateInput.value=new Date().toISOString().slice(0,10);
renderColorDefinitions();renderMeasurements();renderGpxFileList();renderTemplateOptions();updateDisplaySettings();zoomSlider.value=String(map.getZoom());zoomValue.textContent=Number(map.getZoom()).toFixed(2);parseAttitudeInputs(false);
