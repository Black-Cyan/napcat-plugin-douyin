# NapCat 抖音视频解析插件（napcat-plugin-douyin） 

本项目是一个基于 [NapCat](https://github.com/NapNeko/NapCatQQ) 的插件，实现自动解析转发的抖音链接，并直接将视频、图文作品发送到聊天中。

<p align="center">
  <img src="https://img.shields.io/github/downloads/Black-Cyan/napcat-plugin-douyin/total">
</p>

## 功能特性 

- **自动解析**：识别消息中的 `https://v.douyin.com/...` 链接，调用第三方 API 解析。 
- **作品详情**：展示作品作者与简介。 
- **图文内容**：按照原作品顺序发送图片。 

## 安装方法 

### 方式一：在线安装（推荐）

直接在 NapCat WebUI 的插件商店中搜索并安装。

> 注意：此方式需要 NapCat 版本 >= 4.14.0。 

### 方式二：离线安装

1. 前往 [Releases](https://github.com/Black-Cyan/napcat-plugin-douyin/releases) 页面下载最新的 napcat-plugin-douyin.zip。

2. 将压缩包解压至 NapCat 的 plugins 文件夹下。

3. 重启 NapCat，或者在 WebUI 的插件管理页面刷新并启用该插件。

### 方式三：源码构建

1. 克隆仓库：

```bash
# https
git clone https://github.com/Black-Cyan/napcat-plugin-douyin.git
# ssh
git clone git@github.com:Black-Cyan/napcat-plugin-douyin.git
cd napcat-plugin-bilibili
```

2. 安装依赖并进行构建：

```bash
pnpm install
pnpm run build
```

3. 构建完成后，将生成的 `dist/index.mjs`、`package.json` 以及 `src/webui` 目录手动复制到 NapCat 的插件目录下。

## 开发与贡献

如果你有任何建议或发现了 Bug，欢迎提交 Issue 或 Pull Request。

## 鸣谢

本项目在开发过程中参考了以下优秀项目，排名不分先后：

- [napcat-plugin-bilibili](https://github.com/AQiaoYo/napcat-plugin-bilibili) - 插件架构参考。

- [xhus 抖音解析接口](https://api.xhus.cn/doc/douyin.html) - 抖音解析接口。

## 许可证

MIT
