'use strict';

var assert = require('assert');
var restify = require('restify-clients');
var error = require('./error/error');
var query = require('querystring');
var utils = require('./utils');
var restAddon = '/rest/v1';

var info = require('../package.json');

var cacheTimeout = 60 * 60 * 1000; // 1 hour


/**
 * Wrapper for Restify client
 *
 * @param opts {Object} - initialization options
 * @param opts.user {String} - Zuora API account username
 * @param opts.password {String} - Zuora API account password
 * @param [opts.production=false] {Boolean} - whether to use production or sandbox
 * @returns {ZuoraClient}
 * @constructor
 */
function ZuoraClient(opts) {
    if(!(this instanceof ZuoraClient)) {
        return new ZuoraClient(opts);
    }

    assert.ok((opts && typeof opts === 'object'), 'opts must be an object');
    assert.ok(opts.user, 'opts.apiKey must be defined');
    assert.ok(opts.password, 'opts.apiSecret must be defined');
  if(opts.log) {
    opts.log = opts.log.child({component: info.name + '@' + info.version});
  }
  this.log = {
    child: function () {
      if(!opts.log) {
        return function(){};
      }
      var child = opts.log.child.apply(opts.log, arguments);
      return function (lvl) {
        var args = Array.prototype.slice.call(arguments, 1);
        child[lvl].apply(child, args);
      };
    }
  };
    var url = opts.url;
    if (!url) {
        url = (opts.production ? 'https://api.zuora.com' : 'https://apisandbox-api.zuora.com');
    }

    var client = restify.createJsonClient({
        url: url
    });

    client.basicAuth(opts.user, opts.password);

    this.client = client;

    this.clientCache = {};
}

/**
 * Gets from cache if present, saves to cache on response
 *
 * @param path {String} Query path
 * @param opts {Object} Query parameters
 * @param callback {Function}
 */
ZuoraClient.prototype.cacheGet = function (path, opts, callback) {
    var log = this.log.child({method: 'GET', path: path});
    var self = this;
    if (this.clientCache[path]) {
        process.nextTick(function () {
            log('debug', 'Zuora got result from cache');
            callback(null, self.clientCache[data].data);
        });
        return;
    }
    if (opts) {
        path += '?' + query.stringify(opts);
    }
    path = restAddon + path;
    log('debug', 'Calling Zuora');
    this.client.get(path, error.getHandler(log, function (err, result) {
        if (!err) {
            self.clientCache[path] = {
                data: result,
                timeout: setTimeout(function () {
                    delete self.clientCache[path];
                }, cacheTimeout)};
        }
        callback(err, result);
    }));
};


/**
 * Invalidates cache on updating path (record)
 *
 * @param log {Object}
 * @param path {String} Query path
 * @param callback {Function}
 * @returns {*}
 */
ZuoraClient.prototype.cacheUpdate = function (log, path, callback) {
    delete this.clientCache[path];
    return error.getHandler(log, callback);
};

/**
 * Wrapper for get function - will build query string from opts and wrap callback in error handler
 *
 * @param path {String} - base path
 * @param [opts] {Object} - query parameters
 * @param callback {Function}
 */
ZuoraClient.prototype.get = function (path, opts, callback) {
    var log = this.log.child({method: 'GET', path: path});
    if (!callback) {
        callback = opts;
        opts = false;
    }
    var self = this;
    this.cacheGet(path, opts, function (err, result) {
        if (!err && result.nextPage && result.nextPage.indexOf(restAddon) !== -1) {
            var nextPath = result.nextPage.substring(result.nextPage.indexOf(restAddon) + restAddon.length);
            log('debug', 'Getting additional page ' + nextPath);
            self.get(nextPath, opts, function (nextErr, nextResult) {
                if (!nextErr && nextResult) {
                    Object.keys(result).forEach(function (propName) {
                        if (Array.isArray(result[propName]) && Array.isArray(nextResult[propName])) {
                            result[propName] = result[propName].concat(nextResult[propName]);
                        }
                    });
                }
                callback(err, result);
            });
            return;
        }
        callback(err, result);
    });
};

/**
 * Wrapper for del function - will build query string from opts and wrap callback in error handler
 *
 * @param path {String} - base path
 * @param [opts] {Object} - query parameters
 * @param callback {Function}
 */
ZuoraClient.prototype.del = function (path, opts, callback) {
    if(!callback) {
        callback = opts;
        opts = false;
    }
    if(opts) {
        path += '?' + query.stringify(opts);
    }
    path = restAddon + path;
  var log = this.log.child({method: 'DELETE', path: path});
  log('debug', 'Calling Zuora');
    this.client.del(path, this.cacheUpdate(log, path, callback));
};

/**
 * Wrapper for put function - will wrap callback in error handler
 *
 * @param path {String} - base path
 * @param [object=undefined] {Object} - data to send
 * @param callback {Function}
 */
ZuoraClient.prototype.put = function (path, object, callback) {
    if(!callback) {
        callback = object;
        object = undefined;
    }
    path = restAddon + path;
  var log = this.log.child({method: 'PUT', path: path});
    if(object) {
      log('debug',  {data: utils.cleanLogObject(object)}, 'Calling Zuora');
        this.client.put(path, object, this.cacheUpdate(log, path, callback));
    } else {
      log('debug', 'Calling Zuora');
        this.client.put(path, this.cacheUpdate(log, path, callback));
    }
};

/**
 * Wrapper for post function - will wrap callback in error handler
 *
 * @param path {String} - base path
 * @param [object=undefined] {Object} - data to send
 * @param callback {Function}
 */
ZuoraClient.prototype.post = function (path, object, callback) {
    if(!callback) {
        callback = object;
        object = undefined;
    }
    path = restAddon + path;
  var log = this.log.child({method: 'POST', path: path});
    if(object) {
      log('debug', {data: utils.cleanLogObject(object)}, 'Calling Zuora');
        this.client.post(path, object, this.cacheUpdate(log, path, callback));
    } else {
      log('debug', 'Calling Zuora');
        this.client.post(path, this.cacheUpdate(log, path, callback));
    }
};

module.exports = ZuoraClient;
