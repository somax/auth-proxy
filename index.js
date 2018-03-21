const http = require('http');
const auth = require('basic-auth');
const httpProxy = require('http-proxy');
const log = require('solog');
const jf = require('jsonfile');
const QRCode = require('qrcode');
const uuid = require('uuid/v4');
const cookie = require('cookie');

const speakeasy = require('speakeasy');

const KeyStore = require('./lib/key-store');
// let ks = new KeyStore({ sweepTime: 3000, lifeTime: 30000 });//TODO 时间设定待开发完成后调整
let ks = new KeyStore();

// 通过环境变量 PROXY_DEBUG 确定是否输出 DEBUG 信息
log.setDevelopMode(process.env.PROXY_DEBUG === 'true');

const TARGET_HOST = process.env.PROXY_TARGET_HOST;
const TARGET_PORT = process.env.PROXY_TARGET_PORT;
const NAME = process.env.PROXY_NAME;
const PASS = process.env.PROXY_PASS;
const PORT = process.env.PROXY_PORT || 3000;


const ENABLE_2FA = process.env.PROXY_ENABLE_2FA === 'true';
// 生成 key 的长度
// TODO 长度值太小了好像会导致手机端密码和服务端必配，待验证
const SECRET_LENGTH = process.env.PROXY_SECRET_LENGTH || 20
const SECRET_FILE = process.env.PROXY_SECRET_FILE || '.secret';

// 允许密码有效期为前后 n 秒，n = i * 30
const _2FA_WINDOW = 1; //TODO 调试方便先设大点，回头改回 1
const AUTH_TOKEN_COOKIE_NAME = '_APTK';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7;  // 1 week

// two factor auth
let secret;

// 从文件读取密文
jf.readFile(SECRET_FILE, function(err, _secret) {
    if (!err) {
        secret = _secret;
    } else {
        // 如果不存在就生成新的密文
        secret = speakeasy.generateSecret({ name: NAME, length: SECRET_LENGTH });

        // 并保存到文件
        jf.writeFile(SECRET_FILE, secret, function(err) {
            if (err) log.error(err)
        })

    }

    startServer();

})


function startServer() {

    const proxy = new httpProxy.createProxyServer({
        target: {
            host: TARGET_HOST,
            port: parseInt(TARGET_PORT)
        }
    });

    proxy.on('error', function(err) {
        log.err(err)
    });

    function deny(res, msg) {
        res.statusCode = 401;
        res.setHeader('WWW-Authenticate', 'Basic realm="auth-proxy"');
        res.end(msg || 'Access denied');
    }

    function basicAuthCheck(credentials) {
        return !credentials || credentials.name !== NAME || credentials.pass !== PASS
    }

    function setCookie(res, name, value) {
        res.setHeader('Set-Cookie', cookie.serialize(name, value, {
            httpOnly: true,
            path:'/',
            maxAge: COOKIE_MAX_AGE 
        }));
    }

    function setToken(res) {
        let token = ks.insert(uuid());
        setCookie(res, AUTH_TOKEN_COOKIE_NAME, token)
    }

    const proxyServer = http.createServer(function (req, res) {

        // 目标如果是代理服务器需要 host 信息
        req.headers.host = `${TARGET_HOST}:${TARGET_PORT}`;
        log.debug(Object.keys(req), req.headers)

        var _credentials = auth(req);

        // 强制清理 base auth 缓存
        if (req.url === '/_auth_proxy_logout') {
            // TODO 删除 cookie 中的 token
            setCookie(res, AUTH_TOKEN_COOKIE_NAME, '')
            deny(res, 'Logout success')
        }

        // 获得二维码，用来设置手机端 2FA 账户
        else if (req.url === '/_auth_proxy_otp') {
            if (ENABLE_2FA) {
                if (basicAuthCheck(_credentials)) {
                    deny(res)
                } else {
                    QRCode.toDataURL(secret.otpauth_url, function (err, data_url) {
                        res.writeHead(200, { 'Content-Type': 'text/html' });
                        res.end('<img src="' + data_url + '">');
                    });
                }
            } else {
                res.end('ENABLE_2FA=false');
            }
        }

        // 剩下的就是正常代理网站内容了
        else {

            // 在两步验证开启的模式下
            if (ENABLE_2FA) {

                // TODO 
                // - [√] 检查 cookies 中的 token 是否存在于 key - store 中，
                // - [√] 如果存在直接放行，如果不存在则验证密码，
                // - [√] 验证密码通过，生成 token 存入 key-store 然后加入 cookies
                // - [√] 检测有效 token 的剩余生命期，如果生命减半，则更新 token
                // - [ ] 并发请求会生成多个 token 的问题

                // 先看看 cookie 中的 token 是否有效
                let cookies = cookie.parse(req.headers.cookie || '');
                let token = cookies[AUTH_TOKEN_COOKIE_NAME];

                let tokenVerified = ks.check(token);
                log.debug('tokenVerified:', tokenVerified)

                if (tokenVerified) {
                    // 验证通过，给...
                    proxy.web(req, res);

                    // 检查有效的 token 是否需要续命，如果剩余时间小于生命期一半就给个新 token
                    let expireTime = KeyStore.getExpireTime(token);
                    if (expireTime - Date.now() < ks.lifeTime / 2) {
                        log.debug('续命!')
                        setToken(res);
                    }

                    // token 验证通过就可以了，结束吧
                    return;
                }


                // token 未通过，就开始走颁发 token 流程
                // 先检查用户名...
                if (!_credentials || _credentials.name !== NAME) {
                    log('no credentials or name not match');
                    deny(res);
                } else {
                    log.debug('_credentials', _credentials);
                    log.debug('secret', secret);

                    // ...再验证 2FA 密码
                    let userToken = _credentials.pass;

                    let verified = speakeasy.totp.verify({
                        secret: secret.base32,
                        encoding: 'base32',
                        token: _credentials.pass,
                        window: _2FA_WINDOW
                    });

                    log.debug('verified', verified);

                    if (verified) {
                        // 密码验证通过，就给 token
                        setToken(res);
                        proxy.web(req, res);
                    } else {
                        deny(res);
                    }

                }
            }

            // 不用两步验证的模式，就是简单的 basic auth 了
            else {
                if (basicAuthCheck(_redentials)) {
                    deny(res);
                } else {
                    proxy.web(req, res);
                }
            }
        }
    });

    // 同时代理 Websocket
    proxyServer.on('upgrade', function (req, socket, head) {
        proxy.ws(req, socket, head);
    });

    proxyServer.listen(PORT);

    log.info(`Start at http://0.0.0.0:${PORT}, proxy to ${TARGET_HOST}:${TARGET_PORT}`)

    if (ENABLE_2FA) {
        log.info(`To scan qrcode image at: http://0.0.0.0:${PORT}/_auth_proxy_otp`)
    }

    log.info(`Browser to http://0.0.0.0:${PORT}/_auth_proxy_logout to force logout`)
}


// 使得在容器中运行支持 ctrl+c 退出
process.on('SIGINT', function () {
    process.exit();
});