import { Socket, createConnection } from 'net';
import { StompFrame, StompHeaders, StompError } from './model';
import { openStompStream } from './stream';
import { StompFrameLayer } from './frame';
import { StompClientSessionLayer } from './session';

const socket = createConnection(9999, '127.0.0.1');

const streamLayer = openStompStream(socket);
const frameLayer = new StompFrameLayer(streamLayer);
const listener = {
    async connected(headers?: StompHeaders): Promise<void> {
        console.log('Connected!', headers);
        await sessionLayer.subscribe({ destination: 'commonQueue' });
        await sessionLayer.unsubscribe({ destination: 'commonQueue' });
        await sessionLayer.unsubscribe({ destination: 'commonQueue' });
    },

    async message(headers?: StompHeaders, body?: string): Promise<void> {
        console.log('Message!', body, headers);
        //return sessionLayer.disconnect({});
        await sessionLayer.send(undefined, 'this is the message body');
    },
    async receipt(headers?: StompHeaders): Promise<void> {
        console.log('Receipt!', headers);
    },
    async error(headers?: StompHeaders, body?: string): Promise<void> {
        console.log('Error!', headers, body);
    },
    onProtocolError(error: StompError) {
        console.log('Protocol error!', error);
    },
    onEnd() {
        console.log('End!');
    }
};
const sessionLayer = new StompClientSessionLayer(frameLayer, listener);

/*
frameLayer.emitter.on('frame', (frame) => {
    console.log('Frame Event: ' + frame.toString());
});

frameLayer.emitter.on('error', (error) => {
    console.log('Error Event: ' + error.toString());
});

frameLayer.emitter.on('end', () => {
    console.log('End event detected.');
});
*/

new Promise((resolve, reject) => {
    socket.on('connect', resolve);
}).then(() => {
    sessionLayer.connect({
        'host': '/',
        'login': 'rabbit_user',
        'passcode': 'rabbit_user'
    });
});

/*
socket.on('connect', () => {

    frameLayer.send(new StompFrame('CONNECT', {
        'accept-version': '1.2',
        'host': '/',
        'login': 'guest',
        'passcode': 'guest'
    }));

});
*/


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
