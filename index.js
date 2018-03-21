const http = require('http');
const auth = require('basic-auth');
const httpProxy = require('http-proxy');
const log = require('solog');
const jf = require('jsonfile');
var QRCode = require('qrcode');

const speakeasy = require('speakeasy');

const KeyStore = require('./lib/key-store');
let ks = new KeyStore({sweepTime:3000, expTime:600000});

// test
ks.insert('aaaaaaa',2000);
ks.insert('bbbbbbb',2000);
ks.insert('ccccccc',5000);


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


    function deny(res) {
        res.statusCode = 401;
        res.setHeader('WWW-Authenticate', 'Basic realm="auth-proxy"');
        res.end('Access denied');
    }

    const proxyServer = http.createServer(function(req, res) {
        var credentials = auth(req);


        if (req.url === '/_auth_proxy_logout') {
            res.statusCode = 401;
            res.setHeader('WWW-Authenticate', 'Basic realm="auth-proxy"');
            res.end('logout');
        } else if (req.url === '/_auth_proxy_otp') {

            // 获得二维码
            if (ENABLE_2FA) {
                if (!credentials || credentials.name !== NAME || credentials.pass !== PASS) {
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
        } else {

            if (ENABLE_2FA) {
                if (credentials && credentials.name === NAME) {
                    log.debug('credentials', credentials);
                    log.debug('secret', secret);

                    let token = speakeasy.totp({
                        secret: secret.base32,
                        encoding: 'base32'
                    });



                    let userToken = credentials.pass;
                    log.debug(token, userToken);

                    let verified = speakeasy.totp.verify({
                        secret: secret.base32,
                        encoding: 'base32',
                        token: userToken,
                        window: 10 // 允许前后 30秒 有效
                    });

                    log.debug('verified', verified);

                    if (verified) {
                        proxy.web(req, res);
                    } else {
                        deny(res);
                    }

                } else {
                    log('no credentials or name not match');
                    deny(res);
                }
            } else {
                if (!credentials || credentials.name !== NAME || credentials.pass !== PASS) {
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

    log(`Start at http://0.0.0.0:${PORT}, proxy to ${TARGET_HOST}:${TARGET_PORT}`)

    if(ENABLE_2FA){
        log(`To scan qrcode image at: http://0.0.0.0:${PORT}/_auth_proxy_otp`)
    }

    log(`Browser to http://0.0.0.0:${PORT}/_auth_proxy_logout to force logout`)
}


// 使得在容器中运行支持 ctrl+c 退出
process.on('SIGINT', function() {
    process.exit();
});