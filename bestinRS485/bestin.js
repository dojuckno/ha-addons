/**
 * RS485 Homegateway for Bestin Homenet
 * @소스 공개 : Daehwan, Kang
 * @베스틴 홈넷용으로 수정 : harwin
 * @수정일 2022-12-14
 */

const util = require('util');
const net = require('net');
const SerialPort = require('serialport').SerialPort;
const mqtt = require('mqtt');

// 커스텀 파서
const Transform = require('stream').Transform;

const CONFIG = require('/data/options.json');  //**** 애드온의 옵션을 불러옵니다. 이후 CONFIG.mqtt.username 과 같이 사용가능합니다. 

// 각 디바이스 설정
const energyVar = {
    type: CONFIG.energy.type,
    serName: CONFIG.energy.serName,
    addr: CONFIG.energy.address,
    port: CONFIG.energy.port
};
const controlVar = {
    type: CONFIG.control.type,
    serName: CONFIG.control.serName,
    addr: CONFIG.control.address,
    port: CONFIG.control.port
};
const smart1Var = {
    type: CONFIG.smart1.type,
    serName: CONFIG.smart1.serName,
    addr: CONFIG.smart1.address,
    port: CONFIG.smart1.port
};
const smart2Var = {
    type: CONFIG.smart2.type,
    serName: CONFIG.smart2.serName,
    addr: CONFIG.smart2.address,
    port: CONFIG.smart2.port
};

// MQTT 설정
const mqttVar = {
    broker: CONFIG.mqtt.broker,
    port: CONFIG.mqtt.port,
    username: CONFIG.mqtt.username,
    password: CONFIG.mqtt.password,
    clientId: 'bestin_ipark',
    topic_prefix: CONFIG.mqtt.prefix,
    state_topic: CONFIG.mqtt.prefix + '/%s%s/%s/state',
    device_topic: CONFIG.mqtt.prefix + '/+/+/command'
};

