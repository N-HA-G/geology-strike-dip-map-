// Version 0.24.0．地図上の距離測定．

const distanceMeasureLayer=L.layerGroup().addTo(map);
const distanceMeasureDraftLayer=L.layerGroup().addTo(map);

const startDistanceMeasureButton=$("startDistanceMeasure");
const finishDistanceMeasureButton=$("finishDistanceMeasure");
const undoDistancePointButton=$("undoDistancePoint");
const clearDistanceMeasureButton=$("clearDistanceMeasure");
const distanceTotalOutput=$("distanceTotal");
const distanceSegmentCountOutput=$("distanceSegmentCount");
const distancePointCountOutput=$("distancePointCount");
const distanceMeasureStatus=$("distanceMeasureStatus");

let distanceMeasureActive=false;
let distanceMeasurePoints=[];
let distanceMeasureFinished=false;

function formatMeasuredDistance(meters){
  const value=Number(meters)||0;
  if(value>=10000)return `${(value/1000).toFixed(2)} km`;
  if(value>=1000)return `${(value/1000).toFixed(3)} km`;
  if(value>=100)return `${value.toFixed(0)} m`;
  if(value>=10)return `${value.toFixed(1)} m`;
  return `${value.toFixed(2)} m`;
}

function segmentDistance(a,b){
  return map.distance(L.latLng(a),L.latLng(b));
}

function totalMeasuredDistance(){
  let total=0;
  for(let i=1;i<distanceMeasurePoints.length;i++){
    total+=segmentDistance(distanceMeasurePoints[i-1],distanceMeasurePoints[i]);
  }
  return total;
}

function midpointLatLng(a,b){
  return L.latLng(
    (Number(a.lat)+Number(b.lat))/2,
    (Number(a.lng)+Number(b.lng))/2
  );
}

function distanceLabelIcon(text,total=false){
  return L.divIcon({
    className:"",
    html:`<div class="${total?"distance-total-label":"distance-measure-label"}">${escapeHtml(text)}</div>`,
    iconSize:null,
    iconAnchor:[0,0]
  });
}

function distanceVertexIcon(){
  return L.divIcon({
    className:"distance-measure-vertex",
    html:"<span></span>",
    iconSize:[12,12],
    iconAnchor:[6,6]
  });
}

function updateDistanceReadout(){
  const total=totalMeasuredDistance();
  distanceTotalOutput.textContent=formatMeasuredDistance(total);
  distanceSegmentCountOutput.textContent=String(Math.max(0,distanceMeasurePoints.length-1));
  distancePointCountOutput.textContent=String(distanceMeasurePoints.length);

  if(distanceMeasureActive){
    distanceMeasureStatus.textContent=distanceMeasurePoints.length===0
      ?"計測中．始点をクリックしてください．"
      :distanceMeasurePoints.length===1
        ?"計測中．次の点をクリックしてください．"
        :`計測中．合計 ${formatMeasuredDistance(total)}．さらにクリックすると区間を追加できます．`;
  }else if(distanceMeasurePoints.length>=2){
    distanceMeasureStatus.textContent=`計測完了．合計 ${formatMeasuredDistance(total)}．`;
  }else{
    distanceMeasureStatus.textContent="待機中";
  }

  startDistanceMeasureButton.disabled=distanceMeasureActive;
  finishDistanceMeasureButton.disabled=!distanceMeasureActive||distanceMeasurePoints.length<2;
  undoDistancePointButton.disabled=!distanceMeasureActive||distanceMeasurePoints.length===0;
  clearDistanceMeasureButton.disabled=distanceMeasurePoints.length===0;
}

function redrawDistanceMeasurement(){
  distanceMeasureLayer.clearLayers();
  distanceMeasureDraftLayer.clearLayers();

  distanceMeasurePoints.forEach((point,index)=>{
    L.marker(point,{icon:distanceVertexIcon(),interactive:false})
      .bindTooltip(index===0?"始点":String(index+1),{direction:"top",offset:[0,-7],opacity:.8})
      .addTo(distanceMeasureLayer);
  });

  if(distanceMeasurePoints.length>=2){
    L.polyline(distanceMeasurePoints,{
      color:"#6a1b9a",
      weight:3,
      opacity:.9,
      lineCap:"round",
      lineJoin:"round",
      interactive:false
    }).addTo(distanceMeasureLayer);

    for(let i=1;i<distanceMeasurePoints.length;i++){
      const a=distanceMeasurePoints[i-1];
      const b=distanceMeasurePoints[i];
      const d=segmentDistance(a,b);
      L.marker(midpointLatLng(a,b),{
        icon:distanceLabelIcon(formatMeasuredDistance(d),false),
        interactive:false,
        keyboard:false
      }).addTo(distanceMeasureLayer);
    }

    const last=distanceMeasurePoints[distanceMeasurePoints.length-1];
    L.marker(last,{
      icon:distanceLabelIcon(`合計 ${formatMeasuredDistance(totalMeasuredDistance())}`,true),
      interactive:false,
      keyboard:false,
      zIndexOffset:500
    }).addTo(distanceMeasureLayer);
  }

  updateDistanceReadout();
}

