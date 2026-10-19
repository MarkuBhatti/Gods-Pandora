const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
  onNavHistory: (cb) => { const h = (_e, dir) => cb(dir); ipcRenderer.on('nav:history', h); return () => ipcRenderer.removeListener('nav:history', h); },
  storeGet: () => ipcRenderer.invoke('store:get'),
  storeSet: (db) => ipcRenderer.invoke('store:set', db),
  keysList: () => ipcRenderer.invoke('keys:list'),
  keysSet: (provider, value) => ipcRenderer.invoke('keys:set', provider, value),
  pickImages: () => ipcRenderer.invoke('media:pickImages'),
  dataUrl: (file) => ipcRenderer.invoke('media:dataUrl', file),
  saveDataUrl: (dataUrl, name) => ipcRenderer.invoke('media:saveDataUrl', dataUrl, name),
  pickVideo: () => ipcRenderer.invoke('media:pickVideo'),
  importFiles: (paths) => ipcRenderer.invoke('media:import', paths),
  pathForFile: (file) => { try { return webUtils.getPathForFile(file); } catch (_) { return file && file.path; } },
  enhancePrompt: (args) => ipcRenderer.invoke('prompt:enhance', args),
  fileUrl: (file) => ipcRenderer.invoke('media:fileUrl', file),
  concat: (files, aspect) => ipcRenderer.invoke('media:concat', files, aspect),
  pickMedia: () => ipcRenderer.invoke('media:pickMedia'),
  pickAudio: () => ipcRenderer.invoke('media:pickAudio'),
  pickLut: () => ipcRenderer.invoke('media:pickLut'),
  savePhoto: (dataUrl, name) => ipcRenderer.invoke('photo:save', dataUrl, name),
  cut: {
    status: () => ipcRenderer.invoke('cut:status'),
    ensure: () => ipcRenderer.invoke('cut:ensure'),
    autoEdit: (args) => ipcRenderer.invoke('cut:autoEdit', args),
    autoColor: (args) => ipcRenderer.invoke('cut:autoColor', args),
    preview: (args) => ipcRenderer.invoke('cut:preview', args),
    frame: (args) => ipcRenderer.invoke('cut:frame', args),
    jumpCut: (args) => ipcRenderer.invoke('cut:jumpCut', args),
    renderGrade: (args) => ipcRenderer.invoke('cut:renderGrade', args),
    saveCube: (cube, name) => ipcRenderer.invoke('cut:saveCube', cube, name),
    onProgress: (cb) => { const h = (_e, p) => cb(p); ipcRenderer.on('cut:progress', h); return () => ipcRenderer.removeListener('cut:progress', h); },
  },
  jutsu: {
    trainSoul: (args) => ipcRenderer.invoke('soul:train', args),
    genjutsu: (args) => ipcRenderer.invoke('genjutsu:run', args),
    presets: () => ipcRenderer.invoke('genjutsu:presets'),
    analyzeAd: (args) => ipcRenderer.invoke('ad:analyze', args),
    listLocalLLMs: (baseUrl) => ipcRenderer.invoke('ad:listLocal', baseUrl),
    hardware: () => ipcRenderer.invoke('engine:hardware'),
    onProgress: (cb) => {
      const h = (_e, p) => cb(p);
      ipcRenderer.on('jutsu:progress', h);
      return () => ipcRenderer.removeListener('jutsu:progress', h);
    }
  },
  reveal: (file) => ipcRenderer.invoke('media:reveal', file),
  generate: (payload) => ipcRenderer.invoke('generate', payload),
  jobs: {
    cancel: (jobId) => ipcRenderer.invoke('job:cancel', jobId),
    cancelAll: () => ipcRenderer.invoke('job:cancelAll'),
    list: () => ipcRenderer.invoke('job:list'),
  },
  claude: (args) => ipcRenderer.invoke('claude:complete', args),
  stt: {
    status: () => ipcRenderer.invoke('stt:status'),
    transcribe: (opts) => ipcRenderer.invoke('stt:transcribe', opts),
    warm: (model) => ipcRenderer.invoke('stt:warm', model),
    onStatus: (cb) => { const h = (_e, m) => cb(m); ipcRenderer.on('stt:status', h); return () => ipcRenderer.removeListener('stt:status', h); },
  },
  wake: {
    start: (opts) => ipcRenderer.invoke('wake:start', opts),
    stop: () => ipcRenderer.invoke('wake:stop'),
    report: () => ipcRenderer.invoke('wake:report'),
    act: (args) => ipcRenderer.invoke('voice:do', args),
    log: (m) => ipcRenderer.send('wake:log', m),
    feed: (f32) => ipcRenderer.send('wake:audio', f32),
    onEvent: (cb) => { const h = (_e, m) => cb(m); ipcRenderer.on('wake:event', h); return () => ipcRenderer.removeListener('wake:event', h); },
  },
  connect: {
    status: () => ipcRenderer.invoke('connect:status'),
    configure: (patch) => ipcRenderer.invoke('connect:configure', patch),
    configs: () => ipcRenderer.invoke('connect:configs'),
    addClaude: () => ipcRenderer.invoke('connect:addClaude'),
  },
  agent: {
    run: (args) => ipcRenderer.invoke('agent:run', args),
    approve: (ok, note) => ipcRenderer.invoke('agent:approve', ok, note),
    tell: (text) => ipcRenderer.invoke('agent:tell', text),
    cancel: () => ipcRenderer.invoke('agent:cancel'),
    status: () => ipcRenderer.invoke('agent:status'),
    models: () => ipcRenderer.invoke('agent:models'),
    routes: (opts) => ipcRenderer.invoke('agent:routes', opts),
    open: (p) => ipcRenderer.invoke('agent:open', p),
    onEvent: (cb) => { const h = (_e, p) => cb(p); ipcRenderer.on('agent:event', h); return () => ipcRenderer.removeListener('agent:event', h); },
  },
  llmLocal: (args) => ipcRenderer.invoke('llm:local', args),
  llmLocalModels: () => ipcRenderer.invoke('llm:localModels'),
  resolveSend: (files) => ipcRenderer.invoke('resolve:send', files),
  forge: {
    save: (name, html) => ipcRenderer.invoke('forge:save', name, html),
    list: () => ipcRenderer.invoke('forge:list'),
    read: (file) => ipcRenderer.invoke('forge:read', file)
  },
  systemInfo: () => ipcRenderer.invoke('system:info'),
  engine: {
    status: () => ipcRenderer.invoke('engine:status'),
    install: () => ipcRenderer.invoke('engine:install'),
    start: () => ipcRenderer.invoke('engine:start'),
    stop: () => ipcRenderer.invoke('engine:stop'),
    downloadModel: (repoId, totalBytes) => ipcRenderer.invoke('engine:downloadModel', repoId, totalBytes),
    cancelDownload: (repo) => ipcRenderer.invoke('engine:cancelDownload', repo),
    activeDownloads: () => ipcRenderer.invoke('engine:activeDownloads'),
    deleteModel: (repo) => ipcRenderer.invoke('engine:deleteModel', repo),
    listModels: () => ipcRenderer.invoke('engine:listModels'),
    listModelsDetailed: () => ipcRenderer.invoke('engine:listModelsDetailed'),
    onProgress: (cb) => {
      const h = (_e, p) => cb(p);
      ipcRenderer.on('engine:progress', h);
      return () => ipcRenderer.removeListener('engine:progress', h);
    }
  },
  models: {
    feed: () => ipcRenderer.invoke('models:feed'),
    info: (repo) => ipcRenderer.invoke('models:info', repo),
    checkInstalled: () => ipcRenderer.invoke('models:checkInstalled'),
    openFolder: () => ipcRenderer.invoke('models:openFolder')
  },
  updates: {
    status: () => ipcRenderer.invoke('update:status'),
    check: () => ipcRenderer.invoke('update:check'),
    download: () => ipcRenderer.invoke('update:download'),
    install: () => ipcRenderer.invoke('update:install'),
    setConfig: (patch) => ipcRenderer.invoke('update:setConfig', patch),
    onEvent: (cb) => {
      const h = (_e, p) => cb(p);
      ipcRenderer.on('update:event', h);
      return () => ipcRenderer.removeListener('update:event', h);
    }
  },
  openExternal: (url) => ipcRenderer.invoke('app:openExternal', url),
  installInfo: () => ipcRenderer.invoke('app:installInfo'),
  setLoginItem: (on) => ipcRenderer.invoke('app:setLoginItem', on),
  desktopShortcut: (on) => ipcRenderer.invoke('app:desktopShortcut', on),
  market: {
    hf: (args) => ipcRenderer.invoke('market:hf', args),
    civitai: (args) => ipcRenderer.invoke('market:civitai', args),
    omdb: (args) => ipcRenderer.invoke('market:omdb', args),
    pinokio: (args) => ipcRenderer.invoke('market:pinokio', args),
    pinokioStatus: () => ipcRenderer.invoke('market:pinokioStatus'),
    openPinokio: () => ipcRenderer.invoke('market:openPinokio'),
    pinokioInstall: (repoUrl) => ipcRenderer.invoke('market:pinokioInstall', repoUrl),
    download: (args) => ipcRenderer.invoke('market:download', args),
    files: () => ipcRenderer.invoke('market:files'),
    deleteFile: (file) => ipcRenderer.invoke('market:deleteFile', file),
    ollamaList: () => ipcRenderer.invoke('market:ollamaList'),
    ollamaPull: (args) => ipcRenderer.invoke('market:ollamaPull', args),
    onProgress: (cb) => { const h = (_e, p) => cb(p); ipcRenderer.on('market:progress', h); return () => ipcRenderer.removeListener('market:progress', h); },
  },
  td: {
    connect:          (config)       => ipcRenderer.invoke('td:connect', config),
    disconnect:       ()             => ipcRenderer.invoke('td:disconnect'),
    status:           ()             => ipcRenderer.invoke('td:status'),
    sendOSC:          (addr, val)    => ipcRenderer.invoke('td:sendOSC', addr, val),
    sendParams:       (map)          => ipcRenderer.invoke('td:sendParams', map),
    sendWS:           (obj)          => ipcRenderer.invoke('td:sendWS', obj),
    launch:           (toe, exe)     => ipcRenderer.invoke('td:launch', toe, exe),
    watchOutput:      (folder)       => ipcRenderer.invoke('td:watchOutput', folder),
    pickOutputFolder: ()             => ipcRenderer.invoke('td:pickOutputFolder'),
    onRender: (cb) => {
      const handler = (_event, file) => cb(file);
      ipcRenderer.on('td:render', handler);
      return () => ipcRenderer.removeListener('td:render', handler);
    }
  }
});
