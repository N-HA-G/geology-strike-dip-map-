const PAGE_SIZES_MM={A5:{width:148,height:210},A4:{width:210,height:297},A3:{width:297,height:420},B5:{width:182,height:257},B4:{width:257,height:364},Letter:{width:216,height:279}};

// ブラウザのCanvas上限を越える巨大画像は，生成自体が成功しても真っ白になることがある．
// 特にA3×900/1200dpiは数億画素になるため，ラスタ出力だけ安全な実効DPIへ自動調整する．
// PDFは巨大Canvasを作らず，地図画像を直接PDFへ配置するためこの制限を受けにくい．
const MAX_RASTER_SIDE_PX=16384;
const MAX_RASTER_PIXELS=75000000;

marginPresetInput.addEventListener("change",()=>{
  if(marginPresetInput.value!=="custom")paperMarginInput.value=marginPresetInput.value;
  paperMarginInput.disabled=marginPresetInput.value!=="custom";
});
paperMarginInput.disabled=true;

function getExportSettings(){
  const paperSize=PAGE_SIZES_MM[paperSizeInput.value]?paperSizeInput.value:"A4";
  const orientation=paperOrientationInput.value==="portrait"?"portrait":"landscape";
  const marginMm=clamp(Number(paperMarginInput.value)||0,0,40);
  const requestedDpi=clamp(Number(imageDpiInput.value)||300,150,1200);
  return {paperSize,orientation,marginMm,dpi:requestedDpi,requestedDpi};
}

function pageSizeMm(s){
  const b=PAGE_SIZES_MM[s.paperSize];
  return s.orientation==="landscape"?{width:b.height,height:b.width}:{width:b.width,height:b.height};
}

const mmToPx=(mm,dpi)=>Math.max(1,Math.round(mm/25.4*dpi));

function safeRasterDpi(settings){
  const page=pageSizeMm(settings);
  const requested=settings.requestedDpi??settings.dpi;
  const requestedW=page.width/25.4*requested;
  const requestedH=page.height/25.4*requested;
  const requestedPixels=requestedW*requestedH;

  let factor=1;
  factor=Math.min(factor,MAX_RASTER_SIDE_PX/requestedW,MAX_RASTER_SIDE_PX/requestedH);
  factor=Math.min(factor,Math.sqrt(MAX_RASTER_PIXELS/requestedPixels));

  if(factor>=1)return requested;

  // 端数DPIは分かりにくいので10dpi単位で安全側へ切り下げる．
  return Math.max(150,Math.floor((requested*factor)/10)*10);
}

async function waitForMapReady(){
  if(document.fonts?.ready){
    try{await document.fonts.ready;}catch(_){/* ignore */}
  }
  map.invalidateSize(false);
  await new Promise(resolve=>setTimeout(resolve,350));
}

async function captureMapCanvas(dpi=300){
  map.closePopup();
  mapElement.classList.add("exporting");
  await waitForMapReady();
  try{
    const canvas=await html2canvas(mapElement,{
      useCORS:true,
      allowTaint:false,
      backgroundColor:"#ffffff",
      scale:Math.min(4,Math.max(2,dpi/150)),
      logging:false,
      imageTimeout:15000
    });
    if(!canvas||!canvas.width||!canvas.height){
      throw new Error("地図画像を取得できませんでした．地図タイルの読み込み後にもう一度お試しください．");
    }
    return canvas;
  }finally{
    mapElement.classList.remove("exporting");
  }
}

function metadataLines(){
  return [
    outputDateInput.value&&`日付：${outputDateInput.value}`,
    outputAuthorInput.value.trim()&&`作成者・調査名：${outputAuthorInput.value.trim()}`,
    outputInfoInput.value.trim()
  ].filter(Boolean);
}

function exportHeaderMm(){
  const title=outputTitleInput.value.trim();
  const meta=metadataLines();
  return (title||meta.length)?18+(meta.length*5):0;
}

