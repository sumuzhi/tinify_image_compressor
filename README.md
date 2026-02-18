# Tinify 图片压缩工具 (Chrome 插件版)

这是一个基于 Tinify (TinyPNG/TinyJPG) API 的 Chrome 浏览器扩展，用于批量压缩图片。
通过将其作为 Chrome 扩展程序运行，完美解决了浏览器的跨域 (CORS) 限制问题。

## 功能特点

- **批量压缩**：支持同时选择多个图片文件。
- **文件夹上传**：支持上传整个文件夹（自动递归查找图片）。
- **无 CORS 限制**：利用 Chrome 扩展权限直接调用 API。
- **本地保存 Key**：自动保存您的 API Key，无需重复输入。
- **隐私安全**：所有操作均在本地和 Tinify 官方 API 之间直接进行，不经过第三方服务器。
- **实时进度**：显示压缩状态和节省空间比例。
- **一键下载**：支持将所有压缩成功的图片打包为 ZIP 下载。
- **直接下载**：压缩完成后提供下载链接。

## 安装方法

由于这是一个本地开发的插件，需要通过“开发者模式”加载：

1.  **打开 Chrome 扩展程序管理页面**：
    在浏览器地址栏输入 `chrome://extensions/` 并回车。

2.  **开启开发者模式**：
    点击页面右上角的 "开发者模式" (Developer mode) 开关将其打开。

3.  **加载已解压的扩展程序**：
    -   点击左上角的 "加载已解压的扩展程序" (Load unpacked) 按钮。
    -   选择本项目所在的文件夹：`/Users/xingyu.zhou/Documents/trae_projects/tinify-compose`。

4.  **完成**：
    现在你应该能看到 "Tinify Image Compressor" 插件出现在列表中。

## 使用方法

1.  **启动插件**：
    点击浏览器工具栏上的插件图标（可能需要先在拼图图标里把它钉住）。
    这会打开一个新的标签页，显示压缩工具界面。

2.  **配置 API Key**：
    首次使用时，请输入您的 Tinify API Key（会自动保存）。
    [获取 API Key](https://tinify.com/dashboard/api)

3.  **开始使用**：
    像平常一样拖入或选择文件/文件夹进行压缩。

## 文件结构

- `manifest.json`: Chrome 扩展配置文件
- `background.js`: 后台脚本，处理图标点击事件
- `index.html`: 主界面
- `style.css`: 样式文件
- `script.js`: 业务逻辑
