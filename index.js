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
let ks = new KeyStore({sweepTime:3000, expTime:600000});

// test
ks.insert('aaaaaaa',2000);
ks.insert('bbbbbbb',2000);
ks.insert('ccccccc',5000);

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
const _2FA_WINDOW = 10; //TODO 调试方便先设大点，回头改回 1
const AUTH_TOKEN_COOKIE_NAME = '_APTK' ;

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
        res.end('Access denied');
    }

    function basicAuthCheck(credentials) {
        return !credentials || credentials.name !== NAME || credentials.pass !== PASS
    }

    function setCookie(res, name, value) {
        res.setHeader('Set-Cookie', cookie.serialize(name, value, {
            httpOnly: true,
            maxAge: 60 * 60 * 24 * 7 // 1 week 
        }));
    }

    const proxyServer = http.createServer(function(req, res) {
        var _credentials = auth(req);

        // 强制清理 base auth 缓存
        if (req.url === '/_auth_proxy_logout') {
            // TODO 删除 cookie 中的 token
            deny(res,'Logout')
        }
        
        // 获得二维码，用来设置手机端 2FA 账户
        else if (req.url === '/_auth_proxy_otp') {
            if (ENABLE_2FA) {
                if (basicAuthCheck(_redentials)) {
                    deny(res)
                } else {
                    QRCode.toDataURL(secret.otpauth_url, function(err, data_url) {
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

            if (ENABLE_2FA) {

                // TODO 
                // - [√] 检查 cookies 中的 token 是否存在于 key - store 中，
                // - [√] 如果存在直接放行，如果不存在则验证密码，
                // - [√] 验证密码通过，生成 token 存入 key-store 然后加入 cookies
                // - [ ] 检测有效 token 的剩余生命期，如果生命减半，则更新 token
                // if(ks.check())
                let cookies = cookie.parse(req.headers.cookie || '');
                log.debug('------------cookies----', cookies)
                let tokenVerified = ks.check(cookies[AUTH_TOKEN_COOKIE_NAME]);
                log.debug('tokenVerified:',tokenVerified)

                if (tokenVerified) {
                    proxy.web(req, res);
                    return;
                }


                // 开启两步验证的方式，先检查用户名
                if (_credentials && _credentials.name === NAME) {
                    log.debug('_credentials', _credentials);
                    log.debug('secret', secret);

                    // 再验证 2FA 密码

                    let userToken = _credentials.pass;

                    // TODO remove when debug done >>
                    let token = speakeasy.totp({
                        secret: secret.base32,
                        encoding: 'base32'
                    });
                    log.debug(token, userToken);
                    // <<

                    let verified = speakeasy.totp.verify({
                        secret: secret.base32,
                        encoding: 'base32',
                        token: userToken,
                        window: _2FA_WINDOW
                    });

                    log.debug('verified', verified);

                    if (verified) {

                        // TODO 生成 token 存入 cookie
                        let token = ks.insert(uuid());
                        setCookie(res, AUTH_TOKEN_COOKIE_NAME, token)

                        proxy.web(req, res);
                    } else {
                        deny(res);
                    }

                } else {
                    log('no credentials or name not match');
                    deny(res);
                }
            } else {

                // 不用两步验证的模式，就是简单的 basic auth 了
                if (basicAuthCheck(_redentials)) {
                    deny(res);
                } else {
                    proxy.web(req, res);
                }
            }
        }
    });

    // 同时代理 Websocket
    proxyServer.on('upgrade', function(req, socket, head) {
        proxy.ws(req, socket, head);
    });

    proxyServer.listen(PORT);

    log.info(`Start at http://0.0.0.0:${PORT}, proxy to ${TARGET_HOST}:${TARGET_PORT}`)

    if(ENABLE_2FA){
        log.info(`To scan qrcode image at: http://0.0.0.0:${PORT}/_auth_proxy_otp`)
    }

    log.info(`Browser to http://0.0.0.0:${PORT}/_auth_proxy_logout to force logout`)
}


// 使得在容器中运行支持 ctrl+c 退出
process.on('SIGINT', function() {
    process.exit();
});