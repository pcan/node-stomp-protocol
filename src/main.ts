import { Socket, createConnection } from "net";
import { StompFrame } from "./model";
import { openStompStream, StompStreamEventEmitter } from "./stream";
import { StompFrameLayer, StompSide, StompFrameValidator, StompFrameEventEmitter } from "./frame";
import { StompProtocol_v_1_0 } from "./protocol";

const socket = createConnection(61613, '127.0.0.1');

const streamEmitter = new StompStreamEventEmitter();
const streamLayer = openStompStream(socket, streamEmitter);

const validator = new StompFrameValidator(StompSide.CLIENT, StompProtocol_v_1_0);
const frameLayer = new StompFrameLayer(streamLayer, validator);

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
