import 'mocha';
import { assert, expect } from 'chai';
import { StompFrame, StompEventEmitter, StompHeaders, StompError } from '../src/model';
import { StompFrameLayer } from '../src/frame';
import { StompServerSessionLayer, StompClientSessionLayer } from '../src/session';
import {
    StompClientCommandListener, StompServerCommandListener, StompProtocolHandlerV10,
    StompProtocolHandlerV11, StompProtocolHandlerV12
} from '../src/protocol'
import { check, countdownLatch, noopAsyncFn } from './helpers';

describe('STOMP Server Session Layer', () => {
    let frameLayer: StompFrameLayer;
    let sessionLayer: StompServerSessionLayer;
    let clientListener: StompClientCommandListener;
    let unhandledRejection: boolean;

    process.on('unhandledRejection', () => unhandledRejection = true);

    beforeEach(() => {
        unhandledRejection = false;
        frameLayer = <StompFrameLayer>{
            emitter: new StompEventEmitter(),
            close: async () => { }
        };
        clientListener = {} as StompClientCommandListener;
        sessionLayer = new StompServerSessionLayer(frameLayer, clientListener);
    });

    it(`should handle valid CONNECT frame`, (done) => {
        const testHeaders = { login: 'user', passcode: 'pass' };
        clientListener.connect = (headers) => {
            check(() => assert.deepEqual(testHeaders, headers), done);
        };
        frameLayer.emitter.emit('frame', new StompFrame('CONNECT', testHeaders));
    });

    it(`should use protocol v.1.0`, (done) => {
        const testHeaders = { login: 'user', passcode: 'pass', 'accept-version': '1.0' };
        clientListener.connect = () => {
            check(() => assert.equal((<any>sessionLayer).protocol, StompProtocolHandlerV10), done);
        };
        frameLayer.emitter.emit('frame', new StompFrame('CONNECT', testHeaders));
    });

    it(`should switch to protocol v.1.1`, (done) => {
        const testHeaders = { login: 'user', passcode: 'pass', 'accept-version': '1.1' };
        clientListener.connect = () => {
            check(() => assert.equal((<any>sessionLayer).protocol, StompProtocolHandlerV11), done);
        };
        frameLayer.emitter.emit('frame', new StompFrame('CONNECT', testHeaders));
    });

    it(`should switch to protocol v.1.2`, (done) => {
        const testHeaders = { login: 'user', passcode: 'pass', 'accept-version': '1.2' };
        clientListener.connect = () => {
            check(() => assert.equal((<any>sessionLayer).protocol, StompProtocolHandlerV12), done);
        };
        frameLayer.emitter.emit('frame', new StompFrame('CONNECT', testHeaders));
    });

    it(`should send ERROR for unhandled protocol version`, (done) => {
        const testHeaders = { login: 'user', passcode: 'pass', 'accept-version': '2.1,2.2' };
        frameLayer.send = async (frame) => {
            check(() => expect(frame)
                .to.deep.include({ command: 'ERROR', headers: { message: 'Supported protocol versions are: 1.0, 1.1, 1.2' } }), done);
        };
        frameLayer.emitter.emit('frame', new StompFrame('CONNECT', testHeaders));
    });

    it(`should send ERROR for invalid command`, (done) => {
        frameLayer.send = async (frame) => {
            check(() => expect(frame)
                .to.deep.include({ command: 'ERROR', headers: { message: 'No such command' } }), done);
        };
        frameLayer.emitter.emit('frame', new StompFrame('INVALID_CMD', {}, 'test'));
    });

    it(`should send ERROR if did not received CONNECT yet`, (done) => {
        const testFrame = new StompFrame('SEND', { destination: '/queue/test' }, 'test message');
        const latch = countdownLatch(2, done);
        frameLayer.close = async () => latch();
        frameLayer.send = async (frame) => {
            check(() => expect(frame)
                .to.deep.include({ command: 'ERROR', headers: { message: 'You must first issue a CONNECT command' } }), latch);
        };
        frameLayer.emitter.emit('frame', testFrame);
    });

    it(`should send ERROR when catching exceptions from listener`, (done) => {
        clientListener.connect = () => {
            throw new Error('login error');
        };
        frameLayer.send = async (frame) => {
            check(() => expect(frame)
                .to.deep.include({ command: 'ERROR', headers: { message: 'login error' } }), done);
        };
        frameLayer.emitter.emit('frame', new StompFrame('CONNECT', {}));
    });

    it(`should send ERROR for invalid frame`, (done) => {
        sessionLayer.data.authenticated = true;
        frameLayer.send = async (frame) => {
            check(() => expect(frame)
                .to.deep.include({ command: 'ERROR', headers: { 'message': `Header 'destination' is required for SEND` } }), done);
        };
        frameLayer.emitter.emit('frame', new StompFrame('SEND', {}, 'test message'));
    });

    it(`should handle protocol error`, (done) => {
        sessionLayer.data.authenticated = true;
        const error = new StompError('generic error');
        clientListener.onProtocolError = (error) => {
            check(() => expect(error).to.deep.equal(error), done);
        };
        frameLayer.emitter.emit('error', error);
    });

    it(`should handle errors thrown during onError execution`, (done) => {
        const latch = countdownLatch(2, done);
        sessionLayer.sendErrorHandler = () => latch();
        frameLayer.send = () => {
            throw new Error('Unhandled error!');
        };
        frameLayer.emitter.emit('frame', new StompFrame('INVALIDFRAME', {}));
        setTimeout(() => {
            check(() => assert.equal(unhandledRejection, false), latch);
        }, 0);
    });

    it(`should send headers and body for SEND frames`, (done) => {
        sessionLayer.data.authenticated = true;
        clientListener.send = (_headers, body) => {
            check(() => expect(body).exist, done);
        };
        frameLayer.emitter.emit('frame', new StompFrame('SEND', { destination: '/queue/test' }, 'test message'));
    });

    it(`should handle frames using listener constructor`, (done) => {
        const testHeaders = { login: 'user', passcode: 'pass' };
        class TestClientListener implements StompClientCommandListener {
            connect(headers: StompHeaders) {
                check(() => assert.deepEqual(testHeaders, headers), done);
            }
            send() { }
            subscribe() { }
            unsubscribe() { }
            begin() { }
            commit() { }
            abort() { }
            ack() { }
            nack() { }
            disconnect() { }
            onProtocolError() { }
            onEnd() { }
        }
        sessionLayer = new StompServerSessionLayer(frameLayer, TestClientListener);
        frameLayer.emitter.emit('frame', new StompFrame('CONNECT', testHeaders));
    });
});


