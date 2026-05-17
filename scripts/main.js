/**
 * 本地素材库 (local-asset-library)
 *
 * 读 <dataPath>/<rootSubpath>/<creator>/<pack>/_pack_meta_*.json 重建内存索引,
 * 不调任何外部 API. 浏览 / 搜索 / 拖拽即用.
 */

const MODULE_ID = "local-asset-library";
const FOLDER_ROOT = "素材库";
const FOLDER_COLOR = "#e87209";
const PLAYLIST_NAME = "素材音频";

const ASSET_TYPES = {
  1: "Scene", 2: "Map", 3: "Image", 4: "PDF", 5: "Actor",
  6: "Item", 7: "Audio", 8: "JournalEntry", 9: "Playlist",
  10: "Macro", 11: "RollTable", 12: "Adventure",
  97: "Icon", 98: "ScenePacker", 99: "Undefined",
};
const AT_NAMES = { ...ASSET_TYPES };

const AT_NAMES_CN = {
  1: "场景", 2: "地图", 3: "图片", 4: "PDF", 5: "角色",
  6: "物品", 7: "音频", 8: "日志", 9: "播放列表",
  10: "宏", 11: "随机表", 12: "冒险",
  97: "图标", 98: "ScenePacker", 99: "未知",
};

const DOC_CLASS_BY_TYPE = {
  1: "Scene", 5: "Actor", 6: "Item", 8: "JournalEntry",
  9: "Playlist", 10: "Macro", 11: "RollTable", 12: "Adventure",
};

function debounce(fn, ms) {
  let t;
  return function (...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), ms);
  };
}

function rewriteDeps(text, packPath) {
  if (!packPath) return text;
  return text.replaceAll("#DEP#", `${packPath}/`);
}

function isVideoUrl(url) {
  return /\.(webm|mp4|m4v|ogv)(\?|$)/i.test(url);
}

function safeJsonParse(text, ctx = "") {
  try { return JSON.parse(text); }
  catch (e) {
    console.error(`[${MODULE_ID}] JSON 解析失败 ${ctx}:`, e);
    throw new Error(`JSON 无效${ctx ? " (" + ctx + ")" : ""}: ${e.message}`);
  }
}

// ---------- Folder 管理 ----------
async function getOrCreateFolder(docType, pathSegments) {
  if (!game.settings.get(MODULE_ID, "useFolders")) return null;
  if (!Array.isArray(pathSegments) || pathSegments.length === 0) return null;

  let parent = null;
  for (const segment of pathSegments) {
    if (!segment) continue;
    let folder = game.folders.find(
      f => f.type === docType && f.name === segment &&
           (f.folder?.id || null) === (parent?.id || null)
    );
    if (!folder) {
      try {
        folder = await Folder.create({
          name: segment, type: docType, color: FOLDER_COLOR,
          folder: parent?.id || null,
        });
      } catch (e) {
        folder = game.folders.find(
          f => f.type === docType && f.name === segment &&
               (f.folder?.id || null) === (parent?.id || null)
        );
        if (!folder) throw e;
      }
    }
    parent = folder;
  }
  return parent;
}

function makeFolderPath(asset) {
  const creator = asset?.pack?.creator || "未知";
  const pack = asset?.pack?.name || "未知";
  return [FOLDER_ROOT, creator, pack];
}

const INDEX_CACHE_FILE = "_lal_index.json";
const INDEX_VERSION = 1;

// ---------- Scanner ----------
class LalScanner {
  constructor(rootSubpath) {
    this.rootSubpath = rootSubpath || "assets";
  }

  /** 试读 <rootSubpath>/_lal_index.json, 命中且版本/路径匹配则返回 assets 数组 */
  async loadCached() {
    const url = `${this.rootSubpath}/${INDEX_CACHE_FILE}`;
    try {
      const resp = await fetch(url);
      if (!resp.ok) return null;
      const data = await resp.json();
      if (data.version !== INDEX_VERSION) return null;
      if (data.rootSubpath !== this.rootSubpath) return null;
      if (!Array.isArray(data.assets)) return null;
      console.log(`[${MODULE_ID}] 从缓存载入 ${data.assets.length} 个 asset (${data.timestamp})`);
      return data.assets;
    } catch (e) {
      return null;
    }
  }

  /** 把 assets 写到 <rootSubpath>/_lal_index.json (next open 秒载) */
  async saveCached(assets) {
    try {
      const data = {
        version: INDEX_VERSION,
        timestamp: new Date().toISOString(),
        rootSubpath: this.rootSubpath,
        count: assets.length,
        assets,
      };
      const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
      const file = new File([blob], INDEX_CACHE_FILE, { type: "application/json" });
      await FilePicker.upload("data", this.rootSubpath, file, {}, { notify: false });
      console.log(`[${MODULE_ID}] 索引已缓存到 ${this.rootSubpath}/${INDEX_CACHE_FILE} (${assets.length} 个 asset)`);
    } catch (e) {
      console.warn(`[${MODULE_ID}] 缓存索引失败 (无写权限?):`, e);
    }
  }

  async scan(onProgress = null) {
    const allAssets = [];
    let nCreators = 0, nPacks = 0, nMetaFiles = 0;

    let root;
    try {
      root = await FilePicker.browse("data", this.rootSubpath);
    } catch (e) {
      console.error(`[${MODULE_ID}] 无法浏览 ${this.rootSubpath}:`, e);
      ui.notifications.error(`找不到 ${this.rootSubpath}/. 请在模块设置里改根路径.`);
      return allAssets;
    }

    for (const creatorDir of root.dirs) {
      nCreators++;
      onProgress?.(`扫描创作者 ${nCreators}: ${creatorDir.split("/").pop()}`);

      let packsBrowse;
      try { packsBrowse = await FilePicker.browse("data", creatorDir); }
      catch (e) { console.warn(`[${MODULE_ID}] 跳过 ${creatorDir}:`, e); continue; }

      for (const packDir of packsBrowse.dirs) {
        nPacks++;
        let packBrowse;
        try { packBrowse = await FilePicker.browse("data", packDir); }
        catch (e) { console.warn(`[${MODULE_ID}] 跳过 ${packDir}:`, e); continue; }

        const metaFiles = packBrowse.files.filter(
          f => f.includes("_pack_meta_") && f.endsWith(".json") && !f.includes(INDEX_CACHE_FILE)
        );

        for (const metaFile of metaFiles) {
          nMetaFiles++;
          try {
            const resp = await fetch(metaFile);
            const meta = await resp.json();
            const type = meta.type;
            for (const asset of (meta.assets || [])) {
              const localFile = `${packDir}/${asset.filepath}`;
              // 抽 thumb 路径: metadata.thumb = "json/scene/X_thumb.webp?sig=..."
              // 去掉 SAS 查询串, 拼成本地路径; 文件可能不存在,UI 用 onerror 兜底
              let thumbLocal = null;
              if (asset.thumb) {
                const pathPart = String(asset.thumb).split("?")[0];
                if (pathPart) thumbLocal = `${packDir}/${pathPart}`;
              }
              allAssets.push({
                ...asset,
                _localPath: localFile,
                _packPath: packDir,
                _type: type,
                _thumbLocal: thumbLocal,
              });
            }
          } catch (e) {
            console.warn(`[${MODULE_ID}] 读 ${metaFile} 失败:`, e);
          }
        }
      }
    }

    onProgress?.(`完成: ${allAssets.length} 个 asset / ${nPacks} 个合集 / ${nMetaFiles} 个 metadata`);
    return allAssets;
  }
}

