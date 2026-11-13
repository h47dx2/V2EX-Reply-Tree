# V2EX Reply Tree

为 V2EX 帖子提供可折叠的回复树。本仓库包含 iOS Safari 扩展的 Xcode 项目，以及独立的油猴脚本。

## iOS Safari 扩展

扩展识别回复正文开头的 `@用户名` 和可选楼层，将当前页的回复嵌套展示，支持折叠和切换回原始顺序。只有用户名时，父回复是推测的；不同页面之间的回复不会关联。

### 安装

1. 在 Mac 上用 Xcode 打开 `V2EX Reply Tree.xcodeproj`。
2. 在应用和扩展两个 target 的 **Signing & Capabilities** 中选择自己的开发团队。如果 Bundle Identifier 冲突，请为应用设置唯一标识，并将扩展标识设为以应用标识开头，例如添加 `.Extension`。
3. 选择 iPhone 并运行。根据提示在设备上开启开发者模式并完成信任步骤。
4. 在 iPhone 设置中找到 Safari 扩展设置，启用 V2EX Reply Tree 并允许访问 V2EX。
5. 在 Safari 中打开 V2EX 帖子并刷新页面。

项目不是已签名的 IPA，也未发布到 App Store；安装到实体设备需要自行签名。免费开发者账号安装的应用可能需要定期重新签名。更多说明见 [使用说明.md](使用说明.md)。

## 油猴脚本

[userscript/v2ex-reply-tree.user.js](userscript/v2ex-reply-tree.user.js) 是 1.0.0 版本。除了回复树，还包含个人信息模糊和粘贴图片上传 Imgur 的功能；它与 Safari 扩展的功能范围不同。

在支持用户脚本的浏览器中安装 Tampermonkey 等管理器，打开脚本文件并通过管理器安装，然后访问 V2EX。图片上传使用 Imgur API，可通过脚本管理器菜单设置 Imgur Client ID；上传的图片会发送到 Imgur。

## 目录

- `V2EX Reply Tree/`：iOS 宿主应用。
- `V2EX Reply Tree Extension/`：Safari 扩展及回复树脚本。
- `V2EX Reply Tree.xcodeproj/`：Xcode 项目。
- `userscript/`：独立的油猴脚本。
