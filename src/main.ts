import { Socket, createConnection } from "net";
import { StompFrame } from "./model";
import { openStompStream } from "./stream";
import { StompFrameLayer } from "./frame";

const socket = createConnection(61613, '127.0.0.1');

const streamLayer = openStompStream(socket);
const frameLayer = new StompFrameLayer(streamLayer);

frameLayer.emitter.on('frame', (frame) => {
    console.log('Frame Event: ' + frame.toString());
});

frameLayer.emitter.on('error', (error) => {
    console.log('Error Event: ' + error.toString());
});

frameLayer.emitter.on('end', () => {
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
