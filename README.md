# OrgRadar / 组织雷达

基于钉钉通讯录数据的组织健康与人员变化观察平台。它可以同步通讯录快照，展示组织人数趋势、部门健康、人员新增/离职/调岗记录，并生成周期组织报告。

组织稳定性评分口径见 [组织稳定性评估标准](./docs/organization-stability-scoring.md)。

## 项目名称

- 英文名：OrgRadar
- 中文名：组织雷达
- 仓库名：org-radar

## 获取项目

```bash
git clone <your-repo-url> org-radar
cd org-radar
```

## 快速安装

在项目根目录执行：

```bash
./deploy/install-service.sh
```

安装脚本会自动完成：

- 如果 `.env` 不存在，从 `.env.example` 复制一份。
- 读取当前项目所在路径和当前运行用户。
- 生成 systemd 服务：`/etc/systemd/system/org-radar.service`。
- 安装依赖：`npm run install:all`。
- 执行构建：`npm run build`。
- 设置开机自启：`systemctl enable org-radar`。
- 启动服务：`systemctl restart org-radar`。
- 安装命令行管理工具：`org-radar` 和快捷命令 `or`。

默认前端端口为 `5174`，后端端口为 `3001`。

## 配置

`.env.example` 默认可以直接运行。首次安装时如果没有 `.env`，安装脚本会自动创建：

```bash
.env
```

常用配置：

```bash
ORG_NAME=你的组织
ACCESS_CODE=
VITE_ALLOWED_HOSTS=
```

`ORG_NAME` 用于页面标题，页面会直接显示这个值。如果设置为 `Acme`，页面显示为 `Acme`；如果留空，默认显示 `组织雷达`。

`ACCESS_CODE` 是网页登录授权码，只在后端校验，不会写入前端页面。留空表示关闭授权码页面，访问者会直接进入系统；设置了值则必须输入该值才能访问组织数据。

`VITE_ALLOWED_HOSTS` 用于 Vite 开发服务的 Host 校验。它不会帮你创建域名、DNS 或 nginx 代理。如果你已经把 `radar.example.com` 反向代理到 `WEB_PORT`，就需要设置：

```bash
VITE_ALLOWED_HOSTS=radar.example.com
```

`NODE_ENV` 是 Node.js 运行环境标识。当前服务默认通过 Vite + Express 的开发模式运行，保持 `development` 即可。

修改 `.env` 后执行：

```bash
or restart
```

## 服务管理

安装完成后可以使用完整命令：

```bash
org-radar status
```

也可以使用快捷命令：

```bash
or status
```

支持的命令：

```bash
or start      # 启动服务
or restart    # 重启服务
or stop       # 停止服务
or enable     # 设置开机自启
or disable    # 取消开机自启
or status     # 查看服务状态
or logs       # 跟随服务日志
or uninstall  # 卸载 systemd 服务和命令行入口
```

`or` 不支持 `install`。首次安装必须在项目根目录执行：

```bash
./deploy/install-service.sh
```

原因是 `or` 命令本身是在安装过程中写入 `/usr/local/bin` 的。

## 卸载

方式一：

```bash
or uninstall
```

方式二：

```bash
./deploy/uninstall-service.sh
```

卸载会删除：

- systemd 服务文件：`/etc/systemd/system/org-radar.service`
- 命令行入口：`/usr/local/bin/org-radar`
- 快捷命令：`/usr/local/bin/or`

卸载不会删除：

- 项目代码
- `.env`
- `data/`
- SQLite 数据库
- `node_modules`
- nginx 配置
- dws 登录状态

## 开发运行

如果只想本地开发，不安装 systemd：

安装依赖：

```bash
npm run install:all
```

启动开发服务：

```bash
npm run dev
```

默认前端端口为 `5174`，后端端口为 `3001`。

## 自定义服务名

安装脚本支持通过环境变量覆盖服务名和命令路径，例如：

```bash
SERVICE_NAME=my-org-radar ./deploy/install-service.sh
```

卸载对应服务时也需要传入同样的服务名：

```bash
SERVICE_NAME=my-org-radar ./deploy/uninstall-service.sh
```

## 不应提交的数据

`data/`、`.env`、`node_modules/`、构建产物和本地运行日志都已加入 `.gitignore`。通讯录数据和权限码不要提交到公开仓库。

## 开源协议

本项目基于 [MIT License](./LICENSE) 开源。