const CONST = {
    // 포트이름 설정
    portEN: process.platform.startsWith('win') ? energyVar.serName : energyVar.serName,
    portCTRL: process.platform.startsWith('win') ? controlVar.serName : controlVar.serName,
    portRECV: process.platform.startsWith('win') ? smart1Var.serName : smart1Var.serName,
    portSEND: process.platform.startsWith('win') ? smart2Var.serName : smart2Var.serName,
    // SerialPort Delay(ms)
    SEND_DELAY: CONFIG.sendDelay,
    MAX_RETRY: CONFIG.maxRetry,
    // MQTT 수신 Delay(ms)
    MQTT_DELAY: CONFIG.mqtt.receiveDelay,
    // 메시지 Prefix 상수
    MSG_PREFIX: [0x02],
    MSG_HEADER: [0x31, 0x41, 0x42, 0xD1, 0x28, 0x61, 0xC1],
    // 디바이스 Hex코드
    DEVICE_STATE: [
        { deviceId: 'Room', subId: '' },
        { deviceId: 'Gas', subId: '' },
        { deviceId: 'Doorlock', subId: '' },
        { deviceId: 'Fan', subId: '' },
        { deviceId: 'Thermo', subId: '' },
        { deviceId: 'Elevator', subId: '' }],

    DEVICE_COMMAND: [
        { deviceId: 'Room', subId: '1', commandHex: Buffer.alloc(13, '02310D010001810000000004C6', 'hex'), light1: 'ON' },
        { deviceId: 'Room', subId: '1', commandHex: Buffer.alloc(13, '02310D01000101000000000042', 'hex'), light1: 'OFF' },
        { deviceId: 'Room', subId: '1', commandHex: Buffer.alloc(13, '02310D010001820000000004C1', 'hex'), light2: 'ON' },
        { deviceId: 'Room', subId: '1', commandHex: Buffer.alloc(13, '02310D01000102000000000045', 'hex'), light2: 'OFF' },
        { deviceId: 'Room', subId: '1', commandHex: Buffer.alloc(13, '02310D010001840000000004BB', 'hex'), light3: 'ON' },
        { deviceId: 'Room', subId: '1', commandHex: Buffer.alloc(13, '02310D0100010400000000003F', 'hex'), light3: 'OFF' },
        { deviceId: 'Room', subId: '1', commandHex: Buffer.alloc(13, '02310D010001880000000004BF', 'hex'), light4: 'ON' },
        { deviceId: 'Room', subId: '1', commandHex: Buffer.alloc(13, '02310D0100010800000000003B', 'hex'), light4: 'OFF' },  //방1
        { deviceId: 'Room', subId: '2', commandHex: Buffer.alloc(13, '02310D010002810000000004C3', 'hex'), light1: 'ON' },
        { deviceId: 'Room', subId: '2', commandHex: Buffer.alloc(13, '02310D01000201000000000047', 'hex'), light1: 'OFF' },
        { deviceId: 'Room', subId: '2', commandHex: Buffer.alloc(13, '02310D010002820000000004C4', 'hex'), light2: 'ON' },
        { deviceId: 'Room', subId: '2', commandHex: Buffer.alloc(13, '02310D01000202000000000048', 'hex'), light2: 'OFF' },  //방2
        { deviceId: 'Room', subId: '3', commandHex: Buffer.alloc(13, '02310D010003810000000004C8', 'hex'), light1: 'ON' },
        { deviceId: 'Room', subId: '3', commandHex: Buffer.alloc(13, '02310D01000301000000000044', 'hex'), light1: 'OFF' },
        { deviceId: 'Room', subId: '3', commandHex: Buffer.alloc(13, '02310D010003820000000004C7', 'hex'), light2: 'ON' },
        { deviceId: 'Room', subId: '3', commandHex: Buffer.alloc(13, '02310D01000302000000000043', 'hex'), light2: 'OFF' },  //방3
        { deviceId: 'Room', subId: '4', commandHex: Buffer.alloc(13, '02310D010004810000000004C5', 'hex'), light1: 'ON' },
        { deviceId: 'Room', subId: '4', commandHex: Buffer.alloc(13, '02310D01000401000000000041', 'hex'), light1: 'OFF' },
        { deviceId: 'Room', subId: '4', commandHex: Buffer.alloc(13, '02310D010004820000000004BA', 'hex'), light2: 'ON' },
        { deviceId: 'Room', subId: '4', commandHex: Buffer.alloc(13, '02310D0100040200000000003E', 'hex'), light2: 'OFF' },  //방4
        { deviceId: 'Room', subId: '5', commandHex: Buffer.alloc(13, '02310D010005810000000004BA', 'hex'), light1: 'ON' },
        { deviceId: 'Room', subId: '5', commandHex: Buffer.alloc(13, '02310D0100050100000000003E', 'hex'), light1: 'OFF' },
        { deviceId: 'Room', subId: '5', commandHex: Buffer.alloc(13, '02310D010005820000000004C5', 'hex'), light2: 'ON' },
        { deviceId: 'Room', subId: '5', commandHex: Buffer.alloc(13, '02310D01000502000000000041', 'hex'), light2: 'OFF' },  //방5

        { deviceId: 'Room', subId: '1', commandHex: Buffer.alloc(13, '02310D010001008100000009CB', 'hex'), outlet1: 'ON' },
        { deviceId: 'Room', subId: '1', commandHex: Buffer.alloc(13, '02310D01000100010000000044', 'hex'), outlet1: 'OFF' },
        { deviceId: 'Room', subId: '1', commandHex: Buffer.alloc(13, '02310D010001008200000012D3', 'hex'), outlet2: 'ON' },
        { deviceId: 'Room', subId: '1', commandHex: Buffer.alloc(13, '02310D01000100020000000041', 'hex'), outlet2: 'OFF' },  //방1
        { deviceId: 'Room', subId: '2', commandHex: Buffer.alloc(13, '02310D010002008100000009CE', 'hex'), outlet1: 'ON' },
        { deviceId: 'Room', subId: '2', commandHex: Buffer.alloc(13, '02310D01000200010000000045', 'hex'), outlet1: 'OFF' },
        { deviceId: 'Room', subId: '2', commandHex: Buffer.alloc(13, '02310D010002008200000012D6', 'hex'), outlet2: 'ON' },
        { deviceId: 'Room', subId: '2', commandHex: Buffer.alloc(13, '02310D01000200020000000048', 'hex'), outlet2: 'OFF' },  //방2
        { deviceId: 'Room', subId: '3', commandHex: Buffer.alloc(13, '02310D010003008100000009CD', 'hex'), outlet1: 'ON' },
        { deviceId: 'Room', subId: '3', commandHex: Buffer.alloc(13, '02310D01000300010000000046', 'hex'), outlet1: 'OFF' },
        { deviceId: 'Room', subId: '3', commandHex: Buffer.alloc(13, '02310D010003008200000012D5', 'hex'), outlet2: 'ON' },
        { deviceId: 'Room', subId: '3', commandHex: Buffer.alloc(13, '02310D01000300020000000047', 'hex'), outlet2: 'OFF' },  //방3
        { deviceId: 'Room', subId: '4', commandHex: Buffer.alloc(13, '02310D010004008100000009B8', 'hex'), outlet1: 'ON' },
        { deviceId: 'Room', subId: '4', commandHex: Buffer.alloc(13, '02310D0100040001000000003F', 'hex'), outlet1: 'OFF' },
        { deviceId: 'Room', subId: '4', commandHex: Buffer.alloc(13, '02310D010004008200000012B0', 'hex'), outlet2: 'ON' },
        { deviceId: 'Room', subId: '4', commandHex: Buffer.alloc(13, '02310D0100040002000000003E', 'hex'), outlet2: 'OFF' },  //방4
        { deviceId: 'Room', subId: '5', commandHex: Buffer.alloc(13, '02310D010005008100000009B7', 'hex'), outlet1: 'ON' },
        { deviceId: 'Room', subId: '5', commandHex: Buffer.alloc(13, '02310D01000500010000000040', 'hex'), outlet1: 'OFF' },
        { deviceId: 'Room', subId: '5', commandHex: Buffer.alloc(13, '02310D010005008200000012AF', 'hex'), outlet2: 'ON' },
        { deviceId: 'Room', subId: '5', commandHex: Buffer.alloc(13, '02310D0100050002000000003D', 'hex'), outlet2: 'OFF' },  //방5

        { deviceId: 'Room', subId: '1', commandHex: Buffer.alloc(13, '02310D010001000083000000C0', 'hex'), idlePower: 'ON' },
        { deviceId: 'Room', subId: '1', commandHex: Buffer.alloc(13, '02310D01000100000300000040', 'hex'), idlePower: 'OFF' },
        { deviceId: 'Room', subId: '2', commandHex: Buffer.alloc(13, '02310D010002000083000000C5', 'hex'), idlePower: 'ON' },
        { deviceId: 'Room', subId: '2', commandHex: Buffer.alloc(13, '02310D01000200000300000045', 'hex'), idlePower: 'OFF' },
        { deviceId: 'Room', subId: '3', commandHex: Buffer.alloc(13, '02310D010003000083000000C6', 'hex'), idlePower: 'ON' },
        { deviceId: 'Room', subId: '3', commandHex: Buffer.alloc(13, '02310D01000300000300000046', 'hex'), idlePower: 'OFF' },
        { deviceId: 'Room', subId: '4', commandHex: Buffer.alloc(13, '02310D010004000083000000C3', 'hex'), idlePower: 'ON' },
        { deviceId: 'Room', subId: '4', commandHex: Buffer.alloc(13, '02310D01000400000300000043', 'hex'), idlePower: 'OFF' },
        { deviceId: 'Room', subId: '5', commandHex: Buffer.alloc(13, '02310D010005000083000000BC', 'hex'), idlePower: 'ON' },
        { deviceId: 'Room', subId: '5', commandHex: Buffer.alloc(13, '02310D0100050000030000003C', 'hex'), idlePower: 'OFF' },

        { deviceId: 'Fan', subId: '', commandHex: Buffer.alloc(10, '0261010000010100006E', 'hex'), power: 'ON' }, //켜짐
        { deviceId: 'Fan', subId: '', commandHex: Buffer.alloc(10, '0261010000000100006B', 'hex'), power: 'OFF' }, //꺼짐
        { deviceId: 'Fan', subId: '', commandHex: Buffer.alloc(10, '0261030000000100006D', 'hex'), preset: 'low' }, //약(켜짐)
        { deviceId: 'Fan', subId: '', commandHex: Buffer.alloc(10, '0261030000000200006C', 'hex'), preset: 'medium' }, //중(켜짐)
        { deviceId: 'Fan', subId: '', commandHex: Buffer.alloc(10, '0261030000000300006B', 'hex'), preset: 'high' }, //강(켜짐)
        { deviceId: 'Fan', subId: '', commandHex: Buffer.alloc(10, '0261070000100000007A', 'hex'), preset: 'nature OFF' }, //자연환기(꺼짐)
        { deviceId: 'Fan', subId: '', commandHex: Buffer.alloc(10, '0261070000000000006A', 'hex'), preset: 'nature ON' }, //자연환기(켜짐)

        { deviceId: 'Thermo', subId: '1', commandHex: Buffer.alloc(14, '02280E1200010100000000000040', 'hex'), power: 'heat' }, // 온도조절기1-ON
        { deviceId: 'Thermo', subId: '1', commandHex: Buffer.alloc(14, '02280E1200010200000000000041', 'hex'), power: 'off' }, // 온도조절기1-OFF
        { deviceId: 'Thermo', subId: '2', commandHex: Buffer.alloc(14, '02280E120002010000000000003B', 'hex'), power: 'heat' },
        { deviceId: 'Thermo', subId: '2', commandHex: Buffer.alloc(14, '02280E120002020000000000003E', 'hex'), power: 'off' },
        { deviceId: 'Thermo', subId: '3', commandHex: Buffer.alloc(14, '02280E120003010000000000003E', 'hex'), power: 'heat' },
        { deviceId: 'Thermo', subId: '3', commandHex: Buffer.alloc(14, '02280E120003020000000000003B', 'hex'), power: 'off' },
        { deviceId: 'Thermo', subId: '4', commandHex: Buffer.alloc(14, '02280E1200040100000000000039', 'hex'), power: 'heat' },
        { deviceId: 'Thermo', subId: '4', commandHex: Buffer.alloc(14, '02280E1200040200000000000038', 'hex'), power: 'off' },
        { deviceId: 'Thermo', subId: '5', commandHex: Buffer.alloc(14, '02280E120005010000000000003C', 'hex'), power: 'heat' },
        { deviceId: 'Thermo', subId: '5', commandHex: Buffer.alloc(14, '02280E120005020000000000003D', 'hex'), power: 'off' },
        { deviceId: 'Thermo', subId: '1', commandHex: Buffer.alloc(14, '02280E12FF0100FF0000000000FF', 'hex'), setTemp: '' }, // 온도조절기1-온도설정
        { deviceId: 'Thermo', subId: '2', commandHex: Buffer.alloc(14, '02280E12FF0200FF0000000000FF', 'hex'), setTemp: '' },
        { deviceId: 'Thermo', subId: '3', commandHex: Buffer.alloc(14, '02280E12FF0300FF0000000000FF', 'hex'), setTemp: '' },
        { deviceId: 'Thermo', subId: '4', commandHex: Buffer.alloc(14, '02280E12FF0400FF0000000000FF', 'hex'), setTemp: '' },
        { deviceId: 'Thermo', subId: '5', commandHex: Buffer.alloc(14, '02280E12FF0500FF0000000000FF', 'hex'), setTemp: '' },

        { deviceId: 'Gas', subId: '', commandHex: Buffer.alloc(10, '0231020000000000003D', 'hex'), power: 'OFF' },
        { deviceId: 'Doorlock', subId: '', commandHex: Buffer.alloc(10, '0241020001000000004E', 'hex'), power: 'ON' },
        { deviceId: 'Elevator', subId: '', commandHex: Buffer.alloc(12), power: 'ON' }],

    // 상태 Topic (/homenet/${deviceId}${subId}/${property}/state/ = ${value})
    // 명령어 Topic (/homenet/${deviceId}${subId}/${property}/command/ = ${value})
    TOPIC_PRFIX: mqttVar.topic_prefix,
    STATE_TOPIC: mqttVar.state_topic,  //상태 전달
    DEVICE_TOPIC: mqttVar.device_topic //명령 수신
};

