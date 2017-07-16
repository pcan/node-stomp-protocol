import 'mocha';
import { assert, should, expect } from 'chai';
import { StompFrame, StompEventEmitter, StompError } from '../src/model';
import { StompFrameLayer } from '../src/frame';
import { StompServerSessionLayer } from '../src/session';
import { StompClientCommandListener } from '../src/protocol'
import { check, countdownLatch } from './helpers';

describe('STOMP Server Session Layer', () => {
    let frameLayer: StompFrameLayer;
    let sessionLayer: StompServerSessionLayer;
    let clientListener: StompClientCommandListener;


    beforeEach(() => {
        frameLayer = <StompFrameLayer>{
            emitter: new StompEventEmitter(),
            close: async () => { }
        };
        clientListener = <StompClientCommandListener>{
        };
        sessionLayer = new StompServerSessionLayer(frameLayer, clientListener);
    });

    it(`should handle valid CONNECT frame`, (done) => {
        const testHeaders = { login: 'user', passcode: 'pass' };
        clientListener.connect = async (headers) => {
            check(() => assert.deepEqual(testHeaders, headers), done);
        };
        frameLayer.emitter.emit('frame', new StompFrame('CONNECT', testHeaders));
    });

    it(`should send ERROR for invalid command`, (done) => {
        frameLayer.send = async (frame) => {
            check(() => expect(frame)
                .to.deep.include({ command: 'ERROR', headers: { message: 'No such command' } }), done);
        };
        frameLayer.emitter.emit('frame', new StompFrame('INVALID_CMD', { }, 'test'));
    });

    it(`should send ERROR if did not received CONNECT yet`, (done) => {
        const testFrame = new StompFrame('SEND', { destination: '/queue/test' }, 'test message');
        let latch = countdownLatch(2, done);
        frameLayer.close = async () => latch();
        frameLayer.send = async (frame) => {
            check(() => expect(frame)
                .to.deep.include({ command: 'ERROR', headers: { message: 'You must first issue a CONNECT command' } }), latch);
        };
        frameLayer.emitter.emit('frame', testFrame);
    });

    it(`should send ERROR when catching exceptions from listener`, (done) => {
        clientListener.connect = async (headers) => {
            throw new Error('login error');
        };
        frameLayer.send = async (frame) => {
            check(() => expect(frame)
                .to.deep.include({ command: 'ERROR', headers: { message: 'login error' } }), done);
        };
        frameLayer.emitter.emit('frame', new StompFrame('CONNECT', {}));
    });

    it(`should send ERROR with receipt when catching exceptions from listener`, (done) => {
        sessionLayer.data.authenticated = true;
        clientListener.send = async (headers) => {
            throw new Error('error');
        };
        frameLayer.send = async (frame) => {
            check(() => expect(frame)
                .to.deep.include({ command: 'ERROR', headers: { 'receipt-id': '123', message: 'error' } }), done);
        };
        frameLayer.emitter.emit('frame', new StompFrame('SEND', { destination: '/queue/test', 'receipt': '123' }, 'test message'));
    });

});
