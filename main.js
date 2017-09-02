"use strict";

var utils =    require(__dirname + '/lib/utils'); // Get common adapter utils
var adapter = utils.adapter('lgtv-rs');
var net = require('net');
var lgtv_commands = require(__dirname + '/admin/commands.json'),
    COMMANDS = lgtv_commands.commands,
    COMMAND_MAPPINGS = lgtv_commands.command_mappings,
    VALUE_MAPPINGS = lgtv_commands.value_mappings,
    REMOTE_CMDS = lgtv_commands.remote;
var lgtv, recnt, connection = false;
var query = null;
var tabu = false;
var polling_time = 5000;
var states = {}, old_states = {};
var querycmd = [];

adapter.on('unload', function (callback) {
    if(lgtv){
        lgtv.destroy();
    }
    try {
        adapter.log.info('cleaned everything up...');
        callback();
    } catch (e) {
        callback();
    }
});

adapter.on('objectChange', function (id, obj) {
    // Warning, obj can be null if it was deleted
    adapter.log.info('objectChange ' + id + ' ' + JSON.stringify(obj));
});

adapter.on('stateChange', function (id, state) {
    if (connection){
        if (state && !state.ack) {
            adapter.log.debug('stateChange ' + id + ' ' + JSON.stringify(state));
            var ids = id.split(".");
            var name = ids[ids.length - 2].toString();
            var command = ids[ids.length - 1].toString();
            var val = [state.val];
            if (state.val === false || state.val === 'false'){
                val = 'off';
            } else if (state.val === true || state.val === 'true'){
                val = 'on';
            }

            var cmd = COMMAND_MAPPINGS[command];
            if(name == 'remote'){
                var key = 'mc 00 ' + REMOTE_CMDS[command];
                send(key);
            }
            if (cmd){

            } else {
                adapter.log.error('Error command =*' + cmd + '=' + val + '#');
            }
        }
    }
});

adapter.on('message', function (obj) {
    if (typeof obj == 'object' && obj.message) {
        if (obj.command == 'send') {
            console.log('send command');
            if (obj.callback) adapter.sendTo(obj.from, obj.command, 'Message received', obj.callback);
        }
    }
});

adapter.on('ready', function () {
    main();
    CreatObject();
    //json();
});


function json(){
    var cmd_mappings = {};
    var val_mappings = {};
    for (var key in COMMANDS) {
        cmd_mappings[COMMANDS[key]['name']] = key;
    }
    for (var key in COMMANDS) {
        //adapter.log.info('(var key in COMMANDS) key: ' + key);
        val_mappings[key] = {};
        for (var k in COMMANDS[key]['values']) {
            //adapter.log.info('(var k in COMMANDS[key][values]) k: ' + k);
            val_mappings[key][COMMANDS[key]['values'][k]['name']] = {};
            val_mappings[key][COMMANDS[key]['values'][k]['name']]['value'] = k;
            val_mappings[key][COMMANDS[key]['values'][k]['name']]['models'] = COMMANDS[key]['values'][k]['models'];
        }
    }
    adapter.log.debug('cmd_mappings: ' + JSON.stringify(cmd_mappings));
    adapter.log.debug('val_mappings: ' + JSON.stringify(val_mappings));
}

function main() {
    adapter.subscribeStates('*');
    for (var key in COMMANDS) {
        if(COMMANDS[key].values.hasOwnProperty('ff') && COMMANDS[key]['name'] !== 'power'){
            querycmd.push(key + ' 00 ' + 'ff');
        }
    }
    connect();
}

function connect(cb){
    adapter.config.host = '192.168.1.56';
    var in_msg = '';
    var host = adapter.config.host ? adapter.config.host : '192.168.1.56';
    var port = adapter.config.port ? adapter.config.port : 23;
    adapter.log.debug('LG TV ' + 'connect to: ' + host + ':' + port);
    var c = COMMAND_MAPPINGS['power'];
    var q = VALUE_MAPPINGS[c]['query']['value'];
    var check_cmd = c + ' 00 ' + q;
    lgtv = net.connect(port, host, function() {
        adapter.setState('info.connection', true, true);
        adapter.log.info('LG TV connected to: ' + host + ':' + port);
        clearInterval(query);
        query = setInterval(function() {
            if(!tabu){
               send(check_cmd);
            }
        }, polling_time);
        if(cb){cb();}
    });
    lgtv.on('data', function(chunk) {
        in_msg += chunk;
        if(in_msg.length == 10){
            //in_msg = in_msg.slice(1, 35);
            //adapter.log.debug("LG TV incomming: " + in_msg);
            parse(in_msg);
            in_msg = '';
        }
    });

    lgtv.on('error', function(e) {
        err(e);
    });

    lgtv.on('close', function(e) {
        if(connection){
            err('LG TV disconnected');
        }
        reconnect();
    });
}