// 베스틴 홈넷용 시리얼 통신 파서 : 메시지 길이나 구분자가 불규칙하여 별도 파서 정의
class CustomParser {
    constructor(options) {
        util.inherits(CustomParser, Transform);
        Transform.call(this, options);
        this._queueChunk = [];
        this._msgLenCount = 0;
        this._msgLength = 0;
        this._msgTypeFlag = false;
        //this._wallpadType = CONST.WALLPAD_TYPE;
    }
    _transform(chunk, encoding, done) {
        var start = 0;
        for (var i = 0; i < chunk.length; i++) {
            if (CONST.MSG_PREFIX.includes(chunk[i]) && CONST.MSG_HEADER.includes(chunk[i + 1])) {
                this._queueChunk.push(chunk.slice(start, i));
                this.push(Buffer.concat(this._queueChunk));
                this._queueChunk = [];
                this._msgLenCount = 0;
                start = i;
                this._msgTypeFlag = true;
            }

            else if (this._msgTypeFlag) {
                let length;
                switch (chunk[i + 2]) {
                    case 0x07:
                        length = 7; break;
                    case 0x08:
                        length = 8; break;
                    case 0x00: case 0x80:
                        length = 10; break;
                    case 0x10:
                        length = 16; break;
                    case 0x30:
                        length = 20; break;
                    case 0x15:
                        length = 21; break;
                    case 0x1e:
                        length = 30; break;
                    default:
                        length = 0;
                }
                this._msgLength = length;
                this._msgTypeFlag = false;
            }
            if (this._msgLenCount == this._msgLength - 1) { // 전체 메시지를 읽었을 경우
                this._queueChunk.push(chunk.slice(start, i + 1)); // 구분자 앞부분을 큐에 저장하고
                this.push(Buffer.concat(this._queueChunk)); // 큐에 저장된 메시지들 합쳐서 내보냄
                this._queueChunk = []; // 큐 초기화
                this._msgLenCount = 0;
                start = i + 1;
            } else {
                this._msgLenCount++;
            }
        }
        this._queueChunk.push(chunk.slice(start));
        done();
    }
}

