const map = L.map("map").setView([34.93, 139.85], 12);

const attribution =
  '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">国土地理院</a>';

const standard = L.tileLayer(
  "https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png",
  { maxZoom: 18, attribution }
);

const pale = L.tileLayer(
  "https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png",
  { maxZoom: 18, attribution }
);

const photo = L.tileLayer(
  "https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg",
  { maxZoom: 18, attribution }
);

pale.addTo(map);

L.control.layers(
  {
    "地理院地図・標準": standard,
    "地理院地図・淡色": pale,
    "地理院地図・空中写真": photo
  },
  null,
  { collapsed: false }
).addTo(map);

const $ = id => document.getElementById(id);

const form = $("form");
const pointId = $("pointId");
const lat = $("lat");
const lng = $("lng");
const strikeText = $("strikeText");
const dipText = $("dipText");

const outStrike = $("outStrike");
const outDip = $("outDip");
const outDir = $("outDir");
const msg = $("msg");
const count = $("count");
const pointTableBody = $("pointTableBody");
const exportCsvButton = $("exportCsv");
const exportGeoJsonButton = $("exportGeoJson");

const measurementLayer = L.layerGroup().addTo(map);

let temporaryMarker = null;
let nextInternalId = 1;
let measurements = [];

function normalizeAzimuth(angle) {
  return ((angle % 360) + 360) % 360;
}

function angularDifference(a, b) {
  const d = Math.abs(normalizeAzimuth(a) - normalizeAzimuth(b));
  return Math.min(d, 360 - d);
}

function parseStrike(value) {
  const text = String(value)
    .trim()
    .toUpperCase()
    .replaceAll("°", "")
    .replace(/\s+/g, "");

  if (/^\d+(\.\d+)?$/.test(text)) {
    const number = Number(text);

    if (number >= 0 && number < 360) {
      return normalizeAzimuth(number);
    }

    throw new Error("数字の走向は0°以上360°未満で入力してください．");
  }

  const match = text.match(/^([NS])(\d+(?:\.\d+)?)([EW])$/);

  if (!match) {
    throw new Error("走向の形式を確認してください．例．N30E，N30°E，030．");
  }

  const ns = match[1];
  const angle = Number(match[2]);
  const ew = match[3];

  if (angle < 0 || angle > 90) {
    throw new Error("四分円表記の角度は0〜90°で入力してください．");
  }

  if (ns === "N" && ew === "E") return angle;
  if (ns === "N" && ew === "W") return normalizeAzimuth(360 - angle);
  if (ns === "S" && ew === "E") return 180 - angle;

  return 180 + angle;
}

const directionAzimuths = {
  N: 0,
  NE: 45,
  E: 90,
  SE: 135,
  S: 180,
  SW: 225,
  W: 270,
  NW: 315
};

function parseDip(value, strike) {
  const text = String(value)
    .trim()
    .toUpperCase()
    .replaceAll("°", "")
    .replace(/\s+/g, "");

  const match = text.match(/^(\d+(?:\.\d+)?)(NE|SE|SW|NW|N|E|S|W)$/);

  if (!match) {
    throw new Error("傾斜の形式を確認してください．例．45SE，45°NW．");
  }

  const dip = Number(match[1]);
  const directionLabel = match[2];

  if (dip < 0 || dip > 90) {
    throw new Error("傾斜角は0〜90°で入力してください．");
  }

  const desiredDirection = directionAzimuths[directionLabel];
  const candidate1 = normalizeAzimuth(strike + 90);
  const candidate2 = normalizeAzimuth(strike - 90);

  const diff1 = angularDifference(candidate1, desiredDirection);
  const diff2 = angularDifference(candidate2, desiredDirection);

  const dipDirection = diff1 <= diff2 ? candidate1 : candidate2;

  return {
    dip,
    directionLabel,
    dipDirection
  };
}

function convertInput(showError = true) {
  try {
    const strike = parseStrike(strikeText.value);
    const dipData = parseDip(dipText.value, strike);

    outStrike.textContent = `${strike.toFixed(1)}°`;
    outDip.textContent = `${dipData.dip.toFixed(1)}°`;
    outDir.textContent = `${dipData.dipDirection.toFixed(1)}°`;

    if (showError) {
      msg.textContent = "";
      msg.className = "msg";
    }

    return {
      strike,
      dip: dipData.dip,
      dipDirection: dipData.dipDirection,
      dipDirectionLabel: dipData.directionLabel
    };
  } catch (error) {
    outStrike.textContent = "―";
    outDip.textContent = "―";
    outDir.textContent = "―";

    if (showError) {
      msg.textContent = error.message;
      msg.className = "msg error";
    }

    return null;
  }
}

strikeText.addEventListener("input", () => convertInput());
dipText.addEventListener("input", () => convertInput());

