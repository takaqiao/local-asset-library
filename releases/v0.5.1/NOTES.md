# v0.5.1 — 全面审计修复 + 扫描提速

一轮覆盖全部文件的代码审计后,修掉 13 个 bug、上 2 项性能优化。模块在 Foundry **V14.361.0** 上本就能跑(此前所谓的「V14 阻断」经核对全是假报警 —— V1 框架要到 V16 才退役),本版聚焦的是数据正确性与信任边界问题。

## Bug 修复

- **路径含 `#` → 404**:`fetch` / `<img>` / 导入会把 `#` 当 URL fragment,路径在 `#` 处截断(如 animatedmaps 的 `UNDERGROUND RIVER #1-1/...`,整包失效)。在所有「使用点」统一转义为 `%23`,存储仍保留原始路径(搜索/排序/去重不受影响)
- **`_id` 跨 meta 文件碰撞**:同一 scene 常同时登记在 `_pack_meta_type1`(场景)和 `_pack_meta_type2`(地图),收藏/多选会互相串台、点「地图」走「场景」导入。同 pack 内按 type 升序去重,保留 Scene
- **侧栏/角色表 drop 绕过 GM 守卫**:给 `addItemToActor` / `addAudioToSpecificPlaylist` / `createSceneFromImage` 补 `isGM` 守卫,与「仍只有 GM 能导入」设置一致
- **预览空白**:`ImagePopout` 改用 V14 的 ApplicationV2 单 options 签名(`{src, window:{title}}`)
- **静默覆盖世界文档**:单文档导入撞已有 `_id` 时丢 id 生成新的,不再被 keepId 静默 upsert 覆盖
- **音频开关提示反了**:toggle 后先存目标态再返回
- **翻页越界**:点「下页」超出末页会空白 + 计数错(如「4/3」),现在夹回末页
- **重复建文件夹**:并发导入(拖拽撞点击)的同名文件夹建一次(in-flight 归并)
- **场景控件**:去掉永远命中不到的死分支,补上 V14 必填的 `order`
- **部分失败静默报成功**:扫描跳过合集 / 冒险包某类导入失败时改为 warn 提示
- **冒险包宏导入提示**:导入宏(可执行代码)时提示一声
- **冒险包占位**:无封面/封面 404 时显示书本图标 + 包名,不再裸露「ScenePacker」;类型本地化为「冒险包」
- **键盘无障碍**:卡片操作按钮键盘聚焦时露出 overlay

## 性能优化

- **冷扫描提速**:原来逐创作者 → 逐合集 → 逐 meta 串行(~1.2 万次往返,首扫 6–17 分钟)。改有界并发池(创作者 12 / 合集 16 并发),降到几十秒。强制重扫同样受益
- **导入/拖拽 O(n)→O(1)**:每次按 id 找 asset 从全表 `find` 改 `byId` Map,批量导入尤其明显

## 兼容性

- V13 / V14(V1 API 仍可用,仅 deprecation 警告;ApplicationV2 迁移留待 V16 前)
- 索引缓存格式未变(沿用 v0.5.0 的 `INDEX_VERSION 4`),但**建议重扫一次**以套用 `_id` 去重

## 升级

- manifest: <https://github.com/takaqiao/local-asset-library/releases/latest/download/module.json>
- 或下 `module.zip` 覆盖到 `Data/modules/local-asset-library/`(`scripts/main.js` 改动需 F5 重载 Foundry)

## GitHub Release

<https://github.com/takaqiao/local-asset-library/releases/tag/v0.5.1>