// 로그 표시 
var log = (...args) => console.log('[' + new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) + ']', args.join(' '));

// 홈컨트롤 상태
var homeStatus = {};
var lastReceive = new Date().getTime();   //serial
var lastReceive2 = new Date().getTime();  //socket
var mqttReady = false;
var queue = new Array();
var retryCnt = 0;  // 수정금지
var packet1 = {};  //smart
var packet2 = {};  //smart

// MQTT-Broker 연결 
const client = mqtt.connect('mqtt://' + mqttVar.broker, {
    port: mqttVar.port,
    username: mqttVar.username,
    password: mqttVar.password,
    clientId: mqttVar.clientId,
}, log("INFO   initialize mqtt..."));
client.on('connect', () => {
    log("INFO   MQTT connection successful!", "(" + mqttVar.broker, mqttVar.port + ")");
    client.subscribe(CONST.DEVICE_TOPIC, (err) => { if (err) log('ERROR   MQTT subscribe fail! -', CONST.DEVICE_TOPIC) });
});
client.on('error', err => {
    if (err.code == "ECONNREFUSED") {
        log("ERROR   Make sure mqtt broker is enabled")
    } else { log("ERROR   MQTT connection failed: " + err.message); }
});
client.on("offline", () => {
    log("WARNING   MQTT currently offline. Please check mqtt broker!");
});
client.on("reconnect", () => {
    log("INFO   MQTT reconnection starting...");
});

// Energy
if (energyVar.type == 'serial') {
    log('INFO   Energy connection type: Serial')
    log('INFO   initialize serial...')
    energy485 = new SerialPort({
        path: CONST.portEN,
        baudRate: 9600,
        dataBits: 8,
        parity: 'none',
        stopBits: 1,
        autoOpen: false,
        encoding: 'hex'
    });
    energy = energy485.pipe(new CustomParser());
    energy485.on('open', () => log('INFO   Success open energy port:', CONST.portEN));
    energy485.on('close', () => log('WARNING   Close energy port:', CONST.portEN));
    energy485.open((err) => {
        if (err) {
            return log('ERROR  Failed to open energy port:', err.message);
        }
    });
}
else {
    log('INFO   Energy connection type: Socket')
    log('INFO   initialize socket...')
    energy485 = new net.Socket();
    energy485.connect(energyVar.port, energyVar.addr, function () {
        log('INFO   Success connected to energy', "(" + energyVar.addr, energyVar.port + ")");
    });
    energy485.on('error', (err) => {
        log('ERROR   Energy connection failed:', err.message)
    });
    energy = energy485.pipe(new CustomParser());
}

