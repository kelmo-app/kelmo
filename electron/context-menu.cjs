'use strict';
// Right-click menu for text fields (Cut / Copy / Paste / Select all). Electron shows none by default,
// so without this only Ctrl+V works in the search box and the address fields.

/** Menu items for a right-click, or [] when there is nothing useful to offer. */
function buildTemplate(params) {
  const flags = params.editFlags || {};
  if (params.isEditable) {
    return [
      { role: 'undo', enabled: !!flags.canUndo },
      { role: 'redo', enabled: !!flags.canRedo },
      { type: 'separator' },
      { role: 'cut', enabled: !!flags.canCut },
      { role: 'copy', enabled: !!flags.canCopy },
      { role: 'paste', enabled: !!flags.canPaste },
      { type: 'separator' },
      { role: 'selectAll', enabled: !!flags.canSelectAll },
    ];
  }
  if (params.selectionText) return [{ role: 'copy' }, { type: 'separator' }, { role: 'selectAll' }];
  return [];
}

/** Call once at startup: every window (main and popups) gets the menu. */
function installContextMenu(app, Menu) {
  app.on('web-contents-created', (_e, contents) => {
    contents.on('context-menu', (_ev, params) => {
      const template = buildTemplate(params);
      if (template.length) Menu.buildFromTemplate(template).popup();
    });
  });
}

module.exports = { buildTemplate, installContextMenu };
