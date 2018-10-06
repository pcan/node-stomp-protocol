import 'mocha';
import { StompClientSessionLayer } from '../src/session';
import {
    StompServerCommandListener
} from '../src/protocol'
import { createStompClientSession, StompError } from '../src/index';
import { countdownLatch, noopFn, noopAsyncFn, check } from './helpers';
import { StompBrokerLayer, StompBrokerListener } from '../src/broker';
import { createServer, Server, createConnection, Socket } from 'net';
import { assert, expect } from 'chai';


describe('STOMP Broker Layer', () => {
    let broker: StompBrokerLayer;
    let clientSession: StompClientSessionLayer;
    let serverListener: StompServerCommandListener;
    let brokerListener: StompBrokerListener;
    let server: Server;
    let clientSocket: Socket;

    beforeEach((done) => {
        const latch = countdownLatch(2, done);
        serverListener = {
            onProtocolError: (_err) => { },
            onEnd: noopFn
        } as StompServerCommandListener;
        brokerListener = {
        } as StompBrokerListener;

        broker = new StompBrokerLayer(brokerListener);
        server = createServer((socket) => broker.accept(socket));
        server.listen(59999, 'localhost', latch);
        clientSocket = createConnection(59999, 'localhost', latch);
        clientSession = createStompClientSession(clientSocket, serverListener);
    });

    afterEach((done) => {
        clientSocket.end();
        server.close(done);
    });

    it(`should accept incoming connection`, (done) => {
        serverListener.connected = () => done();
        brokerListener.connecting = (_sessionId, _headers, cb) => cb();
        clientSession.connect({});
    });

    it(`should refuse incoming connection`, (done) => {
        const loginError = new StompError("Login Error");
        serverListener.error = (err) => check(() => assert.deepEqual(err!.message, loginError.message), done);
        brokerListener.connecting = (_sessionId, _headers, cb) => cb(loginError);
        clientSession.connect({});
    });

    it(`should handle incoming message`, (done) => {
        const destination = '/queue/abc';
        const body = 'test message';
        const expectedMessage = {
            headers: {
                destination,
                'content-length': '12'
            },
            body
        }
        serverListener.connected = () => clientSession.send({ destination }, body);
        brokerListener.connecting = (_sessionId, _headers, cb) => cb();
        brokerListener.incomingMessage = (_sessionId, headers, body, cb) => {
            cb();
            check(() => assert.deepEqual({ headers, body }, expectedMessage), done);
        };
        clientSession.connect({});
    });

    it(`should handle incoming message with receipt`, (done) => {
        const receipt = 'r123';
        const destination = '/queue/abc';
        serverListener.connected = () => clientSession.send({ destination, receipt }, 'test message');
        brokerListener.connecting = (_sessionId, _headers, cb) => cb();
        brokerListener.incomingMessage = (_sessionId, headers, body, cb) => cb();
        serverListener.receipt = (headers) =>
            check(() => assert.equal(headers['receipt-id'], receipt), done);
        clientSession.connect({});
    });

    it(`should reject incoming message with error`, (done) => {
        const destination = '/queue/abc';
        const message = 'Error message';
        serverListener.connected = () => clientSession.send({ destination }, 'test message');
        brokerListener.connecting = (_sessionId, _headers, cb) => cb();
        brokerListener.incomingMessage = (_sessionId, headers, body, cb) => cb(new StompError(message));
        serverListener.error = (headers) =>
            check(() => assert.equal(message, headers.message), done);
        clientSession.connect({});
    });

    it(`should reject incoming message with error containing receipt`, (done) => {
        const receipt = 'r123';
        const destination = '/queue/abc';
        serverListener.connected = () => clientSession.send({ destination, receipt }, 'test message');
        brokerListener.connecting = (_sessionId, _headers, cb) => cb();
        brokerListener.incomingMessage = (_sessionId, headers, body, cb) => cb(new StompError());
        serverListener.error = (headers) =>
            check(() => assert.equal(headers['receipt-id'], receipt), done);
        clientSession.connect({});
    });

    it(`should subscribe to destination`, (done) => {
        const id = 'sub-001';
        const destination = '/queue/abc';
        const subscription = { id, destination, ack: 'auto' }
        serverListener.connected = () => clientSession.subscribe({ id, destination });
        brokerListener.connecting = (_sessionId, _headers, cb) => cb();
        brokerListener.subscribing = (_sessionId, _subscription, cb) => {
            cb();
            check(() => assert.deepEqual(broker.subscriptions.get(_sessionId, _subscription.id), subscription), done);
        }
        clientSession.connect({});
    });

    it(`should subscribe to destination multiple times`, (done) => {
        const latch = countdownLatch(2, done);
        const id1 = 'sub-001';
        const id2 = 'sub-002';
        const destination = '/queue/abc';
        const subscriptions = [{ id: id1, destination, ack: 'auto' }, { id: id2, destination, ack: 'auto' }]
        serverListener.connected = () => {
            clientSession.subscribe(subscriptions[0])
                .then(() => clientSession.subscribe(subscriptions[1]));
        }
        brokerListener.connecting = (_sessionId, _headers, cb) => cb();
        let i = 0;
        brokerListener.subscribing = (_sessionId, _subscription, cb) => {
            cb();
            check(() => assert.deepEqual(broker.subscriptions.get(_sessionId, _subscription.id), subscriptions[i++]), latch);
        }
        clientSession.connect({});
    });

    it(`should send error when subscribe with same id multiple times`, (done) => {
        const destination = '/queue/abc';
        const subscription = { id: 'sub-001', destination, ack: 'auto' };
        serverListener.connected = () =>
            clientSession.subscribe(subscription)
                .then(() => clientSession.subscribe(subscription));
        brokerListener.connecting = (_sessionId, _headers, cb) => cb();
        brokerListener.subscribing = (_sessionId, _subscription, cb) => cb();
        serverListener.error = (headers) => check(() => assert.include(headers.message, 'Subscription ID sub-001 already found for session'), done);
        clientSession.connect({});
    });

    it(`should execute an operation for subscriptions based on destination`, (done) => {
        const destination = '/queue/abc';
        const subscription = { id: 'sub-001', destination, ack: 'auto' };
        serverListener.connected = () =>
            clientSession.subscribe(subscription)
                .then(() => clientSession.subscribe(subscription));
        brokerListener.connecting = (_sessionId, _headers, cb) => cb();
        brokerListener.subscribing = (_sessionId, _subscription, cb) => {
            cb();
            broker.forDestination(destination, (_sessionId, sub) => check(() => assert.deepEqual(sub, subscription), done));
        }
        clientSession.connect({});
    });

});