// Control 
if (controlVar.type == 'serial') {
    log('INFO   Control connection type: Serial')
    log('INFO   initialize serial...')
    control485 = new SerialPort({
        path: CONST.portCTRL,
        baudRate: 9600,
        dataBits: 8,
        parity: 'none',
        stopBits: 1,
        autoOpen: false,
        encoding: 'hex'
    });
    control = control485.pipe(new CustomParser());
    control485.on('open', () => log('INFO   Success open control port:', CONST.portCTRL));
    control485.on('close', () => log('WARNING   Close control port:', CONST.portCTRL));
    control485.open((err) => {
        if (err) {
            return log('ERROR   Failed to open control port:', err.message);
        }
    });
}
else {
    log('INFO   Control connection type: Socket')
    log('INFO   initialize socket...')
    control485 = new net.Socket();
    control485.connect(controlVar.port, controlVar.addr, function () {
        log('INFO   Success connected to control', "(" + controlVar.addr, controlVar.port + ")");
    });
    control485.on('error', (err) => {
        if (err.code == "ETIMEDOUT") {
            log("ERROR   Make sure socket is activated")
        } else { log('ERROR   Control connection failed:', err.message) }
    });
    control = control485.pipe(new CustomParser());
}

// Smart1
if (smart1Var.type == 'serial') {
    log('INFO   Smart1 connection type: Serial')
    log('INFO   initialize serial...')
    smart1485 = new SerialPort({
        path: CONST.portRECV,
        baudRate: 9600,
        dataBits: 8,
        parity: 'none',
        stopBits: 1,
        autoOpen: false,
        encoding: 'hex'
    });
    smart1 = smart1485.pipe(new CustomParser());
    smart1485.on('open', () => log('INFO   Success open smart1 port:', CONST.portRECV));
    smart1485.on('close', () => log('WARNING   Close smart1 port:', CONST.portRECV));
    smart1485.open((err) => {
        if (err) {
            return log('ERROR   Failed to open smart1 port:', err.message);
        }
    });
} else if (smart1Var.type == 'socket') {
    log('INFO   Smart1 connection type: Socket')
    log('INFO   initialize socket...')
    smart1485 = new net.Socket();
    smart1485.connect(smart1Var.port, smart1Var.addr, function () {
        log('INFO   Success connected to smart1', "(" + smart1Var.addr, smart1Var.port + ")");
    });
    smart1485.on('error', (err) => {
        if (err.code == "ETIMEDOUT") {
            log("ERROR   Make sure socket is activated")
        } else { log('ERROR   Smart1 connection failed:', err.message) }
    });
    smart1 = smart1485.pipe(new CustomParser());
}

// Smart2
if (smart2Var.type == 'serial') {
    log('INFO   Smart2 connection type: Serial')
    log('INFO   initialize serial...')
    smart2485 = new SerialPort({
        path: CONST.portSEND,
        baudRate: 9600,
        dataBits: 8,
        parity: 'none',
        stopBits: 1,
        autoOpen: false,
        encoding: 'hex'
    });
    smart2 = smart2485.pipe(new CustomParser());
    smart2485.on('open', () => log('INFO   Success open smart2 port:', CONST.portSEND));
    smart2485.on('close', () => log('WARNING   Close smart2 port:', CONST.portSEND));
    smart2485.open((err) => {
        if (err) {
            return log('ERROR   Failed to open smart2 port:', err.message);
        }
    });
} else if (smart2Var.type == 'socket') {
    log('INFO   Smart2 connection type: Socket')
    log('INFO   initialize socket...')
    smart2485 = new net.Socket();
    smart2485.connect(smart2Var.port, smart2Var.addr, function () {
        log('INFO   Success connected to smart2', "(" + smart2Var.addr, smart2Var.port + ")");
    });
    smart2485.on('error', (err) => {
        if (err.code == "ETIMEDOUT") {
            log("ERROR   Make sure socket is activated")
        } else { log('ERROR   Smart2 connection failed:', err.message) }
    });
    smart2 = smart2485.pipe(new CustomParser());
}

function CheckSum(data, count) {
    var sum = AddSum(data, count);
    if (sum != data[count]) {
        return sum;
    }
    return true;
}

function AddSum(data, count) {
    var sum = 0x03;
    for (var i = 0; i < count; i++) {
        sum = ((data[i] ^ sum) + 1) & 0xff
    }
    return sum;
}

