# OrgRadar / 组织雷达

基于钉钉通讯录数据的组织健康与人员变化观察平台。通过同步通讯录快照，展示组织人数趋势、部门健康、人员新增/离职/调岗记录，并生成周期组织报告。

组织稳定性评分口径见 [组织稳定性评估标准](./docs/organization-stability-scoring.md)。

## 获取项目

```bash
git clone https://github.com/keeshow/org-radar.git
cd org-radar
```

## 快速安装

在项目根目录执行：

```bash
./deploy/install-service.sh
```
脚本会自动完成安装和启动服务。

默认前端端口为 `5174`，后端端口为 `3001`。

## 配置

```bash
.env
```

常用配置：

```bash
ORG_NAME=
ACCESS_CODE=
VITE_ALLOWED_HOSTS=
```

`ORG_NAME` 页面标题和组织名称。

`ACCESS_CODE` 是网页登录授权码，留空则无校验。

`VITE_ALLOWED_HOSTS` 用于 Vite 开发服务的 Host 校验。例如已把 `radar.example.com` 反向代理到指定端口服务，则需要设置：

```bash
VITE_ALLOWED_HOSTS=radar.example.com
```

修改 `.env` 后执行重启服务：

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

## 卸载

方式一：

```bash
or uninstall
```

方式二：

```bash
./deploy/uninstall-service.sh
```

卸载会删除系统中项目相关的所有安装内容，但不清除项目内的配置`.env`和数据`data/`，需手动确认并删除。

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
