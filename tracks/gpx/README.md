# 运动轨迹 GPX（自动入库）

把小米运动健康 / 苹果导出的 `.gpx` 放到这个目录，然后：

- 本地：`npm run tracks`（或 `npm run build` / `build:ci` 会自动跑）
- CI：push 到 `main` 后 Actions 自动构建并发布到 `/maps`

小米导出：户外运动详情 → `⋯` → 导出 → 导出数据文件 → `.gpx`  
（室内/无 GPS 的记录无法上地图）