// 홈넷에서 SerialPort로 상태 정보 수신
energy.on('data', function (data) {
    lastReceive = new Date().getTime();
    //console.log('Energy>> Receive interval: ', (new Date().getTime()) - lastReceive, 'ms ->', data.toString('hex'));
    packet1 = {
        //timestamp: data.slice(4, 5).toString('hex'),
        room_idx: data.slice(5, 6).toString('hex'),
        power: data.slice(7, 8).toString('hex')
    }
    if (data[0] !== 0x02) return;
    if (data[2] == 0x1e) {
        switch (data[3]) {
            case 0x91: //상태
                let objFound = CONST.DEVICE_STATE.find(obj => obj.deviceId === 'Room');
                if (objFound) {
                    //조명, 콘센트 상태 정보
                    objFound.subId = packet1.room_idx.substr(1);
                    //console.log(objFound.subId)
                    objFound.curPower1 = ((data[14] * 256 + data[15]) / 10).toString(10);
                    objFound.curPower2 = ((data[16] * 256 + data[17]) / 10).toString(10);
                    objFound.curPower3 = ((data[18] * 256 + data[19]) / 10).toString(10);
                    objFound.light1 = (data[6] & 0x01) ? 'ON' : 'OFF'
                    objFound.light2 = (data[6] & 0x02) ? 'ON' : 'OFF'
                    objFound.light3 = (data[6] & 0x04) ? 'ON' : 'OFF'
                    objFound.light4 = (data[6] & 0x08) ? 'ON' : 'OFF'
                    objFound.outlet1 = (data[7] & 0x01) ? 'ON' : 'OFF'
                    objFound.outlet2 = (data[7] & 0x02) ? 'ON' : 'OFF'
                    packet1.power = Number(packet1.power.substr(0, 1));
                    objFound.idlePower = (packet1.power == 9) ? 'ON' : 'OFF'
                }
                updateStatus(objFound);

            case 0x81:
                let objFoundIdx = CONST.DEVICE_COMMAND.find(obj => obj.deviceId === 'Room');
                objFoundIdx = queue.findIndex(e => ((data[3] == 0x81) && (data[0] == e.commandHex[0]) && (data[1] == e.commandHex[1])));
                if (objFoundIdx > -1) {
                    log('INFO   Success command from Ack # Set State=', retryCnt);
                    queue.splice(objFoundIdx, 1);
                    retryCnt = 0;
                }
        }
    }
});

control.on('data', function (data) {
    lastReceive = new Date().getTime();
    //console.log('Control>> Receive interval: ', (new Date().getTime()) - lastReceive, 'ms ->', data.toString('hex'));

    if (data[0] != 0x02) return;
    switch (data[1]) {
        case 0x31:
            switch (data[2]) {
                case 0x80: //상태
                    let objFound = CONST.DEVICE_STATE.find(obj => obj.deviceId === 'Gas');
                    if (objFound) {
                        objFound.power = (data[5] == 0x01) ? 'ON' : 'OFF'
                        updateStatus(objFound);
                    }

                case 0x82: //제어
                    let objFoundIdx = CONST.DEVICE_COMMAND.find(obj => obj.deviceId === 'Gas');
                    objFoundIdx = queue.findIndex(e => ((data[2] == 0x82) && (data[0] == e.commandHex[0]) && (data[1] == e.commandHex[1])));
                    if (objFoundIdx > -1) {
                        log('INFO   Success command from Ack # Set State=', retryCnt);
                        queue.splice(objFoundIdx, 1);
                        retryCnt = 0;
                    }
            }
            break;

        case 0x41:
            switch (data[2]) {
                case 0x80: //상태
                    let objFound = CONST.DEVICE_STATE.find(obj => obj.deviceId === 'Doorlock');
                    if (objFound) {
                        objFound.power = (data[5] == 0x52) ? 'ON' : 'OFF'
                        updateStatus(objFound);
                    }

                case 0x82: //제어
                    let objFoundIdx = CONST.DEVICE_COMMAND.find(obj => obj.deviceId === 'Doorlock');
                    objFoundIdx = queue.findIndex(e => ((data[2] == 0x82) && (data[0] == e.commandHex[0]) && (data[1] == e.commandHex[1])));
                    if (objFoundIdx > -1) {
                        log('INFO   Success command from Ack # Set State=', retryCnt);
                        queue.splice(objFoundIdx, 1);
                        retryCnt = 0;
                    }
            }
            break;

        case 0x61: //상태
            switch (data[2]) {
                case 0x80:
                    let objFound = CONST.DEVICE_STATE.find(obj => obj.deviceId === 'Fan');
                    if (objFound) {
                        if (data[5] == 0x00 | data[5] == 0x01) {
                            objFound.power = (data[5] == 0x01) ? 'ON' : 'OFF'
                        } else {
                            objFound.power = (data[5] == 0x11) ? 'nature ON' : 'nature OFF'
                        }
                        switch (data[6]) {
                            case 0x01: objFound.preset = 'low'; break;
                            case 0x02: objFound.preset = 'medium'; break;
                            case 0x03: objFound.preset = 'high'; break;
                        }
                        updateStatus(objFound);
                    }

                case 0x81: case 0x83: case 0x87: //제어
                    let objFoundIdx = CONST.DEVICE_COMMAND.find(obj => obj.deviceId === 'Fan');
                    objFoundIdx = queue.findIndex(e => ((data[2] == 0x81 | data[2] == 0x83 | data[2] == 0x87) && (data[0] == e.commandHex[0]) && (data[1] == e.commandHex[1])));
                    if (objFoundIdx > -1) {
                        log('INFO   Success command from Ack # Set State=', retryCnt);
                        queue.splice(objFoundIdx, 1);
                        retryCnt = 0;
                    }
            }
            break;
        
        case 0x28:
            switch (data[3]) {
                case 0x91:
                    let objFound = CONST.DEVICE_STATE.find(obj => obj.deviceId === 'Thermo')
                    //난방 상태 정보
                    objFound.subId = data[5].toString();
                    //0x01: 켜짐, 0x02: 꺼짐, 0x07: 대기, 0x11: 켜짐
                    if (data[6] == 0x01 | data[6] == 0x11) { objFound.power = 'heat' }
                    else if (data[6] == 0x02 | data[6] == 0x07) { objFound.power = 'off' }
                    objFound.setTemp = ((data[7] & 0x3f) + ((data[7] & 0x40) / 128)).toString(10);
                    objFound.curTemp = ((data[8] * 256 + data[9]) / 10.0).toString(10);
                    updateStatus(objFound);

                case 0x92: //제어
                    let objFoundIdx = CONST.DEVICE_COMMAND.find(obj => obj.deviceId === 'Thermo');
                    objFoundIdx = queue.findIndex(e => ((data[3] == 0x92) && (data[0] == e.commandHex[0]) && (data[1] == e.commandHex[1])));
                    if (objFoundIdx > -1) {
                        log('INFO   Success command from Ack # Set State=', retryCnt);
                        queue.splice(objFoundIdx, 1);
                        retryCnt = 0;
                    }
            }
            break;
    }
});

