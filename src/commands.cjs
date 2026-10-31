const { commandScript, compactScript } = require('./player.cjs');
const { setTimeout: delay } = require('node:timers/promises');
async function runCommand(win, action, seconds) {
  const result = await win.webContents.executeJavaScript(commandScript(action, seconds), true);
  if (!result?.ok || !['previous', 'next'].includes(action)) return result;
  try {
    // A global Ctrl+Down binding maps to an unmodified Down in this page only.
    const debuggerClient = win.webContents.debugger;
    if (debuggerClient.isAttached()) return { ok: false, message: '此窗口正在调试，请结束调试后重试切换' };
    debuggerClient.attach('1.3');
    try {
      await debuggerClient.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true });
      const up = action === 'previous';
      const key = { key: up ? 'ArrowUp' : 'ArrowDown', code: up ? 'ArrowUp' : 'ArrowDown', windowsVirtualKeyCode: up ? 38 : 40, nativeVirtualKeyCode: up ? 38 : 40, modifiers: 0 };
      await debuggerClient.sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', ...key });
      await debuggerClient.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', ...key });
    } finally {
      if (!win.isDestroyed() && debuggerClient.isAttached()) {
        try { await debuggerClient.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: false }); }
        finally { debuggerClient.detach(); }
      }
    }
    await delay(250);
    return { ok: true, message: action === 'previous' ? '已发送上一条操作' : '已发送下一条操作' };
  } finally {
    if (result.restoreCompact && !win.isDestroyed()) await win.webContents.executeJavaScript(compactScript(true));
  }
}
module.exports = { runCommand };
