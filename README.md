# auth-proxy

为内网一些『裸奔』管理页面加上一些基本的安全认证

## run
```bash
$ docker run -d -e  PROXY_TARGET_HOST=192.168.123.100 -e PROXY_TARGET_PORT=8080 -e PROXY_NAME=abc -e PROXY_PASS=123 -e PROXY_PORT=3000 -p 3000:3000 somax/auth-proxy
```

