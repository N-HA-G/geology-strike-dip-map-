// ============================================================
// 走向・傾斜マップ Version 0.1.0
//
// 今回の目的：
// 1. 緯度・経度を数値入力
// 2. 走向・傾斜・傾斜方向を数値入力
// 3. 指定地点に走向・傾斜記号を描画
//
// 文字表記（N30E / 45SE）の自動変換は次版で追加する。
// ============================================================


// ------------------------------------------------------------
// 地図
// ------------------------------------------------------------

const map = L.map("map").setView(
  [34.93, 139.85],
  12
);

const gsiAttribution =
  '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">国土地理院</a>';

const gsiStandard = L.tileLayer(
  "https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png",
  {
    minZoom: 5,
    maxZoom: 18,
    attribution: gsiAttribution
  }
);

const gsiPale = L.tileLayer(
  "https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png",
  {
    minZoom: 5,
    maxZoom: 18,
    attribution: gsiAttribution
  }
);

const gsiPhoto = L.tileLayer(
  "https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg",
  {
    minZoom: 2,
    maxZoom: 18,
    attribution: gsiAttribution
  }
);

gsiPale.addTo(map);

L.control.layers(
  {
    "地理院地図・標準": gsiStandard,
    "地理院地図・淡色": gsiPale,
    "地理院地図・空中写真": gsiPhoto
  },
  null,
  {
    position: "topright",
    collapsed: false
  }
).addTo(map);


// ------------------------------------------------------------
// 入力欄
// ------------------------------------------------------------

const form = document.getElementById("measurement-form");
const pointIdInput = document.getElementById("point-id");
const latitudeInput = document.getElementById("latitude");
const longitudeInput = document.getElementById("longitude");
const strikeInput = document.getElementById("strike");
const dipInput = document.getElementById("dip");
const dipDirectionInput = document.getElementById("dip-direction");

const validationMessage = document.getElementById("validation-message");
const clearButton = document.getElementById("clear-points");
const pointCount = document.getElementById("point-count");

const measurementLayer = L.layerGroup().addTo(map);
let numberOfPoints = 0;


// ------------------------------------------------------------
// 方位角関係の補助関数
// ------------------------------------------------------------

// 角度を 0°以上360°未満へ正規化する。
function normalizeAzimuth(angle) {
  return ((angle % 360) + 360) % 360;
}

// 2つの方位角の最小角度差を 0〜180°で返す。
function angularDifference(a, b) {
  const diff = Math.abs(
    normalizeAzimuth(a) - normalizeAzimuth(b)
  );

  return Math.min(diff, 360 - diff);
}


// ------------------------------------------------------------
// 入力値チェック
// ------------------------------------------------------------

function validateMeasurement(data) {
  if (!Number.isFinite(data.latitude) ||
      data.latitude < -90 ||
      data.latitude > 90) {
    return "緯度は -90〜90°で入力してください．";
  }

  if (!Number.isFinite(data.longitude) ||
      data.longitude < -180 ||
      data.longitude > 180) {
    return "経度は -180〜180°で入力してください．";
  }

  if (!Number.isFinite(data.strike) ||
      data.strike < 0 ||
      data.strike >= 360) {
    return "走向は 0°以上360°未満で入力してください．";
  }

  if (!Number.isFinite(data.dip) ||
      data.dip < 0 ||
      data.dip > 90) {
    return "傾斜は 0〜90°で入力してください．";
  }

  if (!Number.isFinite(data.dipDirection) ||
      data.dipDirection < 0 ||
      data.dipDirection >= 360) {
    return "傾斜方向は 0°以上360°未満で入力してください．";
  }

  // 走向と傾斜方向は原則として約90°の関係になる。
  // 手入力誤差を考慮し，±5°までは許容する。
  if (data.dip > 0) {
    const separation =
      angularDifference(data.strike, data.dipDirection);

    if (Math.abs(separation - 90) > 5) {
      return (
        "走向と傾斜方向がほぼ直交していません．" +
        "入力値を確認してください．"
      );
    }
  }

  return null;
}


// ------------------------------------------------------------
// 走向・傾斜記号SVG
// ------------------------------------------------------------