smart1.on('data', function (data) {
    lastReceive = new Date().getTime();
    //console.log('Smart1>> Receive interval: ', (new Date().getTime()) - EVlastReceive, 'ms ->', data.toString('hex'));
    packet2 = {
        timestamp: data.slice(4, 5).toString('hex'),
        state: data.slice(11, 12).toString('hex'),
        floor: data.slice(12, 13).toString('hex')
    }

    if (data.length !== 19) return;
    let objFound = CONST.DEVICE_STATE.find(obj => obj.deviceId === 'Elevator');
    if (objFound) {
        if (data[3] == 0x13) {
            objFound.power = (packet2.state == '01') ? 'ON' : 'OFF'
            switch (packet2.state) {
                case '00': objFound.direction = '대기'; break; //idle
                case '01': objFound.direction = '이동중'; break; //moving
                case '04': objFound.direction = '도착'; break; //arrived
            }
    
            if (data[12] == 0xFF) {
                objFound.floor = '대기 층'
            } else if (data[12] & 0x80) {
                objFound.floor = (`B${(data[12] & 0x7f).toString(10)} 층`)
                log(`smart>> Elevator Current Floor: B${ data[12] & 0x7f }층`)
            } else {
                objFound.floor = (`${(data[12] & 0xff).toString(10)} 층`)
                log(`smart>> Elevator Current Floor: ${data[12] & 0xff}층`)
            }
        }
        updateStatus(objFound);
    }

    if ((data[11] == 0x01) || (data[12] == 0xff)) {
        let objFoundIdx = CONST.DEVICE_COMMAND.find(obj => obj.deviceId === 'Elevator');
        objFoundIdx = queue.findIndex(e => ((data[11] == 0x01) && (data[0] == e.commandHex[0]) && (data[1] == e.commandHex[1])));
        if (objFoundIdx > -1) {
            log('INFO   Success command from Ack # Set State=', retryCnt);
            queue.splice(objFoundIdx, 1);
            retryCnt = 0;
        }
        return;
    }
});

smart2.on('data', function (data) {
    lastReceive = new Date().getTime();
    //console.log('Smart2>> Receive interval: ', (new Date().getTime()) - EVlastReceive, 'ms ->', data.toString('hex'));

    if (data[0] != 0x02) return;
    let objFound = CONST.DEVICE_COMMAND.find(obj => obj.deviceId === 'Elevator');
    prefix = Buffer.from('02C10C91', 'hex')
    timestamp = Buffer.from(packet2.timestamp, 'hex')
    next_ts = Buffer.from('100100020102', 'hex')
    data = Buffer.concat([prefix, timestamp, next_ts])
    buf_sum = Buffer.from(CheckSum(data, 11).toString(16), 'hex')
    buf_commandHex = Buffer.concat([data, buf_sum])
    objFound.commandHex = buf_commandHex.toString('hex')
});

// MQTT로 HA에 상태값 전송
var updateStatus = (obj) => {
    if (obj) {
        var arrStateName = Object.keys(obj);
    } else {
        return null;
    }

    // 상태값이 아닌 항목들은 제외 [deviceId, subId, stateHex, commandHex, sentTime]
    const arrFilter = ['deviceId', 'subId', 'stateHex', 'commandHex', 'sentTime'];
    const hideFilter = ['curPower1', 'curPower2', 'curPower3', 'curTemp'];
    arrStateName = arrStateName.filter(stateName => !arrFilter.includes(stateName));

    // 상태값별 현재 상태 파악하여 변경되었으면 상태 반영 (MQTT publish)
    arrStateName.forEach(function (stateName) {
        // 상태값이 없거나 상태가 같으면 반영 중지
        var curStatus = homeStatus[obj.deviceId + obj.subId + stateName];
        if (obj[stateName] == null || obj[stateName] === curStatus) return;
        // 미리 상태 반영한 device의 상태 원복 방지
        if (queue.length > 0) {
            var found = queue.find(q => q.deviceId + q.subId === obj.deviceId + obj.subId && q[stateName] === curStatus);
            // log('WARNING  ', obj.deviceId + obj.subId, '->', 'State reflection complete & skip');
            if (found != null) return;
        }
        // 상태 반영 (MQTT publish)
        homeStatus[obj.deviceId + obj.subId + stateName] = obj[stateName];
        var topic = util.format(CONST.STATE_TOPIC, obj.deviceId, obj.subId, stateName);
        client.publish(topic, obj[stateName], { retain: true });

        if (!hideFilter.includes(stateName)) {
            log('INFO   Send to HA:', topic, '->', obj[stateName]);
        }
    });
}

