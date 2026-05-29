# v0.5.0 — ScenePacker 冒险包导入支持

## 新增

支持导入 ScenePacker 格式的冒险包(Beneos Battlemaps 等),不依赖 scene-packer 模块(该模块无 V14 版本)。

- **scanner 识别**:含 `scene-packer.info` + `universe.json` 的 pack 注册为单个「冒险包」条目(type 98),不再当作一堆散素材
- **整包导入** `importScenePackerPack`:用 `createDocuments({keepId:true, keepEmbeddedIds:true})` 保留原始 `_id` 重建
  - folder 拓扑序创建(父先于子)
  - scene / actor / journal / item / playlist / rolltable 全部导入
  - 跨文档引用(token→actor / note→journal / @UUID / folder 父子)因 id 不变自动生效
  - 三根素材路径(`beneos_assets` / `modules` / `moulinette`)重写指向本地,零拷贝
  - 碰撞跳过(重复导入不报错)
  - scene 缩略图重生成
  - 跨系统弹窗警告,跳过 actor/item(系统不兼容会损坏)
- **grid 卡片**:冒险包显示「N场景 N日志 N角色」

## 兼容性

- V13 / V14(用 DialogV2 + V14 API,旧版自动降级 Dialog)
- `INDEX_VERSION` 3 → 4,旧缓存自动失效,模块下次启动重扫

## 升级

- manifest: <https://github.com/takaqiao/local-asset-library/releases/latest/download/module.json>
- 或下 `module.zip` 覆盖到 `Data/modules/local-asset-library/`

## GitHub Release

<https://github.com/takaqiao/local-asset-library/releases/tag/v0.5.0>
