import 'mocha';
import { assert, expect } from 'chai';
import { StompFrameLayer } from '../src/frame';
import { StompFrame, StompEventEmitter, StompError } from '../src/model';
import { StompStreamLayer } from '../src/stream';
import { check, countdownLatch } from './helpers';

describe('STOMP Frame Layer', () => {
    let streamLayer: StompStreamLayer;
    let frameLayer: StompFrameLayer;

    function newStreamLayer(): StompStreamLayer {
        return {
            emitter: new StompEventEmitter(),
            async close() { },
            async send(data) { }
        };
    }

    beforeEach(() => {
        streamLayer = newStreamLayer();
        frameLayer = new StompFrameLayer(streamLayer);
    });

    it(`should send basic CONNECT message`, (done) => {
        const connectFrameText = 'CONNECT\naccept-version:1.2\nhost:/myHost\n\n\0';
        streamLayer.send = async (data) => check(() => assert.equal(data, connectFrameText), done);
        const connectFrame = new StompFrame('CONNECT', { 'accept-version': '1.2', host: '/myHost' });
        frameLayer.send(connectFrame);
    });

    it(`should receive basic CONNECT message`, (done) => {
        const connectFrameText = 'CONNECT\naccept-version:1.2\n\n\0';
        const connectFrame = new StompFrame('CONNECT', { 'accept-version': '1.2' });
        frameLayer.emitter.on('frame', (frame: StompFrame) => {
            check(() => assert.deepEqual(frame, connectFrame), done);
        });
        streamLayer.emitter.emit('data', new Buffer(connectFrameText));
    });

    it(`should send CONNECT message with filtered headers`, (done) => {
        const connectFrameText = 'CONNECT\naccept-version:1.2\n\n\0';
        const connectFrame = new StompFrame('CONNECT', { 'accept-version': '1.2' });
        streamLayer.send = async (data) => check(() => assert.equal(data, connectFrameText), done);
        frameLayer.headerFilter = (headerName) => headerName !== 'X-remove-this';
        connectFrame.setHeader('X-remove-this', 'dummy-value');
        frameLayer.send(connectFrame);
    });

    it(`should emit 'end' when disconnected`, (done) => {
        frameLayer.emitter.on('end', done);
        streamLayer.emitter.emit('end');
    });

    it(`should close stream when closing`, (done) => {
        streamLayer = newStreamLayer();
        frameLayer = new StompFrameLayer(streamLayer, {});
        streamLayer.close = async () => done();
        frameLayer.close();
    });

    it(`should include content-length header`, (done) => {
        streamLayer.send = async (data) =>
            check(() => expect(data).contains('\ncontent-length'), done);
        const frame = new StompFrame('MESSAGE', {}, 'hello');
        frameLayer.send(frame);
    });

    it(`should omit content-length header when suppress-content-length is truthy`, (done) => {
        streamLayer.send = async (data) =>
            check(() => expect(data).not.contains('\ncontent-length'), done);
        const frame = new StompFrame('MESSAGE', { 'suppress-content-length': 'true' }, 'hello');
        frameLayer.send(frame);
    });

    it(`should use content-length when present`, (done) => {
        frameLayer.emitter.on('frame', (frame: StompFrame) =>
            check(() => assert.deepEqual(frame, new StompFrame('SEND', { 'content-length': '11' }, 'hello\0world')), done)
        );
        streamLayer.emitter.emit('data', new Buffer(`SEND\ncontent-length:11\n\nhello\0world`));
    });

    it(`should reject frames bigger than maxBufferSize`, (done) => {
        frameLayer.emitter.on('error', (error: StompError) =>
            check(() => assert.equal(error.message, 'Maximum buffer size exceeded.'), done)
        );
        frameLayer.maxBufferSize = 1024;
        const buf = Buffer.alloc(frameLayer.maxBufferSize + 1, 'a').toString();
        streamLayer.emitter.emit('data', new Buffer(`SEND\ncontent-length:${buf.length}\n\n${buf}\0`));
    });

    it(`should reject frames with broken headers`, (done) => {
        frameLayer.emitter.on('error', (error: StompError) =>
            check(() => assert.equal(error.message, 'Error parsing header'), done)
        );
        streamLayer.emitter.emit('data', new Buffer(`SEND\ncontent-length:5\nbrokenHeader\n\nhello\0`));
    });

    it(`should reject partial received frames in case of error`, (done) => {
        frameLayer.emitter.on('error', (error: StompError) =>
            check(() => assert.equal(error.message, 'Error parsing header'), done)
        );
        streamLayer.emitter.emit('data', new Buffer(`SEND\ncontent-length:123\nbrokenHeader\n\nhel`));
    });

    it(`should receive a frame in multiple data events, using content-length`, (done) => {
        frameLayer.emitter.on('frame', (frame: StompFrame) =>
            check(() => assert.deepEqual(frame, new StompFrame('SEND', { 'content-length': '11' }, 'hello\0world')), done)
        );
        streamLayer.emitter.emit('data', new Buffer(`SEND\ncontent-length:11\n\nhe`));
        streamLayer.emitter.emit('data', new Buffer(`llo\0`));
        streamLayer.emitter.emit('data', new Buffer(`world`));
    });

    it(`should receive a frame in multiple data events, using null char`, (done) => {
        frameLayer.emitter.on('frame', (frame: StompFrame) =>
            check(() => assert.deepEqual(frame, new StompFrame('SEND', {}, 'hello world')), done)
        );
        streamLayer.emitter.emit('data', new Buffer(`SEND\n\nhe`));
        streamLayer.emitter.emit('data', new Buffer(`llo `));
        streamLayer.emitter.emit('data', new Buffer(`world\0`));
    });

    it(`should close stream in case of newline flooding attack`, (done) => {
        streamLayer.close = async () => done();
        streamLayer.emitter.emit('data', Buffer.alloc(110, '\n'));
    });

    it(`should disconnect if not receiving the first frame within a certain period of time`, (done) => {
        streamLayer = newStreamLayer();
        frameLayer = new StompFrameLayer(streamLayer, { connectTimeout: 1 });
        const timeout = 100;
        const id = setTimeout(() => done(`Still connected, should be disconnected after timeout.`), timeout);
        streamLayer.close = async () => {
            clearTimeout(id);
            done();
        };
    });

    it(`should keep connection open if receiving the first frame within a certain period of time`, (done) => {
        streamLayer = newStreamLayer();
        frameLayer = new StompFrameLayer(streamLayer, { connectTimeout: 2 });
        const connectFrameText = 'CONNECT\naccept-version:1.2\n\n\0';
        streamLayer.emitter.emit('data', new Buffer(connectFrameText));
        setTimeout(() => done(), 7);
        streamLayer.close = async () => done(`Disconnected. Should keep connection open after first frame.`);
    });

    it(`should reset newline flooding counter after a certain period of time`, (done) => {
        streamLayer = newStreamLayer();
        const resetTime = 20;
        frameLayer = new StompFrameLayer(streamLayer, { newlineFloodingResetTime: resetTime });
        const doneTimeout = setTimeout(() => done(), resetTime + 5);
        streamLayer.close = async () => {
            clearTimeout(doneTimeout);
            done(`Disconnected. Should reset newline flooding counter.`);
        };
        streamLayer.emitter.emit('data', Buffer.alloc(98, '\n'));
        setTimeout(() => streamLayer.emitter.emit('data', Buffer.alloc(5, '\n')), resetTime + 2);
    });

    it(`should receive multiple frames in one data event, using content-length`, (done) => {
        const frames: StompFrame[] = [
            new StompFrame('SEND', { 'content-length': '5' }, 'hello'),
            new StompFrame('SEND', { 'content-length': '5' }, 'world'),
            new StompFrame('SEND', { 'content-length': '1' }, '!'),
        ];
        const latch = countdownLatch(3, done);
        let i = 0;
        frameLayer.emitter.on('frame', (frame: StompFrame) =>
            check(() => expect(frame).to.deep.include(frames[i++]), latch)
        );
        streamLayer.emitter.emit('data', new Buffer(`SEND\ncontent-length:5\n\nhello\0SEND\ncontent-length:5\n\nworld\0SEND\ncontent-length:1\n\n!\0`));
    });

    it(`should decode escaped characters correctly when receiving frames`, (done) => {
        const frameText = 'SEND\ndestination:/queue/a\ncookie:key\\cvalue\n\ntest\\nmessage\0';
        const expectedFrame = new StompFrame('SEND', { 'destination': '/queue/a', cookie: 'key:value' }, `test\nmessage`);
        frameLayer.emitter.on('frame', (frame: StompFrame) => {
            check(() => assert.deepEqual(frame, expectedFrame), done);
        });
        streamLayer.emitter.emit('data', new Buffer(frameText));
    });

    it(`should close stream when reading an unsupported escape sequence`, (done) => {
        const frameText = 'SEND\ndestination:/queue/a\n\ntest\\tmessage\0';
        streamLayer.close = async () => done();
        streamLayer.emitter.emit('data', new Buffer(frameText));
    });

    it(`should encode escape characters correctly when sending frames`, (done) => {
        const frameText = 'SEND\ncookie:key\\cvalue\ndestination:/queue/a\ncontent-length:13\n\ntest\nmessage\\\0';
        streamLayer.send = async (data) => check(() => assert.equal(data, frameText), done);
        frameLayer.send(new StompFrame('SEND', { 'destination': '/queue/a', cookie: 'key:value' }, `test\nmessage\\`));
    });

    it(`should throw error when sending an unsupported character`, (done) => {
        frameLayer.send(new StompFrame('SEND', { 'destination': '/queue/a', 'key': 'test\tvalue' }, `test message`))
            .catch((error) => check(() => assert.equal(error.message, 'Unsupported character detected.'), done));
    });

});
