# 走向・傾斜マップ

## Version 0.14.0

フィールド調査・印刷・QGIS連携を強化した更新です．

### 主な追加機能

- 地点番号の表示 ON/OFF．地点番号は傾斜角の反対側へ表示．
- 傾斜角，走向値の表示 ON/OFF．
- Web画面・地図記号・Excel出力のフォントを BIZ UDPゴシック系へ統一．
- 偏角補正機能．西偏／東偏と角度を指定し，全地点へ一括適用可能．
  - 元の走向・傾斜方位は保持し，補正値を別フィールドとして保存．
- GeoJSON / CSV に元方位・補正後方位・360°方位角を併記．QGISへそのまま読み込み可能．
- 初期表示位置を立正大学熊谷キャンパスへ変更．
- Zoomを0.25刻み，最大24まで細分化．
- A5/A4/A3/B5/B4/Letter，縦横，余白プリセット・カスタム余白に対応．
- PNG/JPEGのDPIを150～1200 dpiから選択可能．
  - 900/1200 dpiは大容量のため，端末・ブラウザによっては出力できない場合があります．
- 出力時にタイトル，日付，作成者・調査名，任意情報を追加可能．
- 出力ファイル名を指定可能．
- 地図中心位置・Zoom・背景地図・出力設定を「位置・縮尺テンプレート」としてブラウザに保存可能．
- ポイント追加・更新・削除，全削除，GPX/Excel/JSON読込，作業保存，テンプレート保存・削除などに確認ダイアログを追加．
- 既存の重なり回避機能は維持し，実測座標を動かさず補助線で接続．

### GeoJSONの主要属性

- `raw_strike`, `raw_dip`
- `strike_azimuth_raw_deg`
- `dip_direction_raw_deg`
- `magnetic_declination_deg_east_positive`
- `strike_azimuth_true_deg`
- `dip_direction_true_deg`
- `display_strike_azimuth_deg`
- `display_dip_direction_deg`
- `dip_deg`
- `point_id`, `survey_date`, `lithology`, `structure_type`, `notes`

GeoJSONの座標はWGS84緯度経度です．QGISへ読み込み後，国土地理院DEM等と組み合わせて地質図作成に利用できます．
