import 'mocha';
import * as chai from 'chai';
import { StompFrameLayer } from '../src/frame';
import { StompFrame, StompEventEmitter } from '../src/model';
import { StompStreamLayer } from '../src/stream';

function check(f: Function, done: Function) {
    try {
        f();
        done();
    } catch (e) {
        done(e);
    }
}

describe('STOMP Frame Layer', () => {
    const connectFrameText = 'CONNECT\naccept-version:1.2\nhost:/myHost\n\n\0';
    const connectFrame = new StompFrame('CONNECT', { 'accept-version': '1.2', host: '/myHost' });
    let streamLayer: StompStreamLayer;
    let frameLayer: StompFrameLayer;

    beforeEach(() => {
        streamLayer = {
            emitter: new StompEventEmitter(),
            async close() { },
            async send(data) { }
        };
        frameLayer = new StompFrameLayer(streamLayer);
    });

    it('should send basic CONNECT message', (done) => {
        streamLayer.send = async (data) => {
            const result = connectFrameText === data ? undefined : 'CONNECT Frame data does not match.';
            done(result);
        }
        frameLayer.send(connectFrame);
    });

    it('should receive basic CONNECT message', (done) => {
        frameLayer.emitter.on('frame', (frame: StompFrame) => {
            check(() => chai.assert.deepEqual(connectFrame, frame), done);
        });
        streamLayer.emitter.emit('data', new Buffer(connectFrameText));
    });


});
