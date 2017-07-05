import { Socket, createConnection } from 'net';
import { StompFrame, StompHeaders, StompError } from './model';
import { openStompStream } from './stream';
import { StompFrameLayer } from './frame';
import { StompClientSessionLayer } from './session';
import { StompServerCommandListener } from './protocol';

const socket = createConnection(9999, '127.0.0.1');

const streamLayer = openStompStream(socket);
const frameLayer = new StompFrameLayer(streamLayer);
const listener: StompServerCommandListener = {
    async connected(headers?: StompHeaders): Promise<void> {
        console.log('Connected!', headers);
        await sessionLayer.subscribe({ destination: 'commonQueue', id: 'sub01', receipt: 'r01' });
        await sessionLayer.send({ destination: 'commonQueue', receipt: 'r02' }, 'test message');
        await sessionLayer.unsubscribe({ destination: 'commonQueue', id: 'sub01', receipt: 'r03' });
        //await sessionLayer.unsubscribe({ destination: 'commonQueue', receipt: 'r04' });
    },
    async message(headers?: StompHeaders, body?: string): Promise<void> {
        console.log('Message!', body, headers);
        //await sessionLayer.disconnect();
        //await sessionLayer.send(undefined, 'this is the message body');
    },
    async receipt(headers?: StompHeaders): Promise<void> {
        console.log('Receipt!', headers);
        if (headers && headers['receipt-id'] === 'r03') {
            await sessionLayer.disconnect();
        }
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

new Promise((resolve, reject) => {
    socket.on('connect', resolve);
}).then(() => {
    sessionLayer.connect({
        'host': '/',
        'login': 'rabbit_user',
        'passcode': 'rabbit_user'
    });
});
