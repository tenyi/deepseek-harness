/** Shell chrome and General-nav dictionaries; feature rows own their copy. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'trigger': '設置',
  'title': '設置',
  'close': '關閉',
  'openDocument': '打開配置文件',
  'openDocument.error': '無法打開配置文件',
  'general.nav': '通用設置',
  'connection.error': '連接異常',
  'connection.retry': '立即重連',
  'connection.connecting': '自動重連中',
  'connection.connected': '連接成功',
  'connection.reconnect': '連接異常，點擊立即重連',
  'connection.restart': '連接中斷，正在自動重試，點擊立即重連',
} satisfies Record<string, string>

/** The settings namespace key union. */
export type SettingsKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'trigger': 'Settings',
  'title': 'Settings',
  'close': 'Close',
  'openDocument': 'Open configuration file',
  'openDocument.error': 'Could not open configuration file',
  'general.nav': 'General',
  'connection.error': 'Disconnected',
  'connection.retry': 'Reconnect now',
  'connection.connecting': 'Reconnecting',
  'connection.connected': 'Connected',
  'connection.reconnect': 'Disconnected, reconnect now',
  'connection.restart': 'Reconnecting automatically, reconnect now',
} satisfies Record<SettingsKey, string>
