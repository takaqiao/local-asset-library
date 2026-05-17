# 本地素材库 (Local Asset Library)

Foundry VTT v13+ 模块。把你下载到本地硬盘的素材库（图片 / 场景 JSON / 角色 / 音频 / 日志 / 等等）直接在 Foundry 里浏览、搜索、拖拽导入。**完全本机运行**，不调任何云端 API，不需要登录任何账号。

## 为什么用这个

如果你已经有一份本地素材库（按 `<创作者>/<合集>/_pack_meta_*.json` 布局存放的资产），这个模块让你：

- 不用一个个 Folder 翻 FilePicker 找文件
- 不用 Foundry 内置 Tile 工具一次只能选一张图
- 拖到画布按类型自动派发（图变 Tile / 场景变 Scene / 音频进 Playlist / 角色进 sidebar...）
- 自动归到 `素材库/<创作者>/<合集>/` 文件夹层级
- Scene 导入时自动连带同合集的 Journal 和 Playlist，**保留原 `_id`** 让场景内的引用（如 monks-active-tiles flags 引用的 journal）能解析

## 支持的资产类型

| 类型 | 拖到画布后 | 备注 |
|---|---|---|
| 图片 / 地图 | 新建 Tile，按原图像素尺寸 | 自动识别 `.webm`/`.mp4`，开启 video.autoplay+loop |
| 场景 | 新 Scene，`keepId` 保留原 id；自动 import 同包 Journal/Playlist；自动生成缩略图 | 跨文档引用得以解析 |
| 角色 / 物品 / 宏 / 随机表 / 冒险 | 进 sidebar，按文件夹层级归类 | 走 `*.fromImport` 系统迁移 |
| 日志 | 同上；老格式（v9 单页）自动 wrap 成 `pages[]` | |
| 播放列表 | 同上 | |
| 音频 | 加入 "素材音频" Playlist，按设置的 channel/volume；二次拖动 toggle 播放/停止 | |
| PDF | 创建 JournalEntry 含 PDF page | Foundry v13+ 原生支持 |
| 图标 (FontAwesome) | 复制 class 字符串到剪贴板 | 适合放进 journal note / token / item icon |

鼠标悬停任一资产卡片 → 浮出 3 个动作按钮：**导入** / **预览** / **复制路径**。

## 安装

### 方法 A：Manifest URL（推荐）

Foundry 启动器 → Add-on Modules → Install Module → 在底部 Manifest URL 框粘贴：

```
https://github.com/takaqiao/local-asset-library/releases/latest/download/module.json
```

### 方法 B：手动

1. 去 [Releases](https://github.com/takaqiao/local-asset-library/releases) 下载 `module.zip`
2. 解压到 `<你的 Foundry Data>/Data/modules/local-asset-library/`

## 配置素材库根路径

模块默认从 `<dataPath>/assets/` 读，可以在模块设置里改成你实际放素材的子目录。要求布局：

```
<dataPath>/<rootSubpath>/
├── <创作者A>/
│   ├── <合集1>/
│   │   ├── _pack_meta_type3.json    ← 必需 (该合集的 Image 类型清单)
│   │   ├── _pack_meta_type1.json    ← 该合集的 Scene 类型清单
│   │   ├── images/maps/foo.webp
│   │   ├── json/scene/bar.json
│   │   └── ...
│   └── <合集2>/...
└── <创作者B>/...
```

`_pack_meta_typeN.json` 是关键：里面是该合集下该类型所有 asset 的 metadata 数组（`_id`/`filepath`/`pack`/`size`/等），模块靠它建索引。

## 使用

1. 启用模块，进 world
2. 左侧场景控件 → Tile 工具栏，多了 📷 **本地素材库** 按钮 → 点
3. 首次打开自动扫库（3 万个文件大约 30 秒）
4. 搜索、筛选、悬停、拖拽

也可以从 console 调起：

```javascript
game.modules.get("local-asset-library").api.openBrowser()
```

## 模块设置

| 设置 | 默认 | 说明 |
|---|---|---|
| 素材库根路径 | `assets` | 相对 Foundry dataPath 的子路径 |
| 自动按层级建文件夹 | 开 | 按 `素材库/<创作者>/<合集>/` 归类 |
| 导入场景时生成缩略图 | 开 | 用最大 tile 或 background.src 生成 |
| 导入后自动打开 Sheet | 关 | Actor/Item/Journal 导入完自动展开 |
| 导入音频默认 channel | environment | music / environment / interface |
| 导入音频默认音量 | 0.8 | 0-1 |

## 推荐配套模块

- **[Monks Active Tile Triggers](https://foundryvtt.com/packages/monks-active-tiles)** —— 很多场景的 tile 上带 `monks-active-tiles` flags（点 tile 触发开 journal / 跳 scene 等），没装这个模块这些 tile 没反应。

## 兼容性

- Foundry VTT v13 / v14
- 在 PF2e 系统上测过；其他系统对非场景类型应该也可用
- 场景导入用 `{keepId: true}` 保留源 `_id`，让 tile flags / note `entryId` / 跨文档引用能命中

## 不附属于任何第三方

本模块独立开发，不附属、不代表、不背书任何素材分发平台。它只负责读你**已合法持有**的本地文件，不下载任何素材内容。

## License

[MIT](./LICENSE)
