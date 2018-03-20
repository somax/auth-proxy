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

## api

### _auth_proxy_otp

### _auth_proxy_logout