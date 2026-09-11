import type {
  DiffBlockLabels,
  JsonTreeLabels,
  MarkdownLabels,
  ReadBlockLabels,
  SearchBlockLabels,
  TerminalBlockLabels,
  WebBlockLabels,
} from '../src/index.ts'

export const markdownLabels: MarkdownLabels = {
  code: { copyLabel: '復制', copiedLabel: '復制成功' },
  footnotes: 'Footnotes',
}

export const diffBlockLabels: DiffBlockLabels = {
  copy: '復制', copied: '復制成功', collapseAria: '收起差異',
  expandAria: hidden => `展開其余 ${hidden} 行差異`,
  collapse: '收起', expand: hidden => `… 其余 ${hidden} 行`,
  files: count => `${count} ${count === 1 ? 'file' : 'files'}`,
}

export const readBlockLabels: ReadBlockLabels = {
  window: (shown, total) => `顯示 ${shown} / ${total} 行`,
  copy: '復制', copied: '復制成功', collapseAria: '收起內容',
  expandAria: hidden => `展開其余 ${hidden} 行`,
  collapse: '收起', expand: hidden => `… 其余 ${hidden} 行`,
}

export const searchBlockLabels: SearchBlockLabels = {
  pathsSummary: (shown, total, truncated) => truncated
    ? `顯示 ${shown} / 共 ${total} 個路徑`
    : `${shown} 個路徑`,
  matchesSummary: (shown, total, files, truncated) => truncated
    ? `顯示 ${shown} / 共 ${total} 處匹配 · ${files} 個文件`
    : `${shown} 處匹配 · ${files} 個文件`,
  copy: '復制', copied: '復制成功', noResults: '無結果',
  collapseAria: '收起結果',
  expandAria: hidden => `展開其余 ${hidden} 行結果`,
  collapse: '收起', expand: hidden => `… 其余 ${hidden} 行`,
}

export const terminalBlockLabels: TerminalBlockLabels = {
  signal: signal => `信號 ${signal}`,
  exitCode: code => `退出碼 ${code}`,
  running: '運行中', failed: '失敗', done: '已完成',
  copy: '復制', copied: '復制成功', noOutput: '無輸出',
  collapseAria: '收起輸出', collapse: '收起',
  expandAria: hidden => `展開其余 ${hidden} 行輸出`,
  expand: hidden => `… 其余 ${hidden} 行`,
}

export const jsonTreeLabels: JsonTreeLabels = {
  copyValue: 'Copy value', copyJson: 'Copy JSON', copyPath: 'Copy property path',
  copyPrettyJson: 'Copy pretty JSON', copyCompactJson: 'Copy compact JSON',
  copied: 'Copied', copyFailed: 'Copy failed',
  collapseNode: 'Collapse JSON node', expandNode: 'Expand JSON node',
  copyButtonTitle: action => `${action}; right-click for copy options`,
}

export const webBlockLabels: WebBlockLabels = {
  noResults: '未找到結果', sourcesTruncated: '來源列表已截斷',
  http: 'HTTP', contentTruncated: '內容已截斷', markdown: markdownLabels,
}
