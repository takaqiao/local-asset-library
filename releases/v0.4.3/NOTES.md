# v0.4.3 — scanner dedup 版本变体 pack

## 改动

scanner 现在跳过 pack 版本变体: 例如 `mad-buildabase` 主 pack 存在时,自动忽略 `mad-buildabase-12.0.1`、`mad-astral-12.5.0` 等带版本号后缀的 pack。

判定规则:正则 `^(.+?)-\d+(?:\.\d+){1,2}$` —— `<base>-<x.y>` 或 `<base>-<x.y.z>` 形式,且同名 `<base>` pack 也存在时才跳过。

## 解决的问题

- Grid 里同一 scene 在多个版本 pack 中重复出现
- 版本变体 pack 的 thumb 大部分没被 `download-thumbs.py --skip-dups` 下载到,导致 grid 显示一大堆"无图"格子

## 兼容性

- `INDEX_VERSION` `1` → `2`,旧的 `_lal_index.json` 缓存自动失效
- 模块下次启动会自动重新 scan(进度条会再走一遍)
- 不影响已经导入到 FVTT world 的 scene/asset

## 升级

- **方式 A**: Foundry → Add-on Modules → Install Module → 粘贴 manifest URL
  - manifest: <https://github.com/takaqiao/local-asset-library/releases/latest/download/module.json>
- **方式 B**: 直接下 `module.zip` 解压到 `Data/modules/local-asset-library/` 覆盖
- **方式 C(线下补丁)**: 把本目录的 `module.zip` 给别人拿过去解压

## GitHub Release

<https://github.com/takaqiao/local-asset-library/releases/tag/v0.4.3>
