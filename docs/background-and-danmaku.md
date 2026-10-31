# 后台方向键与原生弹幕（版本保持 1.0）

用户反馈 Ctrl+Down 后台无法切换；原先改键需要手动保存，磁盘中仍是旧按键，且切换走模拟点击箭头。改为独立 bind IPC 自动保存并立即更新注册，只保存当前按键，不提交其他未保存设置；冲突时回退并显示原因。抖音上下切换通过 Chromium Input.dispatchKeyEvent 发送不带 Ctrl/Alt 的 ArrowUp/ArrowDown，使用页面焦点模拟而不激活系统窗口，并在结束后恢复焦点模拟状态。弹层阻挡仍提示错误，网页登录模式仍暂停视频控制。

已查看真实网页 DOM：B站视频位于 .bpx-player-video-area，原生弹幕位于 .bpx-player-render-dm-wrap；抖音播放器为 .xgplayer 或 .douyin-player，显示弹幕层为 .danmu，.danmakuContainer 是输入控件而非显示层。纯视频模式扩展播放器区域并保留上述原生弹幕节点，不重建弹幕、不修改内容、字体、动画、透明度或弹幕开关。切回网页时移除辅助类。关闭的弹幕层保持关闭。

验证：test/native-controls.cjs 的两个隔离站点结构夹具验证弹幕可见、与视频同尺寸、其他控件隐藏、原生关闭状态及回到网页后清理。实际 Windows 全局 Ctrl+Down 在另一个前台窗口活动时触发，只有后台目标计数变化，前台焦点未改变，网页收到可信且不带 Ctrl 的 ArrowDown，报告保存于 test-artifacts/native-controls-report.json。smoke 验证修改键无需点击保存即可写入设置，原有 10 窗口控制通过。真实游戏和真实网站持续播放仍需实际使用验证，夹具报告不能等同于真实网站完整验证。
