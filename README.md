# auth-proxy

为内网一些『裸奔』管理页面加上一些基本的安全认证

## Usage
```bash

# quick start, default proxy port is 3000
$ PROXY_TARGET_HOST=192.168.123.201 PROXY_TARGET_PORT=10086 PROXY_NAME=jkr3 PROXY_PASS=123 node .

# enable Two factor auth and specify proxy port
$ PROXY_TARGET_HOST=192.168.123.201 PROXY_TARGET_PORT=10086 PROXY_NAME=jkr3 PROXY_PASS=123 PROXY_PORT=3003 PROXY_ENABLE_2FA=true node .

# docker
$ docker run -d \
  -e PROXY_TARGET_HOST=192.168.123.100 \
  -e PROXY_TARGET_PORT=8080 \
  -e PROXY_NAME=abc \
  -e PROXY_PASS=123 \
  -e PROXY_PORT=3000 \
  -e PROXY_ENABLE_2FA=true \
  -p 3000:3000 \
  somax/auth-proxy

```

## 环境变量

- `PROXY_TARGET_HOST` 代理目标服务 IP 地址或域名
- `PROXY_TARGET_PORT` 代理目标服务 端口号
- `PROXY_NAME` 管理员用户名
- `PROXY_PASS` 管理员密码
- `PROXY_PORT` 代理服务器端口号，默认 `3000`
- `PROXY_ENABLE_2FA` 是否开启两步验证 `true`/`false`，默认不开启
- `PROXY_SECRET_FILE` 两步验证密文证书文件，支持在 rancher 中使用 secret (密文)方式提供，默认当前目录下 `.secret` 文件
- `PROXY_DEBUG` 打印 debug 信息，`true`/`false`，默认 `false`

## 流程说明

### 基本认证

```
访问代理服务地址 -> 输入用户名及密码 -> (正确）-> 请求【目标网站】-> 返回内容
                        v
                      (错误) -> 重新输入/取消

```

### 开启 2FA （Two Factor Auth）
```
# 设置 2FA 账户
访问 `/_auth_proxy_otp` -> 输入用户名及密码 -> (正确) -> 显示二维码 -> 手机 2FA 客户端 扫描添加账户
                                  v
                                (错误) -> 重新输入/取消

# 用 2FA 密码登录
访问代理服务地址 -> 输入用户名及 2FA 密码 -> (正确）-> 请求【目标网站】-> 返回内容
                              v
                            (错误) -> 重新输入/取消
```

### 强制登出
```
访问 `/_auth_proxy_logout` -> 提示输入用户名及密码 -> 选取消即可（清除密码缓存）
```
> 注意：两步验证证书在首次运行会自动生成，如需更换，手动删除证书（默认是`.secret`) 文件后重启服务

### 不适用场景

1. 目前不支持 https 代理 
2. 页面内有其他引用，包括不同端口，这些部分不会被代理
3. 代理目标服务本身就有 Basic auth 认证的，会冲突
4. 页面内的连接包含域名的情况，在点击这些链接时会转到原连接