function createStrikeDipSvg(strike, dip, dipDirection) {
  const size = 76;
  const center = size / 2;

  // 線の長さ
  const strikeHalfLength = 22;
  const dipTickLength = 14;

  // 方位角は北=0°，東=90°．
  // SVGではxが右，yが下なので，以下のように変換する。
  const strikeRad = strike * Math.PI / 180;
  const dipDirRad = dipDirection * Math.PI / 180;

  const sx = Math.sin(strikeRad);
  const sy = -Math.cos(strikeRad);

  const dx = Math.sin(dipDirRad);
  const dy = -Math.cos(dipDirRad);

  const x1 = center - sx * strikeHalfLength;
  const y1 = center - sy * strikeHalfLength;
  const x2 = center + sx * strikeHalfLength;
  const y2 = center + sy * strikeHalfLength;

  const tickX2 = center + dx * dipTickLength;
  const tickY2 = center + dy * dipTickLength;

  // 傾斜角の数字は，傾斜方向側へ少し離して配置する。
  const textDistance = 24;
  const textX = center + dx * textDistance;
  const textY = center + dy * textDistance + 4;

  return `
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="${size}"
      height="${size}"
      viewBox="0 0 ${size} ${size}"
      aria-hidden="true"
    >
      <line
        x1="${x1.toFixed(2)}"
        y1="${y1.toFixed(2)}"
        x2="${x2.toFixed(2)}"
        y2="${y2.toFixed(2)}"
        stroke="#111111"
        stroke-width="2.4"
        stroke-linecap="round"
      />

      <line
        x1="${center}"
        y1="${center}"
        x2="${tickX2.toFixed(2)}"
        y2="${tickY2.toFixed(2)}"
        stroke="#111111"
        stroke-width="2.4"
        stroke-linecap="round"
      />

      <text
        x="${textX.toFixed(2)}"
        y="${textY.toFixed(2)}"
        text-anchor="middle"
        dominant-baseline="middle"
        font-family="Arial, sans-serif"
        font-size="13"
        font-weight="700"
        fill="#111111"
        stroke="#ffffff"
        stroke-width="3"
        paint-order="stroke"
      >${Number(dip.toFixed(1))}</text>
    </svg>
  `;
}


function createStrikeDipIcon(strike, dip, dipDirection) {
  return L.divIcon({
    className: "strike-dip-icon",
    html: createStrikeDipSvg(strike, dip, dipDirection),
    iconSize: [76, 76],
    iconAnchor: [38, 38]
  });
}


// ------------------------------------------------------------
// 地点追加
// ------------------------------------------------------------

form.addEventListener("submit", function (event) {
  event.preventDefault();

  const data = {
    pointId: pointIdInput.value.trim() || "(地点番号なし)",
    latitude: Number(latitudeInput.value),
    longitude: Number(longitudeInput.value),
    strike: Number(strikeInput.value),
    dip: Number(dipInput.value),
    dipDirection: Number(dipDirectionInput.value)
  };

  const error = validateMeasurement(data);

  if (error) {
    validationMessage.textContent = error;
    validationMessage.className = "message error";
    return;
  }

  const icon = createStrikeDipIcon(
    data.strike,
    data.dip,
    data.dipDirection
  );

  const marker = L.marker(
    [data.latitude, data.longitude],
    {
      icon: icon,
      title: data.pointId
    }
  );

  marker.bindPopup(`
    <strong>${escapeHtml(data.pointId)}</strong><br>
    緯度：${data.latitude.toFixed(6)}<br>
    経度：${data.longitude.toFixed(6)}<br>
    走向：${data.strike.toFixed(1)}°<br>
    傾斜：${data.dip.toFixed(1)}°<br>
    傾斜方向：${data.dipDirection.toFixed(1)}°
  `);

  marker.addTo(measurementLayer);

  numberOfPoints += 1;
  pointCount.textContent = String(numberOfPoints);

  map.setView(
    [data.latitude, data.longitude],
    Math.max(map.getZoom(), 16)
  );

  marker.openPopup();

  validationMessage.textContent =
    `${data.pointId} を地図に追加しました．`;

  validationMessage.className = "message success";
});


// ------------------------------------------------------------
// 全削除
// ------------------------------------------------------------

clearButton.addEventListener("click", function () {
  measurementLayer.clearLayers();

  numberOfPoints = 0;
  pointCount.textContent = "0";

  validationMessage.textContent =
    "表示中の測定地点をすべて削除しました．";

  validationMessage.className = "message";
});


// ------------------------------------------------------------
// ポップアップに入力文字列を入れるための最低限のエスケープ
// ------------------------------------------------------------

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
