/** `settings.permission` namespace dictionaries (the Permission row's copy). */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'title': '權限',
  'description': '選擇新會話的默認權限模式',
  'loading': '加載中',
  'unavailable': '不可用',
  'preset.readOnly': '僅可查看',
  'preset.workspaceWrite': '工作區內修改',
  'preset.fullAccess': '完全權限',
  'confirm.title': '確認啟用完全權限？',
  'confirm.description': '啟用完全權限后，新會話將減少確認步驟，并且可以直接執行更多操作，包括敏感操作、文件修改或外部命令。僅建議在你信任后續任務時使用。',
  'confirm.acknowledge': '我已了解風險，并愿意繼續',
  'confirm.cancel': '取消',
  'confirm.enable': '啟用完全權限',
} satisfies Record<string, string>

/** The settings.permission namespace key union. */
export type PermissionSettingsKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'title': 'Permission',
  'description': 'Choose the default permission mode for new sessions',
  'loading': 'Loading',
  'unavailable': 'Unavailable',
  'preset.readOnly': 'Read Only',
  'preset.workspaceWrite': 'Workspace Write',
  'preset.fullAccess': 'Full access',
  'confirm.title': 'Enable Full access?',
  'confirm.description': 'Full access lets new sessions reduce confirmation steps and perform more actions directly, including sensitive operations, file changes, or external commands. Only use it when you trust subsequent tasks.',
  'confirm.acknowledge': 'I understand the risks and want to continue',
  'confirm.cancel': 'Cancel',
  'confirm.enable': 'Enable Full access',
} satisfies Record<PermissionSettingsKey, string>

/** Simplified Chinese dictionary for the current-session popup gate. */
export const accessZh = {
  'preset.readOnly': '僅可查看',
  'preset.workspaceWrite': '工作區內修改',
  'preset.fullAccess': '完全權限',
  'confirm.title': '確認啟用完全權限？',
  'confirm.description': '啟用完全權限后，智能體將減少確認步驟，并且可以直接執行更多操作，包括敏感操作、文件修改或外部命令。僅建議在你信任當前任務時使用。',
  'confirm.acknowledge': '我已了解風險，并愿意繼續',
  'confirm.cancel': '取消',
  'confirm.enable': '啟用完全權限',
} satisfies Record<string, string>

/** Current-session popup-gate key union. */
export type PermissionAccessKey = keyof typeof accessZh

/** English dictionary for the current-session popup gate. */
export const accessEn = {
  'preset.readOnly': 'Read Only',
  'preset.workspaceWrite': 'Workspace Write',
  'preset.fullAccess': 'Full access',
  'confirm.title': 'Enable Full access?',
  'confirm.description': 'Full access reduces confirmation steps and lets the agent perform more actions directly, including sensitive operations, file changes, or external commands. Only use it when you trust the current task.',
  'confirm.acknowledge': 'I understand the risks and want to continue',
  'confirm.cancel': 'Cancel',
  'confirm.enable': 'Enable Full access',
} satisfies Record<PermissionAccessKey, string>
