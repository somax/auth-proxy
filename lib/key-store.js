/**
 * 有时效的键存储，在过期之后会被自动清理
 * @example
 * let ks = new KeyStore();
 * // or
 * let ks = new KeyStore({sweepTime:3000, expireTime:600000});
 *
 * // 添加 key
 * ks.insert('token', 300000);
 * // token.1521559806416
 *
 * // 检查 key 是否存在
 * ks.check('token.1521559806416');
 * // true / false
 * 
 */
const log = require('solog')
const DEFAULT_LIFE_TIME = 600000; // 10 分钟
const DEFAULT_SWEEP_TIME = 5000;

function KeyStore(options) {
    if (!options) options = {};
    this.storage = [];

    // 清理间隔，默认 5 秒
    this.sweepTime = options.sweepTime || DEFAULT_SWEEP_TIME;

    // 过期时间，默认 5分钟
    this.lifeTime = options.lifeTime || DEFAULT_LIFE_TIME;

    log(this.storage)
    setInterval(()=>this.sweep(), this.sweepTime);

}

KeyStore.getExpireTime = function (key) {
    return parseInt(key.split('.')[1])
}

// 检查 key 是否存在并且是否过期
// @parme key {String} The key
// @return true / false
// 
KeyStore.prototype.check = function check(key) {
    return this.storage.indexOf(key) >= 0
}

// 添加一个新的 key 
KeyStore.prototype.insert = function insert(key, _lifeTime) {
    log.debug('lifeTime:',_lifeTime,this.lifeTime)
    let _expireTime = Date.now() + (_lifeTime || this.lifeTime);
    let _key = `${key}.${_expireTime}`
    this.storage.push(_key);
    log('key inserted:', _key);
    return _key
}

// 清理过期的 key
KeyStore.prototype.sweep = function sweep() {
    log.debug('Key sweeping...', this.storage.length)
    let now = Date.now();
    // 这里 for 循环没有 i++，是因为总是会移除第一个 key，然后第二个 key 会变成第一个 key
    for (var i = 0; i < this.storage.length; ) {
        let key = this.storage[i];
        let expireTime = KeyStore.getExpireTime(key);

        // 由于是按时间顺序加入的，所以一旦遇到没有过期的 key，后面的都不需要要再检查了
        log.debug('\n过期时间：', expireTime, '\n现在时间：', now, '\n', expireTime < now ? '已过期' : '未过期')
        if (expireTime >= now) {
            return;
        }
        this.storage.shift();
        log('key removed:', key);
    }
}

module.exports = KeyStore