describe('STOMP Client Session Layer', () => {
    let frameLayer: StompFrameLayer;
    let sessionLayer: StompClientSessionLayer;
    let serverListener: StompServerCommandListener;
    let unhandledRejection: boolean;

    process.on('unhandledRejection', () => unhandledRejection = true);

    beforeEach(() => {
        unhandledRejection = false;
        frameLayer = <StompFrameLayer>{
            emitter: new StompEventEmitter(),
            close: noopAsyncFn
        };
        serverListener = {} as StompServerCommandListener;
        sessionLayer = new StompClientSessionLayer(frameLayer, serverListener);
        sessionLayer.sendErrorHandler = console.error;
    });

    it(`should send accept-version header in CONNECT frame`, (done) => {
        frameLayer.send = async (frame) => {
            check(() => expect(frame)
                .to.deep.include({
                    command: 'CONNECT',
                    headers: { login: 'user', passcode: 'pass', 'accept-version': '1.0,1.1,1.2' }
                }), done);
        };
        sessionLayer.connect({ login: 'user', passcode: 'pass' });
    });

    it(`should switch to protocol v.1.1`, (done) => {
        serverListener.connected = () => {
            check(() => assert.equal((<any>sessionLayer).protocol, StompProtocolHandlerV11), done);
        };
        frameLayer.emitter.emit('frame', new StompFrame('CONNECTED', { version: '1.1' }));
    });

    it(`should switch to protocol v.1.2`, (done) => {
        serverListener.connected = () => {
            check(() => assert.equal((<any>sessionLayer).protocol, StompProtocolHandlerV12), done);
        };
        frameLayer.emitter.emit('frame', new StompFrame('CONNECTED', { version: '1.2' }));
    });

    it(`should handle ERROR frame`, (done) => {
        const error = new StompFrame('ERROR', { message: 'generic error' });
        serverListener.error = (headers) => {
            check(() => expect(headers)
                .to.deep.equal(error.headers), done);
        };
        frameLayer.emitter.emit('frame', error);
    });

    it(`should handle command internal errors gracefully`, (done) => {
        const latch = countdownLatch(2, done);
        serverListener.onProtocolError = () => latch();
        serverListener.message = () => {
            throw new Error('Unhandled error!');
        }
        frameLayer.emitter.emit('frame', new StompFrame('MESSAGE', { 'destination': '/queue/1', 'message-id': '1', 'subscription': '1' }));
        setTimeout(() => {
            check(() => assert.equal(unhandledRejection, false), latch);
        }, 0);
    });

});