function temporaryPointIcon() {
  return L.divIcon({
    className: "click-point-icon",
    html: `
      <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26">
        <circle cx="13" cy="13" r="7" fill="white" stroke="#b00020" stroke-width="2.5"/>
        <circle cx="13" cy="13" r="2.5" fill="#b00020"/>
      </svg>
    `,
    iconSize: [26, 26],
    iconAnchor: [13, 13]
  });
}

map.on("click", event => {
  lat.value = event.latlng.lat.toFixed(6);
  lng.value = event.latlng.lng.toFixed(6);

  if (temporaryMarker) {
    temporaryMarker.setLatLng(event.latlng);
  } else {
    temporaryMarker = L.marker(
      event.latlng,
      {
        icon: temporaryPointIcon(),
        interactive: false
      }
    ).addTo(map);
  }

  msg.textContent =
    `クリック地点を選択しました．緯度 ${lat.value}．経度 ${lng.value}．`;

  msg.className = "msg success";
});

function strikeDipSvg(strike, dip, dipDirection) {
  const size = 76;
  const center = 38;
  const strikeHalfLength = 22;
  const dipTickLength = 14;
  const rad = Math.PI / 180;

  const strikeRad = strike * rad;
  const dipRad = dipDirection * rad;

  const sx = Math.sin(strikeRad);
  const sy = -Math.cos(strikeRad);

  const dx = Math.sin(dipRad);
  const dy = -Math.cos(dipRad);

  const x1 = center - sx * strikeHalfLength;
  const y1 = center - sy * strikeHalfLength;
  const x2 = center + sx * strikeHalfLength;
  const y2 = center + sy * strikeHalfLength;

  const tickX = center + dx * dipTickLength;
  const tickY = center + dy * dipTickLength;

  const textX = center + dx * 24;
  const textY = center + dy * 24 + 4;

  return `
    <svg xmlns="http://www.w3.org/2000/svg"
      width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <line
        x1="${x1}" y1="${y1}"
        x2="${x2}" y2="${y2}"
        stroke="#111" stroke-width="2.4" stroke-linecap="round"
      />
      <line
        x1="${center}" y1="${center}"
        x2="${tickX}" y2="${tickY}"
        stroke="#111" stroke-width="2.4" stroke-linecap="round"
      />
      <text
        x="${textX}" y="${textY}"
        text-anchor="middle"
        dominant-baseline="middle"
        font-family="Arial,sans-serif"
        font-size="13"
        font-weight="700"
        fill="#111"
        stroke="#fff"
        stroke-width="3"
        paint-order="stroke"
      >${Number(dip.toFixed(1))}</text>
    </svg>
  `;
}

