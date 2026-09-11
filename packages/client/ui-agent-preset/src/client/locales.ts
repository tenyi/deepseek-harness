/** Locale bundles for the agent-preset hero chip, header label, and management section. */

/** Locale keys these surfaces render. */
export type AgentPresetSettingsKey =
  | 'error' | 'userTrust' | 'seatHint' | 'headerHint'
  | 'nav' | 'sectionIntro' | 'builtIn' | 'setDefault' | 'view'
  | 'presetStandardName' | 'presetStandardDescription'
  | 'presetPtcName' | 'presetPtcDescription'
  | 'presetMinimalName' | 'presetMinimalDescription'
  | 'presetCordisName' | 'presetCordisDescription'
  | 'duplicate' | 'duplicateUnavailable' | 'delete' | 'presetId' | 'presetIdPlaceholder' | 'copyOf'
  | 'displayName' | 'displayNamePlaceholder'
  | 'inUse' | 'selectionOffDefault' | 'noDescription' | 'builtInGroup' | 'customGroup'
  | 'brokenBadge' | 'brokenNoCopy' | 'switchRefused'
  | 'composition' | 'cancel' | 'close' | 'retry'
  | 'copyTitle' | 'copyIntro' | 'create' | 'creating' | 'creatorDraft'
  | 'openLocation' | 'showLocation' | 'revealedPathLabel'
  | 'idRequired' | 'idInvalid' | 'idTaken'
  | 'deleteTitle' | 'deleteDescription' | 'deleteConfirm' | 'deleting'
  | 'showPicker' | 'showPickerBeta' | 'showPickerDescription'
  | 'enablePickerToSetDefault' | 'enablePickerToCreate'

/** English copy. */
export const en: Record<AgentPresetSettingsKey, string> = {
  error: 'Could not load agent presets.',
  userTrust: 'Custom',
  seatHint: 'Agent preset for the session you are about to start',
  headerHint: 'The agent preset this session runs, fixed when it started',
  nav: 'Agent presets',
  sectionIntro:
    'A preset is the plugin composition one session\'s agent runs — its tools, prompt, and capabilities. '
    + 'Duplicate an existing one and make it yours, or let the agent draft one for you in Creator mode.',
  builtIn: 'Built-in',
  setDefault: 'Set as default',
  view: 'View',
  presetStandardName: 'Standard mode',
  presetStandardDescription:
    'Full coding agent with file editing, shell, file and web search, skills, planning, goals, subagents, and workflows.',
  presetPtcName: 'PTC mode',
  presetPtcDescription:
    'Full coding agent without the workflow tool; other tools are exposed through the PTC mode SDK so the model can combine multi-step operations in one TypeScript program.',
  presetMinimalName: 'Minimal mode',
  presetMinimalDescription:
    'Single-tool coding agent with a persistent shell.',
  presetCordisName: 'Creator mode',
  presetCordisDescription:
    'Built for creating custom agent presets, with all Standard mode capabilities plus runtime inspection, plugin experiments, and preset-authoring guidance.',
  duplicate: 'Duplicate',
  duplicateUnavailable: 'This deployment has no writable preset directory',
  delete: 'Delete',
  presetId: 'Identifier',
  presetIdPlaceholder: 'my-agent',
  displayName: 'Name',
  displayNamePlaceholder: 'Shown in the picker; defaults to the identifier',
  inUse: 'New task default',
  selectionOffDefault: 'Default',
  builtInGroup: 'Built-in',
  customGroup: 'Custom',
  noDescription: 'No description.',
  brokenBadge: 'Failed to load',
  brokenNoCopy: 'A preset that failed to load cannot be duplicated',
  switchRefused: 'Could not switch to {name}: {reason}',
  copyOf: 'Copied from',
  composition: 'Composition (agent.cordis.yml)',
  cancel: 'Cancel',
  close: 'Close',
  retry: 'Retry',
  copyTitle: 'Duplicate preset',
  copyIntro:
    'The whole preset is copied on this machine. The identifier becomes its directory name and cannot '
    + 'be changed later; everything else is edited in the preset\'s own files.',
  create: 'Create',
  creating: 'Creating…',
  creatorDraft: 'Draft a custom preset with Creator mode',
  openLocation: 'Open folder',
  showLocation: 'Show location',
  revealedPathLabel: 'Preset files:',
  idRequired: 'Give the preset an identifier.',
  idInvalid: 'Use lowercase letters, digits, and hyphens, starting with a letter or digit.',
  idTaken: 'A preset with this identifier already exists.',
  deleteTitle: 'Delete this preset?',
  deleteDescription:
    'The preset directory is deleted. Sessions already running on it keep working; new sessions cannot select it.',
  deleteConfirm: 'Delete',
  deleting: 'Deleting…',
  showPicker: 'Allow switching Agent modes',
  showPickerBeta: 'Beta',
  showPickerDescription:
    'When enabled, new tasks can choose Standard, PTC, Creator, Minimal, and custom modes. When disabled, all new tasks use the default mode (Standard by default; configurable). Only affects new tasks.',
  enablePickerToSetDefault: 'Turn on Agent mode selection to choose a default',
  enablePickerToCreate: 'Turn on Agent mode selection to start Creator mode',
}

