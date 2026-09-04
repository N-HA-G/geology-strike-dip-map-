// ============================================================
// 走向・傾斜マップ Version 0.0.2
// 地理院地図の背景レイヤーを切り替える。
// ============================================================

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

// 最初は淡色地図を表示。
gsiPale.addTo(map);

const baseMaps = {
  "地理院地図・標準": gsiStandard,
  "地理院地図・淡色": gsiPale,
  "地理院地図・空中写真": gsiPhoto
};

L.control.layers(
  baseMaps,
  null,
  {
    position: "topright",
    collapsed: false
  }
).addTo(map);
