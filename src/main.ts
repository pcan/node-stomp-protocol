import { Socket, createConnection } from "net";
import { StompFrame } from "./model";
import { openStompStream, StompStreamEventEmitter } from "./stream";
import { StompClientFrameLayer, StompFrameEventEmitter } from "./frame";
import { StompProtocol_v_1_0 } from "./protocol";

const socket = createConnection(61613, '127.0.0.1');

const streamLayer = openStompStream(socket);
const frameLayer = new StompClientFrameLayer(streamLayer);

frameLayer.emitter.frameEmitter.onEvent((frame) => {
    console.log('Frame Event: ' + frame.toString());
});

frameLayer.emitter.errorEmitter.onEvent((error) => {
    console.log('Error Event: ' + error.toString());
});

frameLayer.emitter.endEmitter.onEvent(() => {
    console.log("End event detected.");
});


socket.on('connect', () => {

    frameLayer.send(new StompFrame('CONNECT', {
        'accept-version': '1.2',
        'host': '/',
        'login': 'guest',
        'passcode': 'guest'
    }));

});



/*
var server = net.createServer((socket) => {
    socket.on('connect', () => {
        //console.log('Received Unsecured Connection');
        //new StompStreamHandler(stream, queueManager);
        var stream = new StompStream(socket);
        var handler = new StompProtocolHandler(stream);

    });
});
*/
