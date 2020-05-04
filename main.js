"use strict";
const utils = require('@iobroker/adapter-core');
let net = require('net');
let lgtv_commands = require(__dirname + '/admin/commands.json'),
    COMMANDS = lgtv_commands.commands,
    COMMAND_MAPPINGS = lgtv_commands.command_mappings,
    VALUE_MAPPINGS = lgtv_commands.value_mappings,
    REMOTE_CMDS = lgtv_commands.remote;
let adapter, lgtv, recnt, connection = false, query = null, tabu = false, polling_time = 5000, states = {}, old_states = {}, querycmd = [], remote_command_send = false;

function startAdapter(options){
    return adapter = utils.adapter(Object.assign({}, options, {
        systemConfig: true,
        name:         'lgtv-rs',
        ready:        main,
        unload:       callback => {
            query && clearInterval(query);
            recnt && clearTimeout(recnt);
            /*timeoutPoll && clearTimeout(timeoutPoll);
            reconnectTimeOut && clearTimeout(reconnectTimeOut);
            timeout && clearTimeout(timeout);*/
            try {
                lgtv && lgtv.destroy();
                adapter.log.debug('cleaned everything up...');
                callback();
            } catch (e) {
                callback();
            }
        },
        stateChange:  (id, state) => {
            if (connection){
                if (id && state && !state.ack){
                    adapter.log.debug(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
                    tabu = true;
                    let ids = id.split(".");
                    let name = ids[ids.length - 2].toString();
                    let command = ids[ids.length - 1].toString();
                    let val = [state.val];
                    if (state.val === false || state.val === 'false'){
                        val = 'off';
                    } else if (state.val === true || state.val === 'true'){
                        val = 'on';
                    }
                    let cmd = COMMAND_MAPPINGS[command];
                    let key;
                    if (name === 'remote'){
                        remote_command_send = true;
                        key = 'mc 00 ' + REMOTE_CMDS[command];
                        send(key);
                    } else {
                        if (cmd){
                            if (VALUE_MAPPINGS[cmd][command]){
                                if (~VALUE_MAPPINGS[cmd][command]['value'].indexOf(',')){
                                    key = cmd + ' 00 ' + (parseInt(val)).toString(16);
                                }
                            } else {
                                if (VALUE_MAPPINGS[cmd][val]['value']){
                                    key = cmd + ' 00 ' + VALUE_MAPPINGS[cmd][val]['value'];
                                }
                            }
                            send(key);
                        } else {
                            adapter.log.error('Error command ' + cmd);
                        }
                    }
                }
            } else {
                adapter.log.debug('Send command error - MPD NOT connected!');
            }
        }
    }));
}

function json(){
    let cmd_mappings = {};
    let val_mappings = {};
    let key;
    let file = lgtv_commands;
    for (key in COMMANDS) {
        if (COMMANDS.hasOwnProperty(key)){
            cmd_mappings[COMMANDS[key]['name']] = key;
        }
    }
    for (key in COMMANDS) {
        if (COMMANDS.hasOwnProperty(key)){
            //adapter.log.info('(let key in COMMANDS) key: ' + key);
            val_mappings[key] = {};
            for (let k in COMMANDS[key]['values']) {
                if (COMMANDS[key]['values'].hasOwnProperty(k)){
                    //adapter.log.info('(let k in COMMANDS[key][values]) k: ' + k);
                    val_mappings[key][COMMANDS[key]['values'][k]['name']] = {};
                    val_mappings[key][COMMANDS[key]['values'][k]['name']]['value'] = k;
                    val_mappings[key][COMMANDS[key]['values'][k]['name']]['models'] = COMMANDS[key]['values'][k]['models'];
                }
            }
        }
    }
    file.command_mappings = cmd_mappings;
    file.value_mappings = val_mappings;
}

function main(){
    adapter.subscribeStates('*');
    CreatObject();
    for (let key in COMMANDS) {
        if (COMMANDS.hasOwnProperty(key)){
            if (COMMANDS[key].values.hasOwnProperty('ff') && COMMANDS[key]['name'] !== 'power'){
                querycmd.push(key + ' 00 ' + 'ff');
            }
        }
    }
    connect();
}

function connect(cb){
    //adapter.config.host = '192.168.1.56';
    let in_msg = '';
    let host = adapter.config.host ? adapter.config.host :'192.168.1.56';
    let port = adapter.config.port ? adapter.config.port :23;
    adapter.log.debug('LG TV ' + 'connect to: ' + host + ':' + port);
    let c = COMMAND_MAPPINGS['power'];
    let q = VALUE_MAPPINGS[c]['query']['value'];
    let check_cmd = c + ' 00 ' + q;
    lgtv = net.connect(port, host, () => {
        adapter.setState('info.connection', true, true);
        adapter.log.info('LG TV connected to: ' + host + ':' + port);
        connection = true;
        clearInterval(query);
        query = setInterval(() => {
            if (!tabu){
                send(check_cmd);
            }
        }, polling_time);
        if (cb){
            cb();
        }
    });
    lgtv.on('data', (chunk) => {
        in_msg += chunk;
        if (in_msg[9] === 'x'){
            if (in_msg.length > 10){
                in_msg = in_msg.substring(0, 10);
            }
            adapter.log.debug("LG TV incomming: " + in_msg);
            parse(in_msg);
            in_msg = '';
        }
        if (in_msg.length > 15){
            in_msg = '';
        }
    });

    lgtv.on('error', (e) => {
        if (e.code === "ENOTFOUND" || e.code === "ECONNREFUSED" || e.code === "ETIMEDOUT"){
            lgtv.destroy();
        }
        err(e);
    });

    lgtv.on('close', (e) => {
        if (connection){
            err('LG TV disconnected');
        }
        reconnect();
    });
}

function parse(msg){
    let req = {};
    if (msg[msg.length - 1] === 'x'){
        req.cmd = msg[0];
        req.id = msg[2] + msg[3];
        req.ack = getack(msg[5] + msg[6]);
        req.val = msg[7] + msg[8];
    }
    adapter.log.debug("req: " + JSON.stringify(req));
    if (req.ack){
        let val;
        for (let key in COMMANDS) {
            if (COMMANDS.hasOwnProperty(key)){
                if (key[1] === req.cmd && !remote_command_send){
                    let obj = COMMANDS[key].name;
                    if (VALUE_MAPPINGS[key][obj]){
                        if (~VALUE_MAPPINGS[key][obj]['value'].indexOf(',')){
                            val = parseInt(req.val, 16);
                        }
                    } else {
                        if (COMMANDS[key]['values'][req.val]['name']){
                            val = COMMANDS[key]['values'][req.val]['name'];
                        } else {
                            adapter.log.error("Error not found name in " + COMMANDS[key]['values'][req.val]);
                        }
                    }
                    states[obj] = toBool(val);
                    //adapter.log.debug("obj:" + val);
                    if (states[obj] !== old_states[obj]){
                        old_states[obj] = states[obj];
                        setObject(obj, states[obj]);
                    }
                    if (obj === 'power'){
                        //states[obj] = true; //for debug
                        if (states[obj] === true){
                            get_commands();
                        }
                    }
                } else if (remote_command_send && key[1] === req.cmd){
                    remote_command_send = false;
                    for (let key in REMOTE_CMDS) {
                        if (REMOTE_CMDS.hasOwnProperty(key)){
                            if (REMOTE_CMDS[key] === req.val){
                                adapter.log.debug("Remote cmd OK! key: { " + key + " } key, val: {" + req.val + "}");
                                break;
                            }
                        }
                    }
                }
            }
        }
        //adapter.log.debug("states:" + JSON.stringify(states));
    } else if (req.val === '00'){
        adapter.log.debug('Illegal Code');
    }
}

function get_commands(){
    tabu = true;
    let tm = 5000;
    let interval;
    setTimeout(() => {
        tabu = false;
    }, (querycmd.length * tm));
    querycmd.forEach((cmd, i, arr) => {
        interval = tm * i;
        setTimeout(() => {
            cmd = cmd + '\n\r';
            adapter.log.debug('Send Command: ' + cmd);
            lgtv.write(cmd);
        }, interval);
    });
}

function send(cmd){
    if (cmd !== undefined){
        cmd = cmd + '\n\r';
        adapter.log.debug('Send Command: ' + cmd);
        lgtv.write(cmd);
        tabu = false;
    }
}

function setObject(name, val){
    let type = 'string';
    let role = 'media';
    adapter.log.debug('name:' + name);
    let odj_cmd = COMMANDS[COMMAND_MAPPINGS[name]];
    let obj_val;
    if (VALUE_MAPPINGS[COMMAND_MAPPINGS[name]]){
        obj_val = VALUE_MAPPINGS[COMMAND_MAPPINGS[name]];
        //adapter.log.debug('odj_cmd:' + JSON.stringify(odj_cmd));
        adapter.getObject(odj_cmd, (err, state) => {
            if (odj_cmd){
                if ((err || !state) && odj_cmd.hasOwnProperty('description')){
                    if (odj_cmd.hasOwnProperty('values')){
                        /*if (obj_val.hasOwnProperty('on') || obj_val.hasOwnProperty('off')){
                            type = 'boolean';
                        } else {
                            role = 'indicator';
                        }*/
                        role = 'indicator';
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
    if (s === 'on'){
        s = true;
    } else if (s === 'off'){
        s = false;
    }
    return s;
}

function getack(s){
    s = s === 'OK';
    return s;
}

function reconnect(){
    query && clearInterval(query);
    recnt && clearTimeout(recnt);
    lgtv.destroy();
    adapter.setState('info.connection', false, true);
    adapter.log.info('Reconnect after 60 sec...');
    connection = false;
    recnt = setTimeout(() => {
        connect();
    }, 60000);
}

function err(e){
    e = e.toString();
    if (e){
        clearInterval(query);
        if (!~e.indexOf('ECONNREFUSED')){
            adapter.log.error("LG TV " + e);
            adapter.log.error('Error socket: Reconnect after 15 sec...');
            adapter.setState('info.connection', false, true);
            connection = false;
            setTimeout(() => {
                //main();
                connect();
            }, 15000);
        }
    }
}

function CreatObject(){
    let arr = [];
    let interval, t = 1000;
    adapter.getObject('remote.0', (err, state) => {
        if ((err || !state)){
            for (let key in REMOTE_CMDS) {
                if (REMOTE_CMDS.hasOwnProperty(key)){
                    arr.push(key);
                }
            }
            arr.forEach((cmd, i) => {
                interval = t * i;
                setTimeout(() => {
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

if (module.parent){
    module.exports = startAdapter;
} else {
    startAdapter();
}