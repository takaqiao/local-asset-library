# v0.4.5 — 默认根路径 = Hamster

配合"按 creator 单独打 zip 分发"的约定。每个 creator zip 内顶层都是 `Hamster/<creator>/...`。

用户流程:
1. 下 `<creator>.zip`
2. 解压到 Foundry `Data/` 目录
3. 自动落到 `Data/Hamster/<creator>/`
4. 模块默认就读 `Hamster` 子目录,零配置可用

## 改动

- 默认 `rootSubpath`: `assets` → `Hamster`
- hint 文案更新

## 兼容性

- 老用户已自定义 rootSubpath 的不受影响,world setting 优先
- 全新装的 user 解压 zip 到 `Data/` 即可

## 升级

- manifest: <https://github.com/takaqiao/local-asset-library/releases/latest/download/module.json>
- 或直接覆盖本目录 `module.zip` 到 `Data/modules/local-asset-library/`

## GitHub Release

<https://github.com/takaqiao/local-asset-library/releases/tag/v0.4.5>
