import 'mocha';
import * as chai from 'chai';
import { StompFrameLayer } from '../src/frame';
import { StompFrame, StompEventEmitter, StompError } from '../src/model';
import { StompStreamLayer } from '../src/stream';

describe('STOMP Frame Layer', () => {
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
        const connectFrameText = 'CONNECT\naccept-version:1.2\nhost:/myHost\n\n\0';
        streamLayer.send = async (data) => {
            const result = connectFrameText === data ? undefined : 'CONNECT Frame data does not match.';
            done(result);
        }
        const connectFrame = new StompFrame('CONNECT', { 'accept-version': '1.2', host: '/myHost' });
        frameLayer.send(connectFrame);
    });

    it('should receive basic CONNECT message', (done) => {
        const connectFrameText = 'CONNECT\naccept-version:1.2\n\n\0';
        const connectFrame = new StompFrame('CONNECT', { 'accept-version': '1.2'});
        frameLayer.emitter.on('frame', (frame: StompFrame) => {
            check(() => chai.assert.deepEqual(frame, connectFrame), done);
        });
        streamLayer.emitter.emit('data', new Buffer(connectFrameText));
    });

    it('should send CONNECT message with filtered headers', (done) => {
        const connectFrameText = 'CONNECT\naccept-version:1.2\n\n\0';
        const connectFrame = new StompFrame('CONNECT', { 'accept-version': '1.2'});
        streamLayer.send = async (data) => {
            const result = connectFrameText === data ? undefined : 'CONNECT Frame data does not match.';
            done(result);
        }
        frameLayer.headerFilter = (headerName) => headerName !== 'X-remove-this';
        connectFrame.setHeader('X-remove-this', 'dummy-value');
        frameLayer.send(connectFrame);
    });

    it(`should emit 'end' when disconnected`, (done) => {
        frameLayer.emitter.on('end', done);
        streamLayer.emitter.emit('end');
    });

    it(`should close stream when closing`, (done) => {
        streamLayer.close = async () => done();
        frameLayer.close();
    });

    it(`should include content-length header`, (done) => {
        streamLayer.send = async (data) => {
            const result = data.indexOf('\ncontent-length') > 0 ? undefined : 'Frame should include content-length header.';
            done(result);
        }
        const frame = new StompFrame('MESSAGE', {}, 'hello');
        frameLayer.send(frame);
    });

    it(`should omit content-length header when suppress-content-length is truthy`, (done) => {
        streamLayer.send = async (data) => {
            const result = data.indexOf('\ncontent-length') < 0 ? undefined : 'Frame should not include content-length header.';
            done(result);
        }
        const frame = new StompFrame('MESSAGE', { 'suppress-content-length': 'true' }, 'hello');
        frameLayer.send(frame);
    });

    it(`should use content-length when present`, (done) => {
        frameLayer.emitter.on('frame', (frame: StompFrame) => {
            const expected = new StompFrame('SEND', { 'content-length': '5' }, 'hello');
            check(() => chai.assert.deepEqual(frame, expected), done);
        });
        streamLayer.emitter.emit('data', new Buffer(`SEND\ncontent-length:5\n\nhello\0`));
    });

    it(`should reject frames bigger than maxBufferSize`, (done) => {
        frameLayer.emitter.on('error', (error: StompError) => {
            check(() => chai.assert.equal(error.message, 'Maximum buffer size exceeded.'), done);
        });
        frameLayer.maxBufferSize = 1024;
        const buf = Buffer.alloc(frameLayer.maxBufferSize + 1, 'a').toString();
        streamLayer.emitter.emit('data', new Buffer(`SEND\ncontent-length:${buf.length}\n\n${buf}\0`));
    });

    it(`should reject frames with broken headers`, (done) => {
        frameLayer.emitter.on('error', (error: StompError) => {
            check(() => chai.assert.equal(error.message, 'Error parsing header'), done);
        });
        streamLayer.emitter.emit('data', new Buffer(`SEND\ncontent-length:5\nbrokenHeader\n\nhello\0`));
    });
    
    it(`should reject partial received frames in case of error`, (done) => {
        frameLayer.emitter.on('error', (error: StompError) => {
            check(() => chai.assert.equal(error.message, 'Error parsing header'), done);
        });
        streamLayer.emitter.emit('data', new Buffer(`SEND\ncontent-length:123\nbrokenHeader\n\nhel`));
    });

    it(`should receive a frame split in multiple data events`, (done) => {
        frameLayer.emitter.on('frame', (frame: StompFrame) => {
            const expected = new StompFrame('SEND', { 'content-length': '11' }, 'hello world');
            check(() => chai.assert.deepEqual(frame, expected), done);
        });
        streamLayer.emitter.emit('data', new Buffer(`SEND\ncontent-length:11\n\nhe`));
        streamLayer.emitter.emit('data', new Buffer(`llo `));
        streamLayer.emitter.emit('data', new Buffer(`world\0`));
    });
    
    it(`should close stream in case of newline flooding attack`, (done) => {
        streamLayer.close = async () => done();
        streamLayer.emitter.emit('data', Buffer.alloc(110, '\n'));
    });

});

function check(f: Function, done: Function) {
    try {
        f();
        done();
    } catch (e) {
        done(e);
    }
}
