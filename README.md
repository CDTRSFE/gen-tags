# Gen Tags

用于快速生成和推送 tag。

![view](src/assets/view.jpg)

## Features

- 按规则生成 tag
- 支持前缀和后缀
- 将生成的 tag 存在 package.json 中

> 前缀通过 package.json 中的 `tagPrefix` 字段配置，如： `tagPrefix: ["v-"]`。

## Requirements

- vscode.git 扩展

## Known Issues

暂无

## Release Notes

### 1.3.5

- 版本号递增区分前缀, 新前缀版本号从 0.0.1 开始
- 增加「操作成功」提示, 以及刷新按钮

### 1.2.0

- 修改 git 操作逻辑

### 1.1.0

- 显示异步处理过程

### 1.0.0

Initial release of ...

## For more information

* [VSCode Marketplace](https://marketplace.visualstudio.com/items?itemName=zhaoqing.gen-tags)