/** Simplified Chinese copy. */
export const zh: Record<AgentPresetSettingsKey, string> = {
  error: '無法加載 Agent 預設。',
  userTrust: '自定義',
  seatHint: '即將開始的這個會話所用的 Agent 預設',
  headerHint: '本會話運行的 Agent 預設，開始時即固定',
  nav: 'Agent 預設',
  sectionIntro: '預設即一個會話的 Agent 所運行的插件組裝 —— 它的工具、提示詞與能力。復制一份既有預設改成自己的，或用「創造模式」讓 Agent 幫你創建。',
  builtIn: '內置',
  setDefault: '設為默認',
  view: '查看',
  presetStandardName: '標準模式',
  presetStandardDescription: '功能完整的編碼 Agent，支持文件編輯、Shell、文件與網頁檢索、Skills、計劃、目標、子代理和工作流。',
  presetPtcName: 'PTC 模式',
  presetPtcDescription: '功能完整的編碼 Agent，但默認不提供 workflow 工具；其他工具通過 PTC 模式 SDK 呈現，讓模型用一個 TypeScript 程序組合多步操作。',
  presetMinimalName: '極簡模式',
  presetMinimalDescription: '僅提供持久 shell 的單工具編碼 Agent。',
  presetCordisName: '創造模式',
  presetCordisDescription: '用于創建自定義 Agent preset：具備標準模式的全部能力，并提供運行時檢查、插件實驗和 preset 創作指導。',
  duplicate: '復制',
  duplicateUnavailable: '此部署未配置可寫的預設目錄',
  delete: '刪除',
  presetId: '標識符',
  presetIdPlaceholder: 'my-agent',
  displayName: '名稱',
  displayNamePlaceholder: '選擇器中顯示的名字，缺省用標識符',
  inUse: '新任務默認',
  selectionOffDefault: '默認',
  builtInGroup: '內置',
  customGroup: '自定義',
  noDescription: '暫無描述。',
  brokenBadge: '加載失敗',
  brokenNoCopy: '預設加載失敗，不能復制',
  switchRefused: '無法切換到「{name}」：{reason}',
  copyOf: '復制自',
  composition: '組裝（agent.cordis.yml）',
  cancel: '取消',
  close: '關閉',
  retry: '重試',
  copyTitle: '復制預設',
  copyIntro: '整個預設會在本機復制一份。標識符將成為目錄名，事后無法更改；其余內容之后直接在預設自己的文件里編輯。',
  create: '創建',
  creating: '正在創建…',
  creatorDraft: '用「創造模式」創作自定義預設',
  openLocation: '打開目錄',
  showLocation: '查看路徑',
  revealedPathLabel: '預設文件：',
  idRequired: '請填寫標識符。',
  idInvalid: '只能使用小寫字母、數字與連字符，且以字母或數字開頭。',
  idTaken: '該標識符已被占用。',
  deleteTitle: '刪除該預設？',
  deleteDescription: '預設目錄將被刪除。已在其上運行的會話不受影響；新會話將無法再選擇它。',
  deleteConfirm: '刪除',
  deleting: '正在刪除…',
  showPicker: '允許切換agent模式',
  showPickerBeta: 'beta',
  showPickerDescription: '開啟后，新任務可選擇標準、PTC、創造、極簡及自定義模式；關閉后統一使用默認模式（默認為標準模式，可自定義）。僅影響新任務。',
  enablePickerToSetDefault: '請先開啟 Agent 模式選擇，再設置默認模式',
  enablePickerToCreate: '請先開啟 Agent 模式選擇，再啟動創造模式',
}

// The resolution itself is the shared fold in `dsh-agent-presets/display`,
// re-exported here so every surface in this plugin reads one path; the
// Settings plugin list inlines the same fold over this plugin's dictionaries.
export { presetDisplayText } from '@deepseek-ai/dsh-agent-presets/display'
export type { PresetDisplaySource, PresetDisplayText } from '@deepseek-ai/dsh-agent-presets/display'
