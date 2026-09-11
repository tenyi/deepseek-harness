/**
 * `sidebarRight` namespace dictionaries.
 *
 * Everything a user reads in this column is here, including the strings handed
 * to the docking kit — the kit renders no copy of its own, so its whole
 * vocabulary is this package's to own and translate.
 */

/** Simplified Chinese dictionary and key-set source of truth. */
export const zh = {
  'chrome.expand': '打開側邊欄',
  'chrome.expandAria': '打開右側邊欄',
  'chrome.collapse': '收起側邊欄',
  'chrome.collapseAria': '收起右側邊欄',
  'chrome.toFullscreen': '全屏',
  'chrome.exitFullscreen': '退出全屏',
  'dock.emptyPane': '空面板',
  'dock.splitPane': '分欄',
  'dock.splitPaneDisabled': '已達兩格上限',
  'dock.splitPaneNarrow': '欄寬不足，拖寬側邊欄后再分欄',
  'dock.closeTab': '關閉',
  'dock.addTab': '新標簽頁',
  'dock.dockFloat': '收回到側邊欄',
  'dock.closeFloat': '關閉',
  'dock.drop.center': '移到這里',
  'dock.drop.left': '左分欄',
  'dock.drop.right': '右分欄',
  'dock.drop.top': '上分欄',
  'dock.drop.bottom': '下分欄',
  'tab.guide.title': '開始',
  'tab.unavailable': '這類內容還沒有可用的查看方式。',
} satisfies Record<string, string>

/** Right-Sidebar dictionary key union. */
export type SidebarRightKey = keyof typeof zh

/** English dictionary, checked against the Chinese key set. */
export const en = {
  'chrome.expand': 'Open sidebar',
  'chrome.expandAria': 'Open right sidebar',
  'chrome.collapse': 'Collapse sidebar',
  'chrome.collapseAria': 'Collapse right sidebar',
  'chrome.toFullscreen': 'Fullscreen',
  'chrome.exitFullscreen': 'Exit fullscreen',
  'dock.emptyPane': 'Empty pane',
  'dock.splitPane': 'Split',
  'dock.splitPaneDisabled': 'Two panes is the limit',
  'dock.splitPaneNarrow': 'Not enough width to split, widen the sidebar',
  'dock.closeTab': 'Close',
  'dock.addTab': 'New tab',
  'dock.dockFloat': 'Send back to the sidebar',
  'dock.closeFloat': 'Close',
  'dock.drop.center': 'Move here',
  'dock.drop.left': 'Add left split',
  'dock.drop.right': 'Add right split',
  'dock.drop.top': 'Add top split',
  'dock.drop.bottom': 'Add bottom split',
  'tab.guide.title': 'Start',
  'tab.unavailable': 'Nothing here can view this kind of content yet.',
} satisfies Record<SidebarRightKey, string>
