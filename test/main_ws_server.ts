import { StompFrame, StompHeaders, StompError } from './model';
import { openStream } from './stream';
import { StompFrameLayer } from './frame';
import { StompServerSessionLayer } from './session';
import * as WebSocket from 'ws';


function testServer(webSocket: WebSocket) {

    const streamLayer = openStream(webSocket);
    const frameLayer = new StompFrameLayer(streamLayer);
    const listener = {

        async connect(headers?: StompHeaders): Promise<void> {
            console.log('Connect!', headers);
            if (headers && headers.login === 'rabbit_user' && headers.passcode === 'rabbit_user') {
                sessionLayer.connected({ version: '1.2', server: 'MyServer/1.8.2' });
            } else {
                sessionLayer.error({ message: 'Invalid login data' }, 'Invalid login data');
            }
        },
        async send(headers?: StompHeaders, body?: string): Promise<void> {
            console.log('Send!', body, headers);
            sessionLayer.message({ destination: 'commonQueue', 'message-id': '123456' }, 'This is the response message!');
        },

        async subscribe(headers?: StompHeaders): Promise<void> {
            if (headers) {
                console.log('subscription done to ' + headers.destination);
                await sessionLayer.message({
                    destination: headers.destination,
                    subscription: headers.id,
                    'message-id': '123456'
                }, 'This is a message!');
                //await sessionLayer.message({ destination: headers.destination, 'message-id': '123456' }, 'This is the response message!');
                /*
                if (headers.destination === 'commonQueue') {
                    console.log('subscription done to commonQueue');
                } else {
                    throw new StompError('Cannot subscribe to' + headers.destination);
                }*/
            }
            /*console.log('');
            return Promise.resolve();*/
        },
        async unsubscribe(headers?: StompHeaders): Promise<void> {
            console.log('unsubscribe', headers);
        },
        async begin(headers?: StompHeaders): Promise<void> {
            console.log('begin', headers);
        },
        async commit(headers?: StompHeaders): Promise<void> {
            console.log('commit', headers);
        },
        async abort(headers?: StompHeaders): Promise<void> {
            console.log('abort', headers);
        },

        async ack(headers?: StompHeaders): Promise<void> {
            console.log('ack', headers);
        },
        async nack(headers?: StompHeaders): Promise<void> {
            console.log('nack', headers);
        },

        async disconnect(headers?: StompHeaders): Promise<void> {
            console.log('Disconnect!', headers);
        },

        onProtocolError(error: StompError) {
            console.log('Protocol error!', error);
        },
        onEnd() {
            console.log('End!');
        }
    };
    const sessionLayer = new StompServerSessionLayer(frameLayer, listener);

}

const wss = new WebSocket.Server({ port: 8080 });

wss.on('connection', function connection(ws) {
    testServer(ws);
});
