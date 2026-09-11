# 走向・傾斜マップ

## Version 0.3.0

Version 0.2.0の機能に加えて，測定ポイント一覧と外部出力機能を追加しました．

### 測定ポイント一覧

地図へ追加した地点を表形式で確認できます．

一覧には以下を表示します．

- 地点番号
- 緯度
- 経度
- 入力した走向
- 入力した傾斜
- 変換後の走向方位角
- 傾斜角
- 傾斜方向

各地点には以下の操作があります．

- 地図へ．地点まで地図を移動します．
- 削除．その地点だけを削除します．

### CSV出力

Excel等で整理するためのCSVを出力できます．

文字化けしにくいようにUTF-8 BOM付きで出力します．

出力項目．

- point_id
- latitude
- longitude
- raw_strike
- raw_dip
- strike_azimuth_deg
- dip_deg
- dip_direction_deg
- dip_direction_label

### GeoJSON出力

QGIS等のGISソフトへ読み込むためのGeoJSONを出力できます．

座標はWGS84，EPSG:4326です．

GeoJSONのPoint geometryでは，座標順は以下です．

longitude，latitude

つまり，

139.824167，34.910884

の順で保存されます．

### 研究データとしての方針

自動変換後の値だけでなく，N30Eや45SEなど，入力した元の文字列も保存します．

これにより，後から変換処理を確認できます．

背景地図には国土地理院の地理院タイルを利用しています．
