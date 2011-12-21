// Tadagraph API
API = function(CONFIG) {this.CONFIG = CONFIG;};

// Basic API
API.prototype.login = function login(callback) {
    if (!callback) throw Error('callback is required argument');
    
    var that = this;
    
    $.ajax({
        url: this.CONFIG.HOST + '/api/me',
        success: function(data) {
            if (data) {
                callback(data);
                that.online = true;
            } else {
                retry();
                
            }
        },
        error: retry
    });
    
    function retry() {
        setTimeout(function() {
            that.login(callback);
        }, that.CONFIG.LOGIN_TIMEOUT);
        that.online = false;
    }
};

API.prototype.init = function(callback) {
    var that = this;
    this.login(function(username) {
        callback(username);
    });
};

// Notifications API part
API.prototype.getUnreadMessagesCount = function(callback) {
    $.ajax({
        url: this.CONFIG.HOST + '/api/unread?scope=total_count',
        success: function(data) {
            callback(data.result);
        }
    });
};

API.prototype.notificationsChanges = function(callback) {
    var key;

    var request = function(method, url, options, callback) {
        if (typeof options === 'function') {
            callback = options;
            options = null;
        }

        options = options || {};

        var contentType = options.contentType;
        var content = options.content;
        if (typeof content === 'object') {
            content = JSON.stringify(content);
            contentType = contentType || "application/json";
        }

        var dataType = options.dataType || 'json';

        $.ajax({
            type: method,
            url: url,
            dataType: dataType,
            contentType: contentType,
            data: content,
            success: function(resp, status, req) {
                if (req.status == 204) {
                    callback && callback(undefined);

                } else {
                    if (req.status == 200 || req.status == 201) {
                        callback && callback(undefined, resp);

                    } else {
                        callback && callback(resp);
                    }
                }
            },
            error: function(req, text, reason) {
                callback({error: text, reason: reason});
            }
    
        });
    };

    function listenChanges(key) {
        request('GET', this.CONFIG.HOST + '/api/changes?feed=longpoll' + (key? '&key=' + key: ''), function(error, data) {
            if (error) {
                setTimeout(listenChanges, 2000, key);

            } else {
                key = data.key;

                var docs = data.results;
                if (docs.length > 0) {
                    docs.forEach(callback);
                }

                listenChanges(key);
            }
        });
    }

    listenChanges();
};

// Extension part
(function() {
    var api = new API(CONFIG),
            bouncingIcon = $.bouncingIcon();

    var refreshCountTimeout;

    var TRIM_META_PATTERN_START = /^(\[[^\[]+\]|@[\w\d-_]+|#[\w\d-_]+|\s)+/gi,
            TRIM_META_PATTERN_END = /(\[[^\[]+\]|@[\w\d-_]+|#[\w\d-_]+|\s)+$/gi,
            tagsList = 'new inprogress finished delivered cancelled'.split(' ');

    function trimMeta(body) {
        return body && body.replace(TRIM_META_PATTERN_START, "").replace(TRIM_META_PATTERN_END, "");
    }

    api.init(function(userId) {
        
        function refreshCount() {
            clearTimeout(refreshCountTimeout);

            function doRequest() {
                api.getUnreadMessagesCount(function(count) {
                    setBadgeCount(count);
                });
            }

            refreshCountTimeout = setTimeout(doRequest, 1000);
        }
        
        api.notificationsChanges(function(doc) {
            if (!doc._rev)
                return;

            var rev = doc._rev.split('-')[0];
            if (rev != "1") {
                // Skip edited messages.
                return;
            }

            refreshCount();

            if (doc.created_by && doc.type == "status") {
                if (userId == doc.created_by.id)
                    return;

                if (doc.tags
                    && tagsList.indexOf(doc.tags[0]) != -1
                    && !trimMeta(doc.body)) {
                    return;
                }
                $.notification(doc);
            }
        });

        refreshCount();
        
    });
    
    function setBadgeCount(count) {
        // Do not bounce if number wasn't changed
        if (count == setBadgeCount.oldCount) return;
        
        setBadgeCount.oldCount = count;
        
        if (count == parseInt(count)) {
            chrome.browserAction.setBadgeBackgroundColor({
                color: [167, 203, 2, 255]
            });
            
            chrome.browserAction.setBadgeText({
                text: (count || 0).toString()
            });
        } else {
            chrome.browserAction.setBadgeBackgroundColor({
                color: [207, 70, 45, 255]
            });            
            chrome.browserAction.setBadgeText({
                text: '...'
            });
        }
        
        bouncingIcon.bounce();
    }
    
    setBadgeCount('offline');
    
    // Open tadagraph window on click
    chrome.browserAction.onClicked.addListener(function() {
        chrome.tabs.create({
            url: CONFIG.HOST
        });
    });
})();
