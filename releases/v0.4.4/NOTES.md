# v0.4.4 — 紧急回滚 v0.4.3 的错误 dedup

## 为什么回滚

v0.4.3 假设 `mad-xxx-12.0.1` 是 `mad-xxx` 的版本变体,跳过显示。**这个假设是错的** — 实测对照 Moulinette catalog 的 pack_ref:

```
本地 138 unique pack_ref
Moulinette catalog 139 unique pack_ref
重合 138 / 本地有 catalog 没: 0
带版本号后缀 pack 100% 在 Moulinette catalog 里独立显示
```

例:
- `mad-buildabase` (pack_ref=11950, name="Build-a-Base Modular Pack")
- `mad-buildabase-12.0.1` (pack_ref=8487, name="Build a Base")

是 Moulinette 里 **两个独立 pack**(不同名、不同 ref),Moulinette UI 把它们都显示。v0.4.3 dedup 把 56 个 Moulinette 也显示的 pack 给隐藏了。

## 改动

- scanner 回归显示所有本地 pack(和 Moulinette 行为一致)
- `INDEX_VERSION` `2` → `3`,旧缓存自动失效
- 模块下次启动会自动重 scan,grid 里"消失"的 pack 会回来

## 后续 thumb 问题

下游 `download-thumbs.py` 也基于同款错误判定,默认 `--skip-dups` 把 89 个独立 pack 的 thumb 没下到。需要 session 有效后重跑:

```
python download-thumbs.py --creator "The MAD Cartographer" --data-root G:\moulinette\Data
```

(已改 — 默认就是不去重)

## 升级

- manifest: <https://github.com/takaqiao/local-asset-library/releases/latest/download/module.json>
- 或下 `module.zip` 覆盖到 `Data/modules/local-asset-library/`

## GitHub Release

<https://github.com/takaqiao/local-asset-library/releases/tag/v0.4.4>
