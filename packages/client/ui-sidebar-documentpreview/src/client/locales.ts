/**
 * `sidebarDocumentPreview` namespace dictionaries.
 *
 * The failure lines are the point of this file: a preview that cannot show a
 * page has to say which of several different things went wrong, and each one
 * suggests a different next step for the reader.
 */

/** Simplified Chinese dictionary and key-set source of truth. */
export const zh = {
  loading: '正在讀取…',
  loadMore: '加載更多',
  changed: '文件已更新，當前顯示為舊內容。',
  reloadNow: '重新載入',
  reload: '重新讀取文件',
  'wrap.enable': '自動換行',
  'wrap.disable': '取消換行',
  'wrap.aria': '自動換行',
  openWith: '打開方式',
  'viewer.text': '純文本',
  resourceUnavailable: '文件資源服務不可用。',
  rendererUnavailable: '預覽器 {name} 不可用。',
  'error.notFound': '文件不存在，可能已被移動或刪除。',
  'error.tooLarge': '單頁內容超過 {limit} 上限，無法讀取。',
  'error.notText': '非文本文件，暫時無法預覽。',
  'error.notRegularFile': '該路徑不是普通文件，沒有可顯示的內容。',
  'error.unavailable': '讀取失敗：{message}',
  retry: '重試',
} satisfies Record<string, string>

/** Text-preview dictionary key union. */
export type SidebarDocumentPreviewKey = keyof typeof zh

/** English dictionary, checked against the Chinese key set. */
export const en = {
  loading: 'Reading…',
  loadMore: 'Load more',
  changed: 'The file has changed, showing the previous content.',
  reloadNow: 'Reload',
  reload: 'Read the file again',
  'wrap.enable': 'Turn on line wrap',
  'wrap.disable': 'Turn off line wrap',
  'wrap.aria': 'Line wrap',
  openWith: 'Open with',
  'viewer.text': 'Plain text',
  resourceUnavailable: 'The file resource service is unavailable.',
  rendererUnavailable: 'The {name} preview is unavailable.',
  'error.notFound': 'File not found. It may have been moved or deleted.',
  'error.tooLarge': 'This page exceeds the {limit} limit and cannot be read.',
  'error.notText': 'Not a text file, preview is unavailable for now.',
  'error.notRegularFile': 'Not a regular file, nothing to display.',
  'error.unavailable': 'Read failed: {message}',
  retry: 'Retry',
} satisfies Record<SidebarDocumentPreviewKey, string>