function parse(msg){
    //a 01 OK01x
    var req = {};
    if (msg[msg.length - 1] == 'x'){
        req.cmd = msg[0];
        req.id  = msg[2] + msg[3];
        req.ack = getack(msg[5] + msg[6]);
        req.val = msg[7] + msg[8];
    }
    adapter.log.debug("req:" + JSON.stringify(req));
    if(req.ack){
        for (var key in COMMANDS) {
            if(key[1] == req.cmd){
                var obj = COMMANDS[key].name;
                if(COMMANDS[key]['values'][req.val]['name']){
                    var val = COMMANDS[key]['values'][req.val]['name'];
                    states[obj] = toBool(val);
                    //adapter.log.debug("obj:" + val);
                    if(states[obj] !== old_states[obj]){
                        old_states[obj] = states[obj];
                        setObject(obj, states[obj]);
                    }
                    if(obj == 'power'){
                        //states[obj] = true; //for debug
                        if(states[obj] == true){
                            get_commands();
                        }
                    }
                } else {
                    adapter.log.error("Error not found name in " + COMMANDS[key]['values'][req.val]);
                }
            }
        }
        adapter.log.debug("states:" + JSON.stringify(states));
    } else if (req.val == '00'){
        adapter.log.error('Illegal Code');
    }
}

function get_commands(){
    tabu = true;
    var tm = 2000;
    var interval;
    setTimeout(function (){
        tabu = false;
    }, (querycmd.length * tm));
    querycmd.forEach(function(cmd, i, arr) {
        interval = tm * i;
        setTimeout(function() {
            send(cmd);
        }, interval);
    });
}

function send(cmd){
    if (cmd !== undefined){
        cmd = cmd + '\n\r';
        adapter.log.debug('Send Command: ' + cmd);
        lgtv.write(cmd);
        //tabu = false;
    }
}

function setObject(name, val){
    var type = 'string';
    var role = 'media';
    adapter.log.debug('name:' + name);
    var odj_cmd = COMMANDS[COMMAND_MAPPINGS[name]];
    if(VALUE_MAPPINGS[COMMAND_MAPPINGS[name]]){
        var obj_val = VALUE_MAPPINGS[COMMAND_MAPPINGS[name]];
        //adapter.log.debug('odj_cmd:' + JSON.stringify(odj_cmd));
        adapter.getState(odj_cmd, function (err, state){
            if (odj_cmd){
                if ((err || !state) && odj_cmd.hasOwnProperty('description')){
                    if (odj_cmd.hasOwnProperty('values')){
                        if (obj_val.hasOwnProperty('on') || obj_val.hasOwnProperty('off')){
                            type = 'boolean';
                        } else {
                            role = 'indicator';
                        }
                    }
                    adapter.setObject(name, {
                        type:   'state',
                        common: {
                            name: odj_cmd.description,
                            desc: odj_cmd.description,
                            type: type,
                            role: role
                        },
                        native: {}
                    });
                    adapter.setState(name, {val: val, ack: true});
                } else {
                    adapter.setState(name, {val: val, ack: true});
                }
            }
        });
    } else {
        adapter.log.error('Error VALUE_MAPPINGS[' + name + ']');
    }
}

function toBool(s){
    if(s == 'on'){
        s = true;
    } else {
        s = false;
    }
    return s;
}

function getack(s){
    if(s == 'OK'){
        s = true;
    } else {
        s = false;
    }
    return s;
}

function reconnect(){
    clearInterval(query);
    clearTimeout(recnt);
    lgtv.destroy();
    adapter.setState('info.connection', false, true);
    adapter.log.info('Reconnect after 60 sec...');
    connection = false;
    recnt = setTimeout(function() {
        connect();
    }, 5000);
}

function err(e){
    if (e){
        adapter.log.error("LG TV " + e);
        clearInterval(query);
        adapter.log.error('Error socket: Reconnect after 15 sec...');
        adapter.setState('info.connection', false, true);
        setTimeout(function() {
            main();
        }, 15000);
    }
}

function CreatObject(){
    var arr = [];
    var interval, t = 1000;
    adapter.getState('remote.0', function (err, state){
        if ((err || !state)){
            for (var key in REMOTE_CMDS) {
                arr.push(key);
            }
            arr.forEach(function(cmd, i) {
                interval = t * i;
                setTimeout(function() {
                    adapter.setObject('remote.' + cmd, {
                        type:   'state',
                        common: {
                            name: cmd,
                            desc: 'remote key ' + cmd,
                            type: 'boolean',
                            role: 'button'
                        },
                        native: {}
                    });
                    adapter.setState('remote.' + cmd, {val: false, ack: true});
                }, interval);
            });
        }
    });
}

/*

 */