// ---------- Index ----------
class LalIndex {
  constructor(assets = []) {
    this.assets = assets;
    this.byType = new Map();
    this.byCreator = new Map();
    this._buildLookups();
  }

  _buildLookups() {
    for (const a of this.assets) {
      const t = a._type ?? a.type;
      const c = a.pack?.creator || "?";
      if (!this.byType.has(t)) this.byType.set(t, []);
      this.byType.get(t).push(a);
      if (!this.byCreator.has(c)) this.byCreator.set(c, []);
      this.byCreator.get(c).push(a);
    }
  }

  search({ query = "", types = null, creators = null, packs = null, folderPrefix = null,
           favoritesOnly = false, favorites = null, sort = "name-asc" }) {
    let r = this.assets;
    if (types?.length) r = r.filter(a => types.includes(a._type ?? a.type));
    if (creators?.length) r = r.filter(a => creators.includes(a.pack?.creator));
    if (packs?.length) r = r.filter(a => packs.includes(a.pack?.name));
    if (folderPrefix) r = r.filter(a => (a.filepath || "").startsWith(folderPrefix));
    if (favoritesOnly && favorites) {
      r = r.filter(a => favorites.has(String(a._id)));
    }
    if (query) {
      const q = query.toLowerCase();
      r = r.filter(a =>
        a.filepath?.toLowerCase().includes(q) ||
        a.pack?.name?.toLowerCase().includes(q) ||
        a.name?.toLowerCase().includes(q)
      );
    }
    return LalIndex.applySort(r, sort);
  }

  /** 从指定 creator + pack 的 asset filepath 提取所有第一层子目录 */
  getFoldersForPack(creator, packName) {
    const folders = new Set();
    for (const a of this.assets) {
      if (creator && a.pack?.creator !== creator) continue;
      if (packName && a.pack?.name !== packName) continue;
      const parts = (a.filepath || "").split("/");
      if (parts.length > 1) folders.add(parts[0]);
    }
    return [...folders].sort();
  }

  static applySort(arr, mode) {
    const sorted = [...arr];
    switch (mode) {
      case "name-asc":
        sorted.sort((a, b) => (a.filepath || "").localeCompare(b.filepath || "")); break;
      case "name-desc":
        sorted.sort((a, b) => (b.filepath || "").localeCompare(a.filepath || "")); break;
      case "size-desc":
        sorted.sort((a, b) => (b.filesize || 0) - (a.filesize || 0)); break;
      case "size-asc":
        sorted.sort((a, b) => (a.filesize || 0) - (b.filesize || 0)); break;
      case "pack":
        sorted.sort((a, b) => {
          const p = (a.pack?.name || "").localeCompare(b.pack?.name || "");
          if (p) return p;
          return (a.filepath || "").localeCompare(b.filepath || "");
        }); break;
    }
    return sorted;
  }
}