function setDistanceMeasureMode(active){
  distanceMeasureActive=Boolean(active);
  window.__geologyDistanceMeasureActive=distanceMeasureActive;
  mapElement.classList.toggle("distance-measuring-active",distanceMeasureActive);
  updateDistanceReadout();
}

function startDistanceMeasurement(){
  if(distanceMeasureActive)return;
  if(window.__geologyLineDrawingActive){
    msg.textContent="地質解釈線を描画中です．先に線描画を確定または取消してください．";
    msg.className="msg error";
    return;
  }

  if(distanceMeasurePoints.length>0){
    if(!confirmAction("現在の距離計測結果を消して，新しい計測を開始します．"))return;
    distanceMeasurePoints=[];
    distanceMeasureFinished=false;
    redrawDistanceMeasurement();
  }

  setDistanceMeasureMode(true);
  distanceMeasureFinished=false;
  msg.textContent="距離計測を開始しました．地図をクリックして始点・経由点・終点を指定してください．";
  msg.className="msg success";
}

function finishDistanceMeasurement(){
  if(!distanceMeasureActive||distanceMeasurePoints.length<2)return;
  setDistanceMeasureMode(false);
  distanceMeasureFinished=true;
  redrawDistanceMeasurement();
  msg.textContent=`距離計測を終了しました．合計 ${formatMeasuredDistance(totalMeasuredDistance())}．`;
  msg.className="msg success";
}

function undoDistanceMeasurementPoint(){
  if(!distanceMeasureActive||distanceMeasurePoints.length===0)return;
  distanceMeasurePoints.pop();
  redrawDistanceMeasurement();
}

function clearDistanceMeasurementState({silent=false}={}){
  distanceMeasurePoints=[];
  distanceMeasureFinished=false;
  setDistanceMeasureMode(false);
  distanceMeasureLayer.clearLayers();
  distanceMeasureDraftLayer.clearLayers();
  updateDistanceReadout();
  if(!silent){
    msg.textContent="距離計測結果を消去しました．";
    msg.className="msg";
  }
}

function distanceMeasurementForProject(){
  return {
    points:distanceMeasurePoints.map(p=>({lat:Number(p.lat),lng:Number(p.lng)})),
    finished:distanceMeasureFinished
  };
}

function restoreDistanceMeasurementState(state){
  distanceMeasurePoints=(Array.isArray(state?.points)?state.points:[])
    .map(p=>L.latLng(Number(p.lat),Number(p.lng)))
    .filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lng));
  distanceMeasureFinished=Boolean(state?.finished)&&distanceMeasurePoints.length>=2;
  setDistanceMeasureMode(false);
  redrawDistanceMeasurement();
}

map.on("click",event=>{
  if(!distanceMeasureActive)return;
  distanceMeasurePoints.push(event.latlng);
  redrawDistanceMeasurement();
});

startDistanceMeasureButton.addEventListener("click",startDistanceMeasurement);
finishDistanceMeasureButton.addEventListener("click",finishDistanceMeasurement);
undoDistancePointButton.addEventListener("click",undoDistanceMeasurementPoint);
clearDistanceMeasureButton.addEventListener("click",()=>{
  if(!distanceMeasurePoints.length)return;
  if(!confirmAction("距離計測結果を消去します．"))return;
  clearDistanceMeasurementState();
});

document.addEventListener("keydown",event=>{
  if(!distanceMeasureActive)return;
  const tag=document.activeElement?.tagName?.toLowerCase();
  if(["input","textarea","select"].includes(tag))return;
  if(event.key==="Escape"){
    event.preventDefault();
    if(distanceMeasurePoints.length>=2)finishDistanceMeasurement();
    else clearDistanceMeasurementState({silent:true});
  }
  if(event.key==="Backspace"||event.key==="Delete"){
    event.preventDefault();
    undoDistanceMeasurementPoint();
  }
});

window.__geologyDistanceMeasureActive=false;
redrawDistanceMeasurement();
