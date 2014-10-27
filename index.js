"use strict";

var _           = require("lodash");
var path        = require("path");
var Events      = require("events").EventEmitter;
var events      = new Events();
var ports       = require("portscanner-plus");
var Q           = require("q");
var EE          = require("easy-extender");

var hooks       = require("./server/hooks");
var config      = require("./server/config");
var server      = require("./server/server");

var defaultPlugins = {
    "ghostmode":   require("./server/plugins/ghostmode/ghostMode"),
    "locations":   require("./server/plugins/locations/locations"),
    "server-info": require("./server/plugins/server-info/server-info"),
    "plugins":     require("./server/plugins/plugins/plugins")
};

/**
 * @param {Object} opts - Any options specifically 
 *                        passed to the control panel
 * @param {BrowserSync} bs
 * @returns {ControlPanel}
 * @constructor
 */
var ControlPanel = function (opts, bs) {

    opts = opts || {};

    this.logger = bs.getLogger(config.pluginName);
    this.bs     = bs;
    this.opts   = opts;

    this.pluginManager = new EE(defaultPlugins, hooks).init();

    this.initDefaultHooks()
        .detectPorts();

    return this;
};

/**
 * Init default hooks and save
 * @returns {ControlPanel}
 */
ControlPanel.prototype.initDefaultHooks = function () {
    
    this.pageMarkup = this.pluginManager.hook("markup");
    this.clientJs   = this.pluginManager.hook("client:js");
    this.templates  = this.pluginManager.hook("templates");
    
    return this;
};

/**
 * Emit running event and log.
 */
ControlPanel.prototype.inform = function () {
    events.emit("cp:running", this);
    this.logger.info("Running at: {cyan:http://localhost:%s", this.port);
};

/**
 * Detect an available port
 * @returns {ControlPanel}
 */
ControlPanel.prototype.detectPorts = function () {
    
    ports.getPorts(1)
        .then(this.startServer.bind(this))
        .then(this.registerPlugins.bind(this))
        .then(this.inform.bind(this))
        .catch(function (e) {
            this.logger
                .setOnce("useLevelPrefixes", true)
                .error("{red:%s", e.stack);
        }.bind(this));
    
    return this;
};

/**
 * @returns {ControlPanel}
 */
ControlPanel.prototype.init = function () {
    return this;
};

/**
 * @param ports
 * @returns {promise|*|Q.promise}
 */
ControlPanel.prototype.startServer = function (ports) {

    var deferred = Q.defer();
    var port     = this.port = ports[0];

    this.logger.info("Using port %s", port);

    var socketMw    = this.bs.getMiddleware("socket-js");
    var connectorMw = this.bs.getMiddleware("connector");

    require("./server/transform.options")(this.bs);
    
    var appServer 
        = module.exports.server 
        = this.server 
        = server(this, socketMw, connectorMw);

    appServer.listen(port);

    deferred.resolve(appServer);

    return deferred.promise;
};

/**
 * Interface required for BrowserSync
 * @returns {Function}
 */
function plugin(opts, bs) {

}

/**
 * Initialise the default plugins
 */
ControlPanel.prototype.registerPlugins = function () {
    var defaults = Object.keys(defaultPlugins);
    _.each(defaults, function (name) {
        this.pluginManager.get(name)(this, this.bs);
    }, this);
};

/**
 * These hooks are for attaching functionality to BrowserSync
 */
module.exports.hooks = {
    /**
     * Client JS is added to each connected client
     */
    "client:js":         require("fs").readFileSync(__dirname + config.clientJs)
};

/**
 * BrowserSync Plugin interface
 * @param opts
 * @param bs
 * @returns {ControlPanel}
 */
module.exports["plugin"] = function (opts, bs) {
    var controlPanel = module.exports.instance = new ControlPanel(opts, bs).init();
    return controlPanel;
};

module.exports["plugin:name"]       = config.pluginName;
module.exports.events               = events;