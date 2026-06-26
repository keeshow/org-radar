# dws 前置依赖

OrgRadar 通过 `dws` 读取钉钉通讯录数据。部署 OrgRadar 前，需要先在服务器上安装并登录 `dws`，并确认当前账号拥有通讯录查询权限。

`dws` 钉钉官方开源项目：[DingTalk-Real-AI/dingtalk-workspace-cli](https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli)。

## 作用

OrgRadar 当前会调用以下 dws 能力：

```bash
dws contact dept list-children
dws contact dept list-members
dws contact user get
```

因此，安装dws后，还需要完成钉钉登录授权，并确保企业已允许 CLI 访问通讯录能力。

## 安装 dws

### macOS / Linux

官方推荐一行安装：

```bash
curl -fsSL https://raw.githubusercontent.com/DingTalk-Real-AI/dingtalk-workspace-cli/main/scripts/install.sh | sh
```

安装完成后检查：

```bash
dws version
```

### Windows

PowerShell 一行安装：

```powershell
irm https://raw.githubusercontent.com/DingTalk-Real-AI/dingtalk-workspace-cli/main/scripts/install.ps1 | iex
```

安装完成后检查：

```powershell
dws version
```

### npm 安装

如果服务器已有 Node.js 和 npm，也可以通过 npm 安装 dws：

```bash
npm install -g dingtalk-workspace-cli
```

### 国内网络

如果访问 GitHub 较慢，可以使用 Gitee 镜像安装：

```bash
export DWS_GITEE_REPO=DingTalk-Real-AI/dingtalk-workspace-cli
curl -fsSL https://gitee.com/DingTalk-Real-AI/dingtalk-workspace-cli/raw/main/scripts/install.sh | sh
```

也可以用 npm 镜像安装：

```bash
npm install -g dingtalk-workspace-cli --registry=https://registry.npmmirror.com
```

## 登录授权

有桌面浏览器的环境可以执行：

```bash
dws auth login
```

服务器、SSH、Docker 等无浏览器环境推荐使用设备登录：

```bash
dws auth login --device
```

命令会返回一个授权网址。打开网址后，选择对应组织并完成授权。

如果提示企业未开启 CLI 访问，需要联系钉钉企业管理员开启。管理员可在钉钉开放平台的 CLI Access Management 中启用。

## 检查登录状态

执行：

```bash
dws auth status --format json
```

可用状态通常应满足：

```json
{
  "success": true,
  "authenticated": true,
  "token_valid": true,
  "refresh_token_valid": true
}
```

如果 `authenticated`、`token_valid` 或 `refresh_token_valid` 为 `false`，重新执行：

```bash
dws auth login --device
```

## 检查通讯录权限

先确认能读取根部门下的一级部门：

```bash
dws contact dept list-children --id 1 --format json
```

正常情况下应返回 `success: true`，并包含部门列表。

再选择上一步返回的某个 `deptId`，检查部门成员读取：

```bash
dws contact dept list-members --ids <deptId> --format json
```

如果返回了成员列表，再取其中的 `userId` 检查用户详情：

```bash
dws contact user get --ids <userId> --format json
```

这三步都成功后，OrgRadar 才能正常同步通讯录。

## 在 OrgRadar 中验证

安装并登录 dws 后，进入 OrgRadar 页面，点击：

```text
手动同步
```

如果同步失败，可以在服务器查看日志：

```bash
or logs
```

常见错误含义：

| 现象 | 可能原因 | 处理方式 |
| --- | --- | --- |
| `dws` 命令不存在 | dws 未安装或不在 PATH 中 | 重新安装 dws，或确认 `which dws` 有输出 |
| 未授权 / token 无效 | dws 未登录或登录过期 | 执行 `dws auth login --device` |
| 企业未开启 CLI 访问 | 企业管理员未授权 CLI | 联系管理员开启 CLI Access Management |
| 通讯录命令失败 | 当前账号没有通讯录权限 | 确认账号是否能访问组织通讯录，或联系管理员授权 |
| 同步一直失败 | dws 命令返回异常 | 执行上面的通讯录权限检查命令定位问题 |

## 参考

- [DingTalk Workspace CLI GitHub 仓库](https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli)
- [dws 命令索引](https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli/blob/main/docs/command-index.md)