async function composePrintCanvas(){
  const requested=getExportSettings();
  const effectiveDpi=safeRasterDpi(requested);
  const s={...requested,dpi:effectiveDpi};
  const page=pageSizeMm(s);
  const w=mmToPx(page.width,s.dpi);
  const h=mmToPx(page.height,s.dpi);

  const canvas=document.createElement("canvas");
  canvas.width=w;
  canvas.height=h;
  const ctx=canvas.getContext("2d");
  if(!ctx){
    throw new Error("出力用Canvasを作成できませんでした．DPIを下げて再試行してください．");
  }

  ctx.fillStyle="#ffffff";
  ctx.fillRect(0,0,w,h);

  const margin=mmToPx(s.marginMm,s.dpi);
  const title=outputTitleInput.value.trim();
  const meta=metadataLines();
  const headerMm=exportHeaderMm();
  const header=mmToPx(headerMm,s.dpi);

  ctx.fillStyle="#111111";
  ctx.textBaseline="top";
  if(title){
    ctx.font=`700 ${Math.max(16,Math.round(s.dpi*.055))}px 'BIZ UDPGothic','BIZ UDPゴシック',sans-serif`;
    ctx.fillText(title,margin,margin);
  }
  if(meta.length){
    ctx.font=`400 ${Math.max(12,Math.round(s.dpi*.035))}px 'BIZ UDPGothic','BIZ UDPゴシック',sans-serif`;
    meta.forEach((line,n)=>ctx.fillText(line,margin,margin+mmToPx(8,s.dpi)+n*mmToPx(5,s.dpi)));
  }

  // 地図のキャプチャ自体は過剰に巨大化させない．最終Canvasへ拡大配置する．
  const mapCaptureDpi=Math.min(s.dpi,600);
  const mapCanvas=await captureMapCanvas(mapCaptureDpi);
  const availableW=Math.max(1,w-margin*2);
  const availableH=Math.max(1,h-margin*2-header);
  const ratio=Math.min(availableW/mapCanvas.width,availableH/mapCanvas.height);
  const dw=Math.max(1,Math.round(mapCanvas.width*ratio));
  const dh=Math.max(1,Math.round(mapCanvas.height*ratio));
  const x=Math.round((w-dw)/2);
  const y=margin+header+Math.round((availableH-dh)/2);
  ctx.drawImage(mapCanvas,x,y,dw,dh);

  return {
    canvas,
    s,
    page,
    requestedDpi:requested.requestedDpi,
    effectiveDpi
  };
}

function dpiAdjustmentMessage(result){
  if(result.effectiveDpi===result.requestedDpi)return "";
  return `指定 ${result.requestedDpi} dpi はA3等では画像が巨大になり真っ白になる場合があるため，安全な ${result.effectiveDpi} dpiへ自動調整しました．`;
}

async function exportRaster(type){
  try{
    msg.textContent="画像を作成しています…";
    msg.className="msg success";
    const r=await composePrintCanvas();
    const base=sanitizeFilename(outputFilenameInput.value);
    const mime=type==="jpeg"?"image/jpeg":"image/png";
    const ext=type==="jpeg"?"jpg":"png";

    r.canvas.toBlob(blob=>{
      if(!blob){
        msg.textContent="画像生成に失敗しました．DPIを下げて再試行してください．";
        msg.className="msg error";
        return;
      }
      downloadBlob(`${base}_${r.s.paperSize}_${r.s.orientation}_${r.effectiveDpi}dpi.${ext}`,blob);
      const adjusted=dpiAdjustmentMessage(r);
      msg.textContent=adjusted||`${r.s.paperSize}・${r.effectiveDpi} dpiで出力しました．`;
      msg.className=adjusted?"msg":"msg success";
    },mime,.95);
  }catch(error){
    console.error(error);
    msg.textContent=error?.message||"画像生成に失敗しました．";
    msg.className="msg error";
  }
}

$("exportPng").addEventListener("click",()=>exportRaster("png"));
$("exportJpeg").addEventListener("click",()=>exportRaster("jpeg"));

// PDFはA3/高DPIでも巨大なページCanvasを作らない．
// 地図を適度な解像度で取得し，PDF上へ直接配置することで「真っ白」を避ける．
$("exportPdf").addEventListener("click",async()=>{
  try{
    const s=getExportSettings();
    const page=pageSizeMm(s);
    const marginMm=clamp(s.marginMm,0,40);
    const title=outputTitleInput.value.trim();
    const meta=metadataLines();
    const headerMm=exportHeaderMm();

    msg.textContent="PDFを作成しています…";
    msg.className="msg success";

    const mapCanvas=await captureMapCanvas(Math.min(s.requestedDpi,600));
    const {jsPDF}=window.jspdf;
    const pdf=new jsPDF({orientation:s.orientation,unit:"mm",format:[page.width,page.height],compress:true});

    if(title){
      pdf.setFont("helvetica","bold");
      pdf.setFontSize(14);
      pdf.text(title,marginMm,marginMm+5);
    }
    if(meta.length){
      pdf.setFont("helvetica","normal");
      pdf.setFontSize(9);
      meta.forEach((line,n)=>pdf.text(String(line),marginMm,marginMm+12+n*5));
    }

    const availableW=Math.max(1,page.width-marginMm*2);
    const availableH=Math.max(1,page.height-marginMm*2-headerMm);
    const ratio=Math.min(availableW/mapCanvas.width,availableH/mapCanvas.height);
    const drawW=mapCanvas.width*ratio;
    const drawH=mapCanvas.height*ratio;
    const x=(page.width-drawW)/2;
    const y=marginMm+headerMm+(availableH-drawH)/2;
    const imgData=mapCanvas.toDataURL("image/jpeg",.94);
    pdf.addImage(imgData,"JPEG",x,y,drawW,drawH,undefined,"FAST");
    pdf.save(`${sanitizeFilename(outputFilenameInput.value)}_${s.paperSize}_${s.orientation}_${timestampText()}.pdf`);

    msg.textContent=`${s.paperSize} PDFを出力しました．PDFは巨大Canvasを作らない方式で出力しています．`;
    msg.className="msg success";
  }catch(error){
    console.error(error);
    msg.textContent=error?.message||"PDFの生成に失敗しました．";
    msg.className="msg error";
  }
});