// ---------- 单 asset 导入 ----------
async function fetchAndRewrite(url, packPath) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`fetch ${url}: ${resp.status}`);
  let text = await resp.text();
  const depCount = (text.match(/#DEP#/g) || []).length;
  text = rewriteDeps(text, packPath);
  console.log(`[${MODULE_ID}] ${depCount} 个 #DEP# 引用${packPath ? "已重写" : "未处理 (缺 packPath)"}`);
  return text;
}

/**
 * 从 scene JSON 抽取所有 world-level 文档引用 ID
 * 不抓 Compendium.* 引用 (我们没那个 compendium)
 */
function extractSceneRefs(text, parsed) {
  const journalIds = new Set();
  const playlistIds = new Set();
  const actorIds = new Set();

  // UUID 形态: "JournalEntry.AbCdEf1234567890" - tile flags / region behaviors 里常用
  for (const m of text.matchAll(/["']JournalEntry\.([A-Za-z0-9]{8,32})["']/g)) journalIds.add(m[1]);
  for (const m of text.matchAll(/["']Playlist\.([A-Za-z0-9]{8,32})["']/g)) playlistIds.add(m[1]);
  for (const m of text.matchAll(/["']Actor\.([A-Za-z0-9]{8,32})["']/g)) actorIds.add(m[1]);

  // 字段形态: scene.notes[].entryId, scene.tokens[].actor, scene.playlist
  for (const note of (parsed.notes || [])) {
    if (note.entryId) journalIds.add(note.entryId);
  }
  for (const tok of (parsed.tokens || [])) {
    if (tok.actor) actorIds.add(tok.actor);
    if (tok.actorId) actorIds.add(tok.actorId);
  }
  if (parsed.playlist) playlistIds.add(parsed.playlist);

  return { journalIds, playlistIds, actorIds };
}

/**
 * 找同 pack 里 _id 匹配的资产并 import (按 keepId 保留 id, 这样 scene 内引用得以解析)
 * 比"import 整 pack"省事多了 - 之前 13 个 journal 中只有 1 个被引用,现在只 import 那 1 个
 */
async function importReferencedDocs(refIds, packPath, docName) {
  const idx = game.modules.get(MODULE_ID).api.index;
  if (!idx || refIds.size === 0) return 0;
  const typeId = { JournalEntry: 8, Playlist: 9, Actor: 5, Item: 6, Macro: 10, RollTable: 11 }[docName];
  if (!typeId) return 0;
  const cls = CONFIG[docName]?.documentClass;
  if (!cls) return 0;
  const collectionKey = docName.charAt(0).toLowerCase() + docName.slice(1) + "s";

  const candidates = idx.assets.filter(a =>
    a._packPath === packPath && (a._type ?? a.type) === typeId
  );
  if (candidates.length === 0) return 0;

  let imported = 0;
  const remaining = new Set(refIds);
  for (const ca of candidates) {
    if (remaining.size === 0) break;
    try {
      const text = await fetchAndRewrite(ca._localPath, ca._packPath);
      const data = safeJsonParse(text, ca._localPath);
      if (!remaining.has(data._id)) continue;
      remaining.delete(data._id);

      if (game[collectionKey]?.get?.(data._id)) continue;  // 已在 world

      delete data._stats;
      const folder = await getOrCreateFolder(docName, makeFolderPath(ca));
      if (folder) data.folder = folder.id;
      const docData = await cls.fromImport(data);
      try {
        await cls.create(docData, { keepId: true });
      } catch {
        const plain = (typeof docData.toObject === "function") ? docData.toObject() : { ...docData };
        delete plain._id;
        await cls.create(plain);
      }
      imported++;
      console.log(`[${MODULE_ID}]   ↳ import 引用 ${docName} ${data._id} (${ca.filepath?.split("/").pop()})`);
    } catch (e) {
      console.warn(`[${MODULE_ID}] 解析 ${ca._localPath} 失败:`, e.message);
    }
  }
  if (remaining.size > 0) {
    console.warn(`[${MODULE_ID}] ${remaining.size} 个 ${docName} 引用在本 pack 未找到:`, [...remaining]);
  }
  return imported;
}

// scene 分类: "empty" 全空 / "walls-only" 只有墙线无图 / "overlay" 透明图层 / "normal" 正常
const OVERLAY_FILENAME_RE = /transparent|canopy|_roof|_topfr|_top_fr|foreground|_overlay/i;

/**
 * 挑最合适的图当 thumb 源.
 * 优先 background.src; 否则按面积降序找第一个非 overlay 的 tile;
 * 都没有就用最大 tile (好歹有轮廓).
 */
function pickThumbnailSource(scene) {
  const bgSrc = scene.background?.src;
  if (bgSrc) return bgSrc;
  const tiles = scene.tiles?.contents || [];
  if (tiles.length === 0) return null;
  const sorted = [...tiles].sort((a, b) =>
    ((b.width || 0) * (b.height || 0)) - ((a.width || 0) * (a.height || 0))
  );
  const opaque = sorted.find(t => {
    const fname = (t.texture?.src || "").split("/").pop() || "";
    return !OVERLAY_FILENAME_RE.test(fname);
  });
  return opaque?.texture?.src || sorted[0]?.texture?.src || null;
}

function classifyScene(parsed) {
  const tiles = parsed.tiles || [];
  const walls = parsed.walls || [];
  const lights = parsed.lights || [];
  const tokens = parsed.tokens || [];
  const notes = parsed.notes || [];
  const drawings = parsed.drawings || [];
  const bgSrc = parsed.background?.src;

  // 全空: 0 of everything, no bg
  if (!tiles.length && !walls.length && !lights.length && !tokens.length &&
      !notes.length && !drawings.length && !bgSrc) {
    return "empty";
  }

  // 只有墙/灯, 无 tile 无 bg (MAD 早期 v2.3/v11 时代"墙线包")
  if (!tiles.length && !bgSrc) {
    return "walls-only";
  }

  // 有 tile 但都是 transparent/canopy/roof/overlay 后缀 (要叠图层用)
  if (tiles.length && !bgSrc) {
    const largest = tiles.reduce((m, t) =>
      (t.width || 0) * (t.height || 0) > (m.width || 0) * (m.height || 0) ? t : m, tiles[0]);
    const srcName = ((largest.texture?.src) || "").split("/").pop().toLowerCase();
    if (/transparent|canopy|_roof|_topfr|_top_fr|foreground|_overlay/i.test(srcName)) {
      return "overlay";
    }
  }

  return "normal";
}

async function importSceneJSON(text, asset) {
  const cls = CONFIG.Scene.documentClass;
  const parsed = safeJsonParse(text, asset?._localPath);
  delete parsed._stats;
  if (parsed.thumb) {
    console.log(`[${MODULE_ID}] 移除指向不可达资源的 thumb: ${parsed.thumb}`);
    delete parsed.thumb;
  }

  // 分类: empty/walls-only/overlay/normal
  const kind = classifyScene(parsed);
  const sceneName = parsed.name || asset?.filepath || "未知";
  const skipBlank = game.settings.get(MODULE_ID, "skipBlankScenes");

  if (kind === "empty") {
    console.warn(`[${MODULE_ID}] 空模板,跳过: ${sceneName}`);
    ui.notifications.warn(`"${sceneName}" 是空模板,已跳过`);
    return null;
  }
  if (kind === "walls-only" && skipBlank) {
    console.warn(`[${MODULE_ID}] walls-only scene,跳过: ${sceneName}`);
    ui.notifications.warn(`"${sceneName}" 只有墙/灯无背景图 (MAD 早期版本),已跳过 — 在设置可关跳过`);
    return null;
  }
  if (kind === "overlay") {
    console.warn(`[${MODULE_ID}] overlay 图层 scene: ${sceneName}`);
    ui.notifications.info(`"${sceneName}" 是图层 scene (透明背景),需配合底图 scene 叠加才能看见完整画面`);
    // 仍 import
  }

  // 只 import scene 真正引用的 journal/playlist/actor, 不创空 stub
  if (asset?._packPath) {
    const refs = extractSceneRefs(text, parsed);
    if (refs.journalIds.size > 0) {
      const n = await importReferencedDocs(refs.journalIds, asset._packPath, "JournalEntry");
      console.log(`[${MODULE_ID}] 按引用 import ${n}/${refs.journalIds.size} 个 journal`);
    }
    if (refs.playlistIds.size > 0) {
      const n = await importReferencedDocs(refs.playlistIds, asset._packPath, "Playlist");
      console.log(`[${MODULE_ID}] 按引用 import ${n}/${refs.playlistIds.size} 个 playlist`);
    }
    if (refs.actorIds.size > 0) {
      const n = await importReferencedDocs(refs.actorIds, asset._packPath, "Actor");
      console.log(`[${MODULE_ID}] 按引用 import ${n}/${refs.actorIds.size} 个 actor`);
    }
  }

  const folder = await getOrCreateFolder("Scene", makeFolderPath(asset));
  if (folder) parsed.folder = folder.id;

  const docData = await cls.fromImport(parsed);

  let scene;
  try {
    scene = await cls.create(docData, { keepId: true });
  } catch (e) {
    console.warn(`[${MODULE_ID}] keepId 创建 scene 失败,重试不保 id:`, e.message);
    const plain = (typeof docData.toObject === "function") ? docData.toObject() : { ...docData };
    delete plain._id;
    scene = await cls.create(plain);
  }

  if (game.settings.get(MODULE_ID, "genThumbnails")) {
    const thumbSrc = pickThumbnailSource(scene);
    if (thumbSrc) {
      try {
        const t = await scene.createThumbnail({ img: thumbSrc });
        if (t?.thumb) await scene.update({ thumb: t.thumb });
        console.log(`[${MODULE_ID}] 缩略图生成自: ${thumbSrc.split("/").pop()}`);
      } catch (e) {
        console.warn(`[${MODULE_ID}] 生成缩略图失败:`, e);
      }
    } else {
      console.log(`[${MODULE_ID}] 无可用源图, 跳过 thumb`);
    }
  }

  console.log(`[${MODULE_ID}] 场景已导入:`, {
    id: scene.id, name: scene.name, width: scene.width, height: scene.height,
    padding: scene.padding, folder: folder?.name,
  });

  await scene.view();
  ui.scenes?.activate();
  return scene;
}

async function importDocByClass(text, docName, asset) {
  const cls = CONFIG[docName]?.documentClass;
  if (!cls) throw new Error(`找不到 CONFIG.${docName}.documentClass`);
  const data = safeJsonParse(text, asset?._localPath);
  delete data._stats;
  const folder = await getOrCreateFolder(docName, makeFolderPath(asset));
  if (folder) data.folder = folder.id;
  const docData = await cls.fromImport(data);

  let created;
  try {
    created = await cls.create(docData, { keepId: true });
  } catch (e) {
    console.warn(`[${MODULE_ID}] keepId 创建 ${docName} 失败,重试不保 id:`, e.message);
    const plain = (typeof docData.toObject === "function") ? docData.toObject() : { ...docData };
    delete plain._id;
    created = await cls.create(plain);
  }

  const sidebarKey = `${docName.toLowerCase()}s`;
  ui[sidebarKey]?.activate?.();
  if (game.settings.get(MODULE_ID, "autoOpenSheet")) created.sheet?.render(true);
  return created;
}

async function importJournalEntryJSON(text, asset) {
  const data = safeJsonParse(text, asset?._localPath);
  delete data._stats;
  if (!data.pages && (data.type || data.content)) {
    console.log(`[${MODULE_ID}] 把老格式 journal 包成 pages[]`);
    data.pages = [{
      name: data.name || "Page",
      type: "text",
      text: { content: data.content || "" },
    }];
    delete data.type;
    delete data.content;
  }
  const folder = await getOrCreateFolder("JournalEntry", makeFolderPath(asset));
  if (folder) data.folder = folder.id;

  const docData = await JournalEntry.fromImport(data);
  let created;
  try {
    created = await JournalEntry.create(docData, { keepId: true });
  } catch (e) {
    console.warn(`[${MODULE_ID}] keepId 创建 journal 失败,重试:`, e.message);
    const plain = (typeof docData.toObject === "function") ? docData.toObject() : { ...docData };
    delete plain._id;
    created = await JournalEntry.create(plain);
  }
  ui.journal?.activate();
  if (game.settings.get(MODULE_ID, "autoOpenSheet")) created.sheet?.render(true);
  return created;
}

async function importPDFAsJournal(url, asset) {
  const folder = await getOrCreateFolder("JournalEntry", makeFolderPath(asset));
  const name = asset?.filepath?.split("/").pop()?.replace(/\.[^.]+$/, "") || "PDF";
  const data = {
    name,
    folder: folder?.id || null,
    pages: [{
      name,
      type: "pdf",
      title: { show: false, level: 1 },
      src: url,
    }],
  };
  const created = await JournalEntry.create(data);
  ui.journal?.activate();
  if (game.settings.get(MODULE_ID, "autoOpenSheet")) created.sheet?.render(true);
  return created;
}

async function addOrToggleAudio(url, asset) {
  const channel = game.settings.get(MODULE_ID, "audioChannel");
  const rawVolume = Number(game.settings.get(MODULE_ID, "audioVolume"));
  // Moulinette 用 AudioHelper.inputToVolume 把 input slider 0-1 转 perceptual log scale
  const volume = (foundry.audio?.AudioHelper?.inputToVolume?.(rawVolume))
    ?? (AudioHelper?.inputToVolume?.(rawVolume)) ?? rawVolume;
  let playlist = game.playlists.find(p => p.name === PLAYLIST_NAME);
  if (!playlist) {
    playlist = await Playlist.create({ name: PLAYLIST_NAME, mode: -1 });
  }
  const existing = playlist.sounds.find(s => s.path === url);
  if (existing) {
    await playlist.updateEmbeddedDocuments("PlaylistSound", [{
      _id: existing.id, playing: !existing.playing,
    }]);
    return { playlist, toggled: true, playing: !existing.playing };
  }
  const soundName = asset?.filepath?.split("/").pop()?.replace(/\.[^.]+$/, "") || "Sound";
  const [created] = await playlist.createEmbeddedDocuments("PlaylistSound", [{
    name: soundName, path: url, channel, volume, playing: true,
  }]);
  ui.playlists?.activate();
  return { playlist, sound: created, added: true };
}

async function createTileFromAsset(asset, dropPos) {
  if (!canvas?.scene) throw new Error("当前没有打开任何场景");
  const url = asset._localPath;
  const sceneGrid = canvas.grid?.size || 100;
  const w = (asset.size?.width || 0) > 0 ? asset.size.width : sceneGrid;
  const h = (asset.size?.height || 0) > 0 ? asset.size.height : sceneGrid;
  let cx = dropPos?.x ?? canvas.dimensions.width / 2;
  let cy = dropPos?.y ?? canvas.dimensions.height / 2;
  // snap-to-grid: 把 tile 中心点 round 到 grid
  if (game.settings.get(MODULE_ID, "snapToGrid")) {
    cx = Math.round(cx / sceneGrid) * sceneGrid;
    cy = Math.round(cy / sceneGrid) * sceneGrid;
  }
  const x = cx - w / 2;
  const y = cy - h / 2;
  const tileData = {
    texture: { src: url },
    x, y, width: w, height: h,
    rotation: 0, sort: 0, hidden: false, locked: false,
  };
  if (isVideoUrl(url)) {
    tileData.video = { loop: true, autoplay: true, volume: 0 };
  }
  const [tile] = await canvas.scene.createEmbeddedDocuments("Tile", [tileData]);
  return tile;
}

/** 图作 Note (journal pin): 创建一个临时 JournalEntry 然后 Note 引用它 */
async function createNoteFromImage(asset, dropPos) {
  if (!canvas?.scene) throw new Error("当前没有打开任何场景");
  const name = asset?.name || asset?.filepath?.split("/").pop()?.replace(/\.[^.]+$/, "") || "Note";
  const folder = await getOrCreateFolder("JournalEntry", makeFolderPath(asset));
  const journal = await JournalEntry.create({
    name, folder: folder?.id || null,
    pages: [{ name, type: "text", text: { content: "" } }],
  });
  const sceneGrid = canvas.grid?.size || 100;
  let cx = dropPos?.x ?? canvas.dimensions.width / 2;
  let cy = dropPos?.y ?? canvas.dimensions.height / 2;
  if (game.settings.get(MODULE_ID, "snapToGrid")) {
    cx = Math.round(cx / sceneGrid) * sceneGrid;
    cy = Math.round(cy / sceneGrid) * sceneGrid;
  }
  const [note] = await canvas.scene.createEmbeddedDocuments("Note", [{
    entryId: journal.id, x: cx, y: cy,
    icon: asset._localPath, iconSize: 64, text: name,
  }]);
  return note;
}

/** 图作 Token: 弹 Dialog 选 Actor 类型, 创建临时 Actor 用此图当 token 头像 */
async function createTokenFromImage(asset, dropPos) {
  if (!canvas?.scene) throw new Error("当前没有打开任何场景");
  const actorTypes = Object.keys(CONFIG.Actor?.dataModels || {});
  const defaultType = actorTypes[0] || "base";
  const name = asset?.name || asset?.filepath?.split("/").pop()?.replace(/\.[^.]+$/, "") || "Token";
  const options = actorTypes.map(t => `<option value="${t}">${t}</option>`).join("");
  return new Promise((resolve) => {
    new Dialog({
      title: "拖图作 Token",
      content: `
        <form>
          <div class="form-group"><label>Actor 类型:</label>
            <select name="actorType">${options || `<option value="${defaultType}">${defaultType}</option>`}</select>
          </div>
          <div class="form-group"><label>名字:</label>
            <input type="text" name="name" value="${name}" />
          </div>
        </form>`,
      buttons: {
        create: {
          icon: '<i class="fas fa-check"></i>', label: "创建",
          callback: async (html) => {
            const at = html.find('[name="actorType"]').val();
            const nm = html.find('[name="name"]').val() || name;
            const folder = await getOrCreateFolder("Actor", makeFolderPath(asset));
            const actor = await Actor.create({
              name: nm, type: at, folder: folder?.id || null,
              img: asset._localPath,
              prototypeToken: { name: nm, texture: { src: asset._localPath } },
            });
            const sceneGrid = canvas.grid?.size || 100;
            let cx = dropPos?.x ?? canvas.dimensions.width / 2;
            let cy = dropPos?.y ?? canvas.dimensions.height / 2;
            if (game.settings.get(MODULE_ID, "snapToGrid")) {
              cx = Math.round(cx / sceneGrid) * sceneGrid;
              cy = Math.round(cy / sceneGrid) * sceneGrid;
            }
            const td = await actor.getTokenDocument({ x: cx - sceneGrid / 2, y: cy - sceneGrid / 2 });
            await canvas.scene.createEmbeddedDocuments("Token", [td.toObject()]);
            ui.notifications.info(`Token 已创建: ${nm}`);
            resolve(actor);
          }
        },
        cancel: { icon: '<i class="fas fa-times"></i>', label: "取消", callback: () => resolve(null) }
      },
      default: "create",
    }).render(true);
  });
}

/** Sidebar drop: 图 → Scene 侧栏 = 用此图建新 Scene */
async function createSceneFromImage(asset) {
  const name = asset?.name || asset?.filepath?.split("/").pop()?.replace(/\.[^.]+$/, "") || "新场景";
  const w = (asset.size?.width || 0) > 0 ? asset.size.width : 4000;
  const h = (asset.size?.height || 0) > 0 ? asset.size.height : 3000;
  const folder = await getOrCreateFolder("Scene", makeFolderPath(asset));
  const scene = await Scene.create({
    name, folder: folder?.id || null,
    width: w, height: h, padding: 0.25,
    background: { src: asset._localPath },
    grid: { size: 100 },
  });
  // 生成 thumb
  try {
    const t = await scene.createThumbnail({ img: asset._localPath });
    if (t?.thumb) await scene.update({ thumb: t.thumb });
  } catch {}
  await scene.view();
  ui.scenes?.activate();
  ui.notifications.info(`Scene 已建: ${name}`);
  return scene;
}

/** Sidebar drop: 音频 → Playlist 侧栏 = 加入指定 Playlist */
async function addAudioToSpecificPlaylist(asset, playlistId) {
  const playlist = game.playlists.get(playlistId);
  if (!playlist) throw new Error(`找不到 playlist ${playlistId}`);
  const channel = game.settings.get(MODULE_ID, "audioChannel");
  const rawVolume = Number(game.settings.get(MODULE_ID, "audioVolume"));
  const volume = (foundry.audio?.AudioHelper?.inputToVolume?.(rawVolume))
    ?? (AudioHelper?.inputToVolume?.(rawVolume)) ?? rawVolume;
  const name = asset?.name || asset?.filepath?.split("/").pop()?.replace(/\.[^.]+$/, "") || "Sound";
  const [s] = await playlist.createEmbeddedDocuments("PlaylistSound", [{
    name, path: asset._localPath, channel, volume,
  }]);
  ui.notifications.info(`已加入 "${playlist.name}": ${name}`);
  return s;
}

/** Sidebar drop: Item → Actor sheet/sidebar */
async function addItemToActor(asset, actor) {
  const text = await fetchAndRewrite(asset._localPath, asset._packPath);
  const data = safeJsonParse(text, asset._localPath);
  delete data._stats;
  delete data._id;  // 加到 actor 里不保 id
  const [item] = await actor.createEmbeddedDocuments("Item", [data]);
  ui.notifications.info(`Item 加给 ${actor.name}: ${item.name}`);
  return item;
}

async function importAsset(asset, dropPos = null) {
  if (!game.user?.isGM) {
    ui.notifications.warn("只有 GM 可以导入素材");
    return null;
  }
  const at = asset._type ?? asset.type;
  const url = asset._localPath;
  const packPath = asset._packPath;
  const docName = DOC_CLASS_BY_TYPE[at];
  console.log(`[${MODULE_ID}] 导入 type=${at}(${AT_NAMES[at]}) url=${url}`);

  if (at === 3 || at === 2) {
    if (!canvas?.scene) {
      ui.notifications.warn("没有打开的场景,无法放置");
      return null;
    }
    const dropAs = game.settings.get(MODULE_ID, "dropImageAs");
    if (dropAs === "note") {
      const note = await createNoteFromImage(asset, dropPos);
      ui.notifications.info(`Note 已创建: ${asset.name || asset.filepath}`);
      return note;
    }
    if (dropAs === "token") {
      return await createTokenFromImage(asset, dropPos);
    }
    const tile = await createTileFromAsset(asset, dropPos);
    ui.notifications.info(`${isVideoUrl(url) ? "视频 " : ""}Tile 已创建: ${url.split("/").pop()}`);
    return tile;
  }

  if (at === 4) {
    const j = await importPDFAsJournal(url, asset);
    ui.notifications.info(`PDF 已导入: ${j.name}`);
    return j;
  }

  if (at === 7) {
    const r = await addOrToggleAudio(url, asset);
    if (r.added) ui.notifications.info(`已加入音频: ${r.sound.name}`);
    else ui.notifications.info(`音频${r.playing ? "播放中" : "已停止"}`);
    return r;
  }

  if (at === 97) {
    await navigator.clipboard?.writeText?.(url);
    ui.notifications.info(`图标已复制: ${url}`);
    return null;
  }

  if (docName) {
    const text = await fetchAndRewrite(url, packPath);
    let created;
    if (docName === "Scene") {
      created = await importSceneJSON(text, asset);
    } else if (docName === "JournalEntry") {
      created = await importJournalEntryJSON(text, asset);
    } else if (docName === "Adventure") {
      const data = safeJsonParse(text, asset?._localPath);
      delete data._stats;
      const advData = await Adventure.fromImport(data);
      created = await Adventure.create(advData);
      ui.notifications.info(`Adventure 已导入: ${created.name}`);
    } else {
      created = await importDocByClass(text, docName, asset);
    }
    ui.notifications.info(`${docName} 已导入: ${created?.name || created?.id}`);
    return created;
  }

  ui.notifications.warn(`asset_type ${at} (${AT_NAMES[at]}) 暂无对应导入器`);
  return null;
}

// ---------- Browser UI ----------
let _autoScanInProgress = false;

class LalBrowser extends Application {
  static _instance = null;
  static getInstance() {
    const inst = LalBrowser._instance;
    if (inst && inst.rendered) { console.log(`${MODULE_ID} | 复用已有窗口`); return inst; }
    console.log(`${MODULE_ID} | 新建窗口实例`);
    LalBrowser._instance = new LalBrowser();
    return LalBrowser._instance;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "local-asset-library-browser",
      title: "本地素材库",
      template: `modules/${MODULE_ID}/templates/browser.hbs`,
      width: 1200,
      height: 800,
      resizable: true,
      classes: ["lal-root"],
    });
  }

  constructor(options = {}) {
    super(options);
    this.filterType = "3";
    this.filterCreator = "";
    this.filterPack = "";
    this.filterFolder = "";
    this.searchQuery = "";
    this.sortMode = "name-asc";
    this.page = 0;
    this.pageSize = 60;
    this.selectMode = false;
    this.selectedIds = new Set();
    this.favoritesOnly = false;
    // 客户端 favorites 从设置加载
    this.favorites = new Set(game.settings.get(MODULE_ID, "favorites") || []);
  }

  async _saveFavorites() {
    await game.settings.set(MODULE_ID, "favorites", [...this.favorites]);
  }

  get index() { return game.modules.get(MODULE_ID).api.index; }

  async _autoScan(forceFresh = false) {
    if (_autoScanInProgress) return;
    if (this.index && !forceFresh) return;
    _autoScanInProgress = true;
    try {
      const subpath = game.settings.get(MODULE_ID, "rootSubpath");
      const scanner = new LalScanner(subpath);

      // 1) 优先吃缓存 (非强刷)
      if (!forceFresh) {
        const cached = await scanner.loadCached();
        if (cached) {
          const idx = new LalIndex(cached);
          game.modules.get(MODULE_ID).api.index = idx;
          ui.notifications.info(`已从缓存载入 ${cached.length} 个 asset (强刷可点右上角 ⟳)`);
          return;
        }
      }

      // 2) 缓存不命中或强刷 → 全扫
      ui.notifications.info(`正在扫描 ${subpath}/ ... (按 F12 看进度)`);
      const assets = await scanner.scan(m => console.log(`[${MODULE_ID}] ${m}`));
      const idx = new LalIndex(assets);
      game.modules.get(MODULE_ID).api.index = idx;
      ui.notifications.info(`已索引 ${assets.length} 个 asset / ${idx.byCreator.size} 个创作者 / ${idx.byType.size} 种类型`);
      // 3) 落盘缓存
      await scanner.saveCached(assets);
    } catch (e) {
      console.error(`[${MODULE_ID}] 扫描失败:`, e);
      ui.notifications.error(`扫描失败: ${e.message}`);
    } finally {
      _autoScanInProgress = false;
      if (this.rendered) this.render(false);
    }
  }

  async _render(force, options) {
    let focusState = null;
    if (this.element && this.element.length) {
      const $s = this.element.find(".lal-search");
      const el = $s[0];
      if (el && el === document.activeElement) {
        focusState = { start: el.selectionStart, end: el.selectionEnd };
      }
    }
    await super._render(force, options);
    if (focusState && this.element) {
      const newEl = this.element.find(".lal-search")[0];
      if (newEl) {
        newEl.focus();
        try { newEl.setSelectionRange(focusState.start, focusState.end); } catch {}
      }
    }
  }

  async close(options) {
    document.getElementById("lal-audio-preview")?.remove();
    // 清掉 singleton 引用,下次 openBrowser 拿到全新实例(不带 stale filter/page/select 状态)
    if (LalBrowser._instance === this) LalBrowser._instance = null;
    return super.close(options);
  }

  getData() {
    if (!this.index) {
      if (!_autoScanInProgress) this._autoScan();
      return { isScanning: true, assets: [], types: [], creators: [],
               total: 0, page: 0, pageStart: 0, pageEnd: 0, totalPages: 1,
               sortMode: this.sortMode, selectMode: false, selectedCount: 0,
               tileSize: game.settings.get(MODULE_ID, "tileSize") };
    }
    // filterType 空字符串 → null (不要 Number("") = 0 误当成 type 0 过滤)
    const typeFilter = (this.filterType && this.filterType !== "")
      ? [Number(this.filterType)] : null;
    const results = this.index.search({
      query: this.searchQuery,
      types: typeFilter,
      creators: this.filterCreator ? [this.filterCreator] : null,
      packs: this.filterPack ? [this.filterPack] : null,
      folderPrefix: this.filterFolder || null,
      favoritesOnly: this.favoritesOnly,
      favorites: this.favorites,
      sort: this.sortMode,
    });

    // 计算当前 creator+pack 下的 subfolders 列表 (folder navigation)
    let subFolders = [];
    if (this.filterCreator && this.filterPack) {
      subFolders = this.index.getFoldersForPack(this.filterCreator, this.filterPack);
    }
    // pack 选项: 当前 creator 下有内容的 pack
    let packOptions = [];
    if (this.filterCreator) {
      const seen = new Map();
      for (const a of this.index.assets) {
        if (a.pack?.creator !== this.filterCreator) continue;
        const pn = a.pack?.name;
        if (!pn) continue;
        seen.set(pn, (seen.get(pn) || 0) + 1);
      }
      packOptions = [...seen.entries()].sort((a, b) => a[0].localeCompare(b[0]))
        .map(([name, count]) => ({ name, count, selected: name === this.filterPack }));
    }
    const pageStart = this.page * this.pageSize;
    const pageEnd = Math.min(pageStart + this.pageSize, results.length);
    const pageAssets = results.slice(pageStart, pageEnd);
    const totalPages = Math.max(1, Math.ceil(results.length / this.pageSize));

    return {
      total: results.length, page: this.page + 1, totalPages,
      pageStart: pageStart + 1, pageEnd,
      searchQuery: this.searchQuery, filterType: this.filterType,
      filterCreator: this.filterCreator, filterPack: this.filterPack, filterFolder: this.filterFolder,
      sortMode: this.sortMode,
      selectMode: this.selectMode,
      selectedCount: this.selectedIds.size,
      favoritesOnly: this.favoritesOnly,
      favoritesCount: this.favorites.size,
      packs: packOptions,
      subFolders: subFolders.map(f => ({ name: f, selected: f === this.filterFolder })),
      tileSize: game.settings.get(MODULE_ID, "tileSize"),
      sortOptions: [
        { id: "name-asc", label: "名字 A→Z", selected: this.sortMode === "name-asc" },
        { id: "name-desc", label: "名字 Z→A", selected: this.sortMode === "name-desc" },
        { id: "size-desc", label: "大小 大→小", selected: this.sortMode === "size-desc" },
        { id: "size-asc", label: "大小 小→大", selected: this.sortMode === "size-asc" },
        { id: "pack", label: "按合集", selected: this.sortMode === "pack" },
      ],
      assets: pageAssets.map(a => {
        const tid = a._type ?? a.type;
        const isImage = tid === 3 || tid === 2;
        const isAnimated = isVideoUrl(a._localPath || "");
        const idStr = String(a._id);
        return {
          id: a._id,
          filepath: a.filepath,
          // 优先 metadata name (MAD 的 scene 名字带漂亮标点),
          // 其次文件名 (无 ext), 都没就用 filepath
          baseName: a.name
            || a.filepath?.split("/").pop()?.replace(/\.[^.]+$/, "")
            || a.filepath
            || "(未命名)",
          pack: a.pack?.name || "",
          creator: a.pack?.creator || "",
          typeId: tid,
          typeName: AT_NAMES_CN[tid] || `T${tid}`,
          url: a._localPath,
          packPath: a._packPath,
          mainColor: a.main_color ? `#${a.main_color.substring(0, 6)}` : "#444",
          sizeText: a.size ? `${a.size.width}×${a.size.height}` : "",
          filesizeKb: a.filesize ? Math.round(a.filesize / 1024) : 0,
          imgW: a.size?.width || 0,
          imgH: a.size?.height || 0,
          isImage,
          isAnimated,
          isSelected: this.selectedIds.has(idStr),
          isFavorite: this.favorites.has(idStr),
          // grid 缩略图 URL: 优先 _thumbLocal (server-gen, 需 thumb 已下载),
          // 否则 isImage 时用原图,其他类型 fall back 到 type badge
          thumbUrl: a._thumbLocal || null,
        };
      }),
      types: [...this.index.byType.keys()].sort((a, b) => a - b).map(t => ({
        id: String(t),
        name: AT_NAMES_CN[t] || `Type ${t}`,
        count: this.index.byType.get(t).length,
        selected: String(t) === this.filterType,
      })),
      creators: [...this.index.byCreator.keys()].sort().map(c => ({
        name: c, count: this.index.byCreator.get(c).length,
        selected: c === this.filterCreator,
      })),
    };
  }

  activateListeners(html) {
    super.activateListeners(html);
    const safe = (fn) => (...a) => { try { fn(...a); } catch (e) { console.error(`[${MODULE_ID}] listener error:`, e); } };

    // 给根 element 加 size class 控制卡片尺寸
    const root = this.element?.[0];
    if (root) {
      root.classList.remove("lal-size-small", "lal-size-medium", "lal-size-large");
      root.classList.add(`lal-size-${game.settings.get(MODULE_ID, "tileSize")}`);
    }

    html.find(".lal-search, .lal-filter-type, .lal-filter-creator, .lal-filter-pack, .lal-filter-folder, .lal-filter-sort, .lal-page-prev, .lal-page-next, .lal-scan, .lal-toggle-select, .lal-bulk-import, .lal-clear-select, .lal-action-import, .lal-action-clipboard, .lal-action-preview, .lal-action-favorite, .lal-toggle-favorites, .lal-tile-checkbox").off();

    html.find(".lal-search").on("input", debounce(ev => {
      this.searchQuery = ev.target.value; this.page = 0; this.render();
    }, 300));
    html.find(".lal-filter-type").on("change", safe(ev => {
      this.filterType = ev.target.value; this.page = 0; this.render();
    }));
    html.find(".lal-filter-creator").on("change", safe(ev => {
      this.filterCreator = ev.target.value;
      this.filterPack = "";   // 换 creator 清 pack/folder
      this.filterFolder = "";
      this.page = 0; this.render();
    }));
    html.find(".lal-filter-pack").on("change", safe(ev => {
      this.filterPack = ev.target.value; this.filterFolder = "";
      this.page = 0; this.render();
    }));
    html.find(".lal-filter-folder").on("change", safe(ev => {
      this.filterFolder = ev.target.value; this.page = 0; this.render();
    }));
    html.find(".lal-toggle-favorites").on("click", safe(() => {
      this.favoritesOnly = !this.favoritesOnly; this.page = 0; this.render();
    }));
    html.find(".lal-action-favorite").on("click", safe(async (ev) => {
      ev.stopPropagation();
      const tile = ev.currentTarget.closest(".lal-tile");
      const id = String(tile?.dataset.id ?? "");
      if (this.favorites.has(id)) this.favorites.delete(id);
      else this.favorites.add(id);
      await this._saveFavorites();
      this.render();
    }));
    html.find(".lal-filter-sort").on("change", safe(ev => {
      this.sortMode = ev.target.value; this.page = 0; this.render();
    }));
    html.find(".lal-page-prev").on("click", safe(() => { if (this.page > 0) { this.page--; this.render(); } }));
    html.find(".lal-page-next").on("click", safe(() => { this.page++; this.render(); }));

    // 多选切换
    html.find(".lal-toggle-select").on("click", safe(() => {
      this.selectMode = !this.selectMode;
      if (!this.selectMode) this.selectedIds.clear();
      this.render();
    }));
    html.find(".lal-clear-select").on("click", safe(() => {
      this.selectedIds.clear();
      this.render();
    }));
    html.find(".lal-tile-checkbox").on("change", safe(ev => {
      const id = String(ev.target.dataset.id ?? "");
      if (ev.target.checked) this.selectedIds.add(id);
      else this.selectedIds.delete(id);
      // 局部更新 selected count, 不全 render (避免失焦)
      const cnt = this.selectedIds.size;
      this.element?.find(".lal-selected-count")?.text(cnt);
    }));
    html.find(".lal-bulk-import").on("click", async (ev) => {
      if (this.selectedIds.size === 0) {
        ui.notifications.warn("还没勾选任何素材");
        return;
      }
      const $b = $(ev.currentTarget); $b.prop("disabled", true);
      const ids = [...this.selectedIds];
      ui.notifications.info(`开始批量导入 ${ids.length} 个素材...`);
      let ok = 0, fail = 0;
      for (const id of ids) {
        const asset = this.index.assets.find(a => String(a._id) === id);
        if (!asset) { fail++; continue; }
        try {
          await importAsset(asset, null);
          ok++;
        } catch (e) {
          console.error(`[${MODULE_ID}] 批量导入失败 ${id}:`, e);
          fail++;
        }
      }
      ui.notifications.info(`批量完成: 成功 ${ok} / 失败 ${fail}`);
      this.selectedIds.clear();
      this.selectMode = false;
      $b.prop("disabled", false);
      this.render();
    });

    html.find(".lal-scan").on("click", async (ev) => {
      if (_autoScanInProgress) return;
      const $b = $(ev.currentTarget); $b.prop("disabled", true);
      try {
        // 重扫时清掉旧 selection (旧 ids 对新 index 是孤儿)
        this.selectedIds.clear();
        this.selectMode = false;
        game.modules.get(MODULE_ID).api.index = null;
        await this._autoScan(true);
      } catch (e) {
        console.error(e); ui.notifications.error(`扫描出错: ${e.message}`);
      } finally { $b.prop("disabled", false); this.render(); }
    });

    html.find(".lal-action-import").on("click", safe(async (ev) => {
      const tile = ev.currentTarget.closest(".lal-tile");
      const assetId = String(tile?.dataset.id ?? "");
      const asset = this.index.assets.find(a => String(a._id) === assetId);
      if (asset) await importAsset(asset, null);
      else console.warn(`[${MODULE_ID}] 找不到 asset ${assetId}`);
    }));
    html.find(".lal-action-clipboard").on("click", safe(async (ev) => {
      const tile = ev.currentTarget.closest(".lal-tile");
      const url = tile?.dataset.url;
      if (url) {
        await navigator.clipboard?.writeText?.(url);
        ui.notifications.info(`已复制路径: ${url}`);
      }
    }));
    html.find(".lal-action-preview").on("click", safe((ev) => {
      const tile = ev.currentTarget.closest(".lal-tile");
      const url = tile?.dataset.url;
      const tid = Number(tile?.dataset.type);
      if (!url) return;
      if (tid === 7) {
        let audioEl = document.getElementById("lal-audio-preview");
        if (!audioEl) {
          audioEl = document.createElement("audio");
          audioEl.id = "lal-audio-preview";
          document.body.appendChild(audioEl);
        }
        if (audioEl.src === new URL(url, location.href).href && !audioEl.paused) {
          audioEl.pause();
          ui.notifications.info("音频已停止");
        } else {
          audioEl.src = url;
          audioEl.volume = Number(game.settings.get(MODULE_ID, "audioVolume"));
          audioEl.play();
          ui.notifications.info("音频播放中");
        }
      } else if (tid === 3 || tid === 2) {
        new ImagePopout(url, { title: tile?.dataset.name || "预览" }).render(true);
      } else {
        ui.notifications.warn(`类型 ${tid} 暂不支持预览`);
      }
    }));

    html.find(".lal-tile[draggable=true]").each((i, el) => {
      el.addEventListener("dragstart", safe((ev) => {
        const url = el.dataset.url;
        const typeId = Number(el.dataset.type);
        const payload = {
          type: "local-asset-library",
          assetType: typeId,
          url, packPath: el.dataset.packPath || "",
          imgW: Number(el.dataset.w) || 0,
          imgH: Number(el.dataset.h) || 0,
          assetId: String(el.dataset.id ?? ""),
        };
        ev.dataTransfer.effectAllowed = "copy";
        ev.dataTransfer.setData("text/plain", JSON.stringify(payload));
        console.log(`[${MODULE_ID}] dragstart`, payload);
      }));
    });
  }
}

// ---------- 注册 ----------
Hooks.once("init", () => {
  console.log(`${MODULE_ID} | init`);

  game.settings.register(MODULE_ID, "rootSubpath", {
    name: "素材库根路径",
    hint: "你的素材库文件夹相对 Foundry dataPath 的子路径,例如 assets / library / vault 等任意子目录名.",
    scope: "world", config: true, type: String, default: "assets",
  });
  game.settings.register(MODULE_ID, "useFolders", {
    name: "自动按层级建文件夹",
    hint: "导入时按 素材库/<创作者>/<合集>/ 建文件夹归类",
    scope: "world", config: true, type: Boolean, default: true,
  });
  game.settings.register(MODULE_ID, "genThumbnails", {
    name: "导入场景时生成缩略图",
    hint: "用最大 tile 或 background.src 生成预览图",
    scope: "world", config: true, type: Boolean, default: true,
  });
  game.settings.register(MODULE_ID, "autoOpenSheet", {
    name: "导入后自动打开 Sheet",
    hint: "Actor/Item/Journal 导入完后立刻打开编辑窗口",
    scope: "world", config: true, type: Boolean, default: false,
  });
  game.settings.register(MODULE_ID, "audioChannel", {
    name: "导入音频默认 channel",
    scope: "world", config: true, type: String, default: "environment",
    choices: { music: "Music 音乐", environment: "Environment 环境", interface: "Interface 界面" },
  });
  game.settings.register(MODULE_ID, "audioVolume", {
    name: "导入音频默认音量",
    scope: "world", config: true, type: Number, default: 0.8, range: { min: 0, max: 1, step: 0.05 },
  });
  game.settings.register(MODULE_ID, "tileSize", {
    name: "卡片尺寸",
    hint: "浏览器里每张资产卡的大小",
    scope: "client", config: true, type: String, default: "medium",
    choices: { small: "小 (100px)", medium: "中 (150px)", large: "大 (220px)" },
    onChange: () => LalBrowser._instance?.render?.(false),
  });
  game.settings.register(MODULE_ID, "enablePlayers", {
    name: "允许玩家浏览",
    hint: "开启后非 GM 也能打开浏览器查看素材 (但仍只有 GM 能导入)",
    scope: "world", config: true, type: Boolean, default: false,
  });
  game.settings.register(MODULE_ID, "skipBlankScenes", {
    name: "跳过空/墙线-only scene",
    hint: "MAD 等内容包带很多旧版墙线包 (有墙无图) + 占位模板. 默认跳过. 关掉的话仍可手动 import.",
    scope: "world", config: true, type: Boolean, default: true,
  });
  game.settings.register(MODULE_ID, "dropImageAs", {
    name: "图片拖到画布时建为",
    hint: "Tile=贴图, Note=日志 pin, Token=演员 token (会弹选 actor 类型对话框)",
    scope: "client", config: true, type: String, default: "tile",
    choices: { tile: "Tile (贴图)", note: "Note (日志 pin)", token: "Token (演员)" },
  });
  game.settings.register(MODULE_ID, "snapToGrid", {
    name: "拖拽放置时对齐格子",
    hint: "Tile/Note/Token 放置时把中心点 snap 到 scene 网格",
    scope: "client", config: true, type: Boolean, default: true,
  });
  game.settings.register(MODULE_ID, "favorites", {
    name: "(internal) 收藏的 asset id 列表",
    scope: "client", config: false, type: Array, default: [],
  });

  const mod = game.modules.get(MODULE_ID);
  mod.api = {
    index: null,
    openBrowser: () => {
      const inst = LalBrowser.getInstance();
      inst.render(true);
      return inst;
    },
    rescan: async () => {
      const subpath = game.settings.get(MODULE_ID, "rootSubpath");
      const scanner = new LalScanner(subpath);
      const assets = await scanner.scan();
      mod.api.index = new LalIndex(assets);
      return mod.api.index;
    },
    importAsset,
    classes: { LalScanner, LalIndex, LalBrowser },
  };
});

function _userCanBrowse() {
  if (game.user?.isGM) return true;
  return !!game.settings.get(MODULE_ID, "enablePlayers");
}

Hooks.on("getSceneControlButtons", (controls) => {
  if (!_userCanBrowse()) return;
  const tilesControl = Array.isArray(controls)
    ? controls.find(c => c.name === "tiles")
    : (controls.tiles || controls.tile);
  if (!tilesControl) return;
  const button = {
    name: "localAssetLibrary",
    title: "本地素材库",
    icon: "fas fa-photo-film",
    button: true, visible: true,
    onChange: () => game.modules.get(MODULE_ID).api.openBrowser(),
  };
  if (Array.isArray(tilesControl.tools)) {
    tilesControl.tools.push(button);
  } else if (tilesControl.tools && typeof tilesControl.tools === "object") {
    tilesControl.tools.localAssetLibrary = button;
  }
});

Hooks.on("renderJournalDirectory", (app, html) => {
  if (!_userCanBrowse()) return;
  const $html = html instanceof jQuery ? html : $(html);
  if ($html.find(".lal-sidebar-btn").length > 0) return;
  const btn = $(`<button type="button" class="lal-sidebar-btn" style="margin:4px 0;">
    <i class="fas fa-photo-film"></i> 本地素材库
  </button>`);
  btn.on("click", () => game.modules.get(MODULE_ID).api.openBrowser());
  $html.find(".directory-header, header.directory-header").first().after(btn);
});

// 钩子必须 sync 返回 false 阻止默认处理. 把 async 任务 fire-and-forget 跑.
Hooks.on("dropCanvasData", (canvas, data) => {
  if (data?.type !== "local-asset-library") return true;
  console.log(`[${MODULE_ID}] dropCanvasData`, data);

  const idx = game.modules.get(MODULE_ID).api.index;
  if (!idx) {
    ui.notifications.error("索引未建立,请先打开素材库");
    return false;
  }
  const asset = idx.assets.find(a => String(a._id) === String(data.assetId));
  if (!asset) {
    console.warn(`[${MODULE_ID}] 找不到 asset ${data.assetId}`);
    return false;
  }
  // 异步导入, 但 hook 立即返回 false 阻止默认行为
  importAsset(asset, { x: data.x, y: data.y }).catch(e => {
    console.error(`[${MODULE_ID}] 导入失败:`, e);
    ui.notifications.error(`导入失败: ${e.message}`);
  });
  return false;
});

// ---------- Sidebar drop hooks ----------

/** Item → Actor sheet 加 inventory */
Hooks.on("dropActorSheetData", (actor, sheet, data) => {
  if (data?.type !== "local-asset-library") return true;
  const idx = game.modules.get(MODULE_ID).api.index;
  const asset = idx?.assets.find(a => String(a._id) === String(data.assetId));
  if (!asset || (asset._type ?? asset.type) !== 6) return true;
  addItemToActor(asset, actor).catch(e => {
    console.error(`[${MODULE_ID}] item→actor 失败:`, e);
    ui.notifications.error(`加 item 到 ${actor.name} 失败: ${e.message}`);
  });
  return false;
});

/** Audio → Playlist 侧栏 = 加入指定 playlist (拖到 playlist 条目上) */
Hooks.on("renderPlaylistDirectory", (app, html) => {
  const $html = html instanceof jQuery ? html : $(html);
  // 用 namespaced off 防 listener 叠加
  $html.off("drop.lal").on("drop.lal", ".directory-item", (ev) => {
    const dt = ev.originalEvent?.dataTransfer;
    if (!dt) return;
    let data; try { data = JSON.parse(dt.getData("text/plain")); } catch { return; }
    if (data?.type !== "local-asset-library") return;
    const idx = game.modules.get(MODULE_ID).api.index;
    const asset = idx?.assets.find(a => String(a._id) === String(data.assetId));
    if (!asset || (asset._type ?? asset.type) !== 7) return;
    const playlistId = ev.currentTarget.dataset.entryId || ev.currentTarget.dataset.documentId;
    if (!playlistId) return;
    ev.preventDefault(); ev.stopPropagation();
    addAudioToSpecificPlaylist(asset, playlistId).catch(e => {
      console.error(e); ui.notifications.error(`加入 playlist 失败: ${e.message}`);
    });
  });
});

/** 图/地图 → Scene 侧栏 = 用此图建新 Scene */
Hooks.on("renderSceneDirectory", (app, html) => {
  const $html = html instanceof jQuery ? html : $(html);
  $html.off("drop.lal").on("drop.lal", (ev) => {
    const dt = ev.originalEvent?.dataTransfer;
    if (!dt) return;
    let data; try { data = JSON.parse(dt.getData("text/plain")); } catch { return; }
    if (data?.type !== "local-asset-library") return;
    const idx = game.modules.get(MODULE_ID).api.index;
    const asset = idx?.assets.find(a => String(a._id) === String(data.assetId));
    if (!asset) return;
    const at = asset._type ?? asset.type;
    if (at !== 3 && at !== 2) return;
    ev.preventDefault(); ev.stopPropagation();
    createSceneFromImage(asset).catch(e => {
      console.error(e); ui.notifications.error(`建 Scene 失败: ${e.message}`);
    });
  });
});

Hooks.once("ready", () => {
  console.log(`${MODULE_ID} | ready. 可在控制台调 game.modules.get("${MODULE_ID}").api.openBrowser()`);
});