// HA에서 MQTT로 제어 명령 수신
client.on('message', (topic, message) => {
    if (mqttReady) {
        var topics = topic.split('/');
        var value = message.toString(); // message buffer이므로 string으로 변환
        var objFound = null;
        if (topics[0] === CONST.TOPIC_PRFIX) {
            // 온도설정 명령의 경우 모든 온도를 Hex로 정의해두기에는 많으므로 온도에 따른 시리얼 통신 메시지 생성
            if (topics[2] === 'setTemp') {
                objFound = CONST.DEVICE_COMMAND.find(obj => obj.deviceId + obj.subId === topics[1] && obj.hasOwnProperty('setTemp'));
                objFound.commandHex[7] = Number(value);
                objFound.setTemp = String(Number(value)); // 온도값은 소수점이하는 버림
                data = objFound.commandHex;
                objFound.commandHex[13] = CheckSum(data, 11); // 마지막 Byte는 XOR SUM
            }
            // 다른 명령은 미리 정의해놓은 값을 매칭
            else {
                objFound = CONST.DEVICE_COMMAND.find(obj => obj.deviceId + obj.subId === topics[1] && obj[topics[2]] === value);
            }
        }

        if (objFound == null) {
            log('WARNING   Receive Unknown Msg.: ', topic, ':', value);
            return;
        }

        // 현재 상태와 같으면 Skip
        if (value === homeStatus[objFound.deviceId + objFound.subId + objFound[topics[2]]]) {
            log('INFO   Receive & Skip: ', topic, ':', value);
        }
        // Serial메시지 제어명령 전송 & MQTT로 상태정보 전송
        else {
            log('INFO   Receive from HA:', topic, ':', value);
            // 최초 실행시 딜레이 없도록 sentTime을 현재시간 보다 sendDelay만큼 이전으로 설정
            objFound.sentTime = (new Date().getTime()) - CONST.SEND_DELAY;
            queue.push(objFound);   // 실행 큐에 저장
            updateStatus(objFound); // 처리시간의 Delay때문에 미리 상태 반영
            retryCnt = 0;
        }
    }
});


// SerialPort로 제어 명령 전송
const commandProc = () => {
    // 큐에 처리할 메시지가 없으면 종료
    if (queue.length == 0) return;

    // 기존 홈넷 RS485 메시지와 충돌하지 않도록 Delay를 줌
    var delay = (new Date().getTime()) - lastReceive;  //serial
    if (delay < CONST.SEND_DELAY) return;
    if (!mqttReady) return;

    // 큐에서 제어 메시지 가져오기
    var obj = queue.shift();
    var objfilter = ['Fan', 'Thermo', 'Gas', 'Doorlock'];
    var objfilter2 = ['Elevator', 'LightAll'];

    if (obj.deviceId === 'Room') {
        energy485.write(obj.commandHex, (err) => { if (err) return log('ERROR  ', 'Send Error: ', err.message); });
        log('INFO  ', 'Energy>> Send to Device:', obj.deviceId, obj.subId, 'light/outlet', '->', obj.state, obj.commandHex.toString('hex'));
    } else if (objfilter.includes(obj.deviceId)) {
        control485.write(obj.commandHex, (err) => { if (err) return log('ERROR  ', 'Send Error: ', err.message); });
        log('INFO  ', 'Control>> Send to Device:', obj.deviceId, obj.subId, '->', obj.state, obj.commandHex.toString('hex'));
    } else if (objfilter2.includes(obj.deviceId)) {
        smart2485.write(obj.commandHex, (err) => { if (err) return log('ERROR  ', 'Send Error: ', err.message); });
        log('INFO  ', 'Smart>> Send to Device:', obj.deviceId, obj.subId, '->', obj.state, obj.commandHex.toString('hex'));
    }
    obj.sentTime = lastReceive;

    // ack메시지가 오지 않는 경우 방지
    retryCnt++;
    if (retryCnt < CONST.MAX_RETRY) {
        // 다시 큐에 저장하여 Ack 메시지 받을때까지 반복 실행
        queue.push(obj);
    } else {
        // 보통 패킷을 수정하다가 맨 뒤에 있는 체크섬이 틀리거나 ew11 과부하 걸리는 경우(ew11 재부팅 시도)
        log('ERROR   Packet send error Please check packet or ew11 =>', obj.commandHex.toString('hex'));
        retryCnt = 0;
    }
};

setTimeout(() => { mqttReady = true; log('INFO   MQTT ready...') }, CONST.MQTT_DELAY);
setInterval(commandProc, 20);
