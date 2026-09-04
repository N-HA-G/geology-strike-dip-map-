// ============================================================
// 走向・傾斜マップ Version 0.0.1
// 今回は「地理院地図を表示する」だけ。
// ============================================================

// 地図を作成する。
// 初期表示位置は千葉県南部（館山・南房総付近）。
const map = L.map("map").setView(
  [34.93, 139.85],
  12
);

// 国土地理院「標準地図」タイル。
const gsiStandard = L.tileLayer(
  "https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png",
  {
    minZoom: 5,
    maxZoom: 18,
    attribution:
      '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">国土地理院</a>'
  }
);

// 地図へ追加。
gsiStandard.addTo(map);