function strikeDipIcon(strike, dip, dipDirection) {
  return L.divIcon({
    className: "strike-dip-icon",
    html: strikeDipSvg(strike, dip, dipDirection),
    iconSize: [76, 76],
    iconAnchor: [38, 38]
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function createPopupHtml(item) {
  return `
    <strong>${escapeHtml(item.pointId)}</strong><br>
    緯度．${item.latitude.toFixed(6)}<br>
    経度．${item.longitude.toFixed(6)}<br>
    入力走向．${escapeHtml(item.rawStrike)}<br>
    入力傾斜．${escapeHtml(item.rawDip)}<br>
    走向方位角．${item.strike.toFixed(1)}°<br>
    傾斜角．${item.dip.toFixed(1)}°<br>
    傾斜方向．${item.dipDirection.toFixed(1)}°
  `;
}

function renderMeasurements() {
  count.textContent = String(measurements.length);

  exportCsvButton.disabled = measurements.length === 0;
  exportGeoJsonButton.disabled = measurements.length === 0;

  pointTableBody.innerHTML = "";

  if (measurements.length === 0) {
    pointTableBody.innerHTML = `
      <tr>
        <td colspan="10" class="empty">まだ測定ポイントはありません．</td>
      </tr>
    `;
    return;
  }

  measurements.forEach((item, index) => {
    const row = document.createElement("tr");

    row.innerHTML = `
      <td>${index + 1}</td>
      <td>${escapeHtml(item.pointId)}</td>
      <td>${item.latitude.toFixed(6)}</td>
      <td>${item.longitude.toFixed(6)}</td>
      <td>${escapeHtml(item.rawStrike)}</td>
      <td>${escapeHtml(item.rawDip)}</td>
      <td>${item.strike.toFixed(1)}°</td>
      <td>${item.dip.toFixed(1)}°</td>
      <td>${item.dipDirection.toFixed(1)}°</td>
      <td>
        <div class="table-actions">
          <button type="button" data-action="focus" data-id="${item.id}">地図へ</button>
          <button type="button" class="delete-button" data-action="delete" data-id="${item.id}">削除</button>
        </div>
      </td>
    `;

    pointTableBody.appendChild(row);
  });
}

function addMeasurementMarker(item) {
  const marker = L.marker(
    [item.latitude, item.longitude],
    {
      icon: strikeDipIcon(item.strike, item.dip, item.dipDirection),
      title: item.pointId
    }
  ).addTo(measurementLayer);

  marker.bindPopup(createPopupHtml(item));

  item.marker = marker;
}

form.addEventListener("submit", event => {
  event.preventDefault();

  const latitude = Number(lat.value);
  const longitude = Number(lng.value);

  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    msg.textContent = "緯度を確認してください．";
    msg.className = "msg error";
    return;
  }

  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    msg.textContent = "経度を確認してください．";
    msg.className = "msg error";
    return;
  }

  const converted = convertInput();

  if (!converted) {
    return;
  }

  const item = {
    id: nextInternalId++,
    pointId: pointId.value.trim() || "(地点番号なし)",
    latitude,
    longitude,
    rawStrike: strikeText.value.trim(),
    rawDip: dipText.value.trim(),
    strike: converted.strike,
    dip: converted.dip,
    dipDirection: converted.dipDirection,
    dipDirectionLabel: converted.dipDirectionLabel,
    marker: null
  };

  measurements.push(item);
  addMeasurementMarker(item);

  if (temporaryMarker) {
    map.removeLayer(temporaryMarker);
    temporaryMarker = null;
  }

  renderMeasurements();

  msg.textContent = `${item.pointId} を地図と一覧に追加しました．`;
  msg.className = "msg success";

  item.marker.openPopup();
});

pointTableBody.addEventListener("click", event => {
  const button = event.target.closest("button[data-action]");

  if (!button) {
    return;
  }

  const id = Number(button.dataset.id);
  const item = measurements.find(entry => entry.id === id);

  if (!item) {
    return;
  }

  if (button.dataset.action === "focus") {
    map.setView(
      [item.latitude, item.longitude],
      Math.max(map.getZoom(), 17)
    );

    item.marker.openPopup();
  }

  if (button.dataset.action === "delete") {
    measurementLayer.removeLayer(item.marker);

    measurements = measurements.filter(entry => entry.id !== id);

    renderMeasurements();

    msg.textContent = `${item.pointId} を削除しました．`;
    msg.className = "msg";
  }
});

$("clear").addEventListener("click", () => {
  measurementLayer.clearLayers();

  if (temporaryMarker) {
    map.removeLayer(temporaryMarker);
    temporaryMarker = null;
  }

  measurements = [];

  renderMeasurements();

  msg.textContent = "表示中の測定地点をすべて削除しました．";
  msg.className = "msg";
});

function csvEscape(value) {
  const text = String(value ?? "");

  if (
    text.includes(",") ||
    text.includes('"') ||
    text.includes("\n") ||
    text.includes("\r")
  ) {
    return `"${text.replaceAll('"', '""')}"`;
  }

  return text;
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;

  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

exportCsvButton.addEventListener("click", () => {
  if (measurements.length === 0) {
    return;
  }

  const header = [
    "point_id",
    "latitude",
    "longitude",
    "raw_strike",
    "raw_dip",
    "strike_azimuth_deg",
    "dip_deg",
    "dip_direction_deg",
    "dip_direction_label"
  ];

  const rows = measurements.map(item => [
    item.pointId,
    item.latitude.toFixed(6),
    item.longitude.toFixed(6),
    item.rawStrike,
    item.rawDip,
    item.strike.toFixed(1),
    item.dip.toFixed(1),
    item.dipDirection.toFixed(1),
    item.dipDirectionLabel
  ]);

  const csv =
    [header, ...rows]
      .map(row => row.map(csvEscape).join(","))
      .join("\r\n");

  const bom = "\uFEFF";

  downloadBlob(
    "strike_dip_points.csv",
    new Blob([bom + csv], { type: "text/csv;charset=utf-8" })
  );

  msg.textContent = "CSVを出力しました．";
  msg.className = "msg success";
});

exportGeoJsonButton.addEventListener("click", () => {
  if (measurements.length === 0) {
    return;
  }

  const geojson = {
    type: "FeatureCollection",
    name: "strike_dip_points",
    coordinateReferenceSystem: "WGS84 / EPSG:4326",
    features: measurements.map(item => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [
          item.longitude,
          item.latitude
        ]
      },
      properties: {
        point_id: item.pointId,
        raw_strike: item.rawStrike,
        raw_dip: item.rawDip,
        strike_azimuth_deg: Number(item.strike.toFixed(1)),
        dip_deg: Number(item.dip.toFixed(1)),
        dip_direction_deg: Number(item.dipDirection.toFixed(1)),
        dip_direction_label: item.dipDirectionLabel
      }
    }))
  };

  downloadBlob(
    "strike_dip_points.geojson",
    new Blob(
      [JSON.stringify(geojson, null, 2)],
      { type: "application/geo+json;charset=utf-8" }
    )
  );

  msg.textContent = "GeoJSONを出力しました．";
  msg.className = "msg success";
});

convertInput(false);
renderMeasurements();
