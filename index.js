const http = require('http');
const auth = require('basic-auth');
const httpProxy = require('http-proxy');
const log = require('solog');

const TARGET_HOST = process.env.PROXY_TARGET_HOST;
const TARGET_PORT = process.env.PROXY_TARGET_PORT;
const NAME = process.env.PROXY_NAME;
const PASS = process.env.PROXY_PASS;
const PORT = process.env.PROXY_PORT || 3000;

const proxy = new httpProxy.createProxyServer({
    target: {
        host: TARGET_HOST,
        port: parseInt(TARGET_PORT)
    }
});

proxy.on('error', function(err) {
  	log.err(err)
});

const proxyServer = http.createServer(function(req, res) {

    var credentials = auth(req);

    if (!credentials || credentials.name !== NAME || credentials.pass !== PASS) {
        res.statusCode = 401;
        res.setHeader('WWW-Authenticate', 'Basic realm="auth-proxy"');
        res.end('Access denied');
    } else {
        proxy.web(req, res);
    }

});

// 同时代理 Websocket
proxyServer.on('upgrade', function(req, socket, head) {
    proxy.ws(req, socket, head);
});

proxyServer.listen(PORT);

// 使得在容器中运行支持 ctrl+c 退出
process.on('SIGINT', function() {
    process.exit();
});

console.log(`Start at http://0.0.0.0:${PORT}, proxy to ${TARGET_HOST}:${TARGET_PORT}`)