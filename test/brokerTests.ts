import 'mocha';
import { StompClientSessionLayer } from '../src/session';
import {
    StompServerCommandListener
} from '../src/protocol'
import { createStompClientSession, StompError } from '../src/index';
import { countdownLatch, noopFn, noopAsyncFn, check } from './helpers';
import { StompBrokerLayerImpl, StompBrokerListener, Subscription, SessionSubscriptionsRegistry } from '../src/broker';
import { createServer, Server, createConnection, Socket } from 'net';
import { assert, expect } from 'chai';


describe('STOMP Broker Layer', () => {
    let broker: StompBrokerLayerImpl;
    let clientSession: StompClientSessionLayer;
    let serverListener: StompServerCommandListener;
    let brokerListener: StompBrokerListener;
    let server: Server;
    let clientSocket: Socket;

    beforeEach((done) => {
        serverListener = {
            onProtocolError: (_err) => { },
            onEnd: noopFn
        } as StompServerCommandListener;
        brokerListener = {
            sessionEnd: (_sessionId) => { }
        } as StompBrokerListener;

        broker = new StompBrokerLayerImpl(brokerListener);
        server = createServer((socket) => broker.accept(socket));
        server.listen();
        server.on('listening', () => {
            const port = server.address().port;
            clientSocket = createConnection(port, 'localhost', done);
            clientSession = createStompClientSession(clientSocket, serverListener);
        });
    });

    afterEach((done) => {
        clientSocket.end();
        server.close(done);
    });

    it(`should accept incoming connection`, (done) => {
        serverListener.connected = () => done();
        brokerListener.connecting = noopAsyncFn;
        clientSession.connect({});
    });

    it(`should refuse incoming connection by throwing error`, (done) => {
        const loginError = new StompError("Login Error");
        serverListener.error = (err) => check(() => assert.deepEqual(err!.message, loginError.message), done);
        brokerListener.connecting = () => { throw loginError; }
        clientSession.connect({});
    });

    it(`should handle disconnect`, (done) => {
        serverListener.connected = () => clientSession.disconnect()
        brokerListener.connecting = noopAsyncFn;
        brokerListener.disconnecting = async () => done();
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
        brokerListener.connecting = noopAsyncFn;
        brokerListener.incomingMessage = async (_sessionId, headers, body) =>
            check(() => assert.deepEqual({ headers, body }, expectedMessage), done);
        clientSession.connect({});
    });

    it(`should handle incoming message with receipt`, (done) => {
        const receipt = 'r123';
        const destination = '/queue/abc';
        serverListener.connected = () => clientSession.send({ destination, receipt }, 'test message');
        brokerListener.connecting = noopAsyncFn;
        brokerListener.incomingMessage = noopAsyncFn;
        serverListener.receipt = (headers) =>
            check(() => assert.equal(headers['receipt-id'], receipt), done);
        clientSession.connect({});
    });

    it(`should reject incoming message with error`, (done) => {
        const destination = '/queue/abc';
        const message = 'Error message';
        serverListener.connected = () => clientSession.send({ destination }, 'test message');
        brokerListener.connecting = noopAsyncFn;
        brokerListener.incomingMessage = async () => { throw new StompError(message); };
        serverListener.error = (headers) =>
            check(() => assert.equal(message, headers.message), done);
        clientSession.connect({});
    });

    it(`should reject incoming message with error containing receipt`, (done) => {
        const receipt = 'r123';
        const destination = '/queue/abc';
        serverListener.connected = () => clientSession.send({ destination, receipt }, 'test message');
        brokerListener.connecting = noopAsyncFn;
        brokerListener.incomingMessage = async () => { throw new StompError(); };
        serverListener.error = (headers) =>
            check(() => assert.equal(headers['receipt-id'], receipt), done);
        clientSession.connect({});
    });

    it(`should handle subscription to destination`, (done) => {
        const id = 'sub-001';
        const destination = '/queue/abc';
        const subscription = { id, destination, ack: 'auto' }
        serverListener.connected = () => clientSession.subscribe({ id, destination });
        brokerListener.connecting = noopAsyncFn;
        brokerListener.subscribing = async (_sessionId, _subscription) =>
            check(() => assert.deepEqual(broker.subscriptions.get(_sessionId, _subscription.id), subscription), done);
        clientSession.connect({});
    });

    it(`should handle subscription to destination multiple times`, (done) => {
        const latch = countdownLatch(2, done);
        const id1 = 'sub-001';
        const id2 = 'sub-002';
        const destination = '/queue/abc';
        const subscriptions = [{ id: id1, destination, ack: 'auto' }, { id: id2, destination, ack: 'auto' }]
        serverListener.connected = () => {
            clientSession.subscribe(subscriptions[0])
                .then(() => clientSession.subscribe(subscriptions[1]));
        }
        brokerListener.connecting = noopAsyncFn;
        let i = 0;
        brokerListener.subscribing = async (sessionId, subscription) =>
            check(() => assert.deepEqual(broker.subscriptions.get(sessionId, subscription.id), subscriptions[i++]), latch);
        clientSession.connect({});
    });

    it(`should cancel subscription when listener throws error`, (done) => {
        const id = 'sub-001';
        serverListener.connected = () =>
            clientSession.subscribe({ id, destination: '/queue/abc', ack: 'auto' });
        brokerListener.connecting = noopAsyncFn;
        let sessionId: string;
        brokerListener.subscribing = async (_sessionId) => {
            sessionId = _sessionId;
            throw new StompError()
        };
        serverListener.error = () =>
            check(() => expect(broker.subscriptions.get(sessionId, id)).to.be.undefined, done);
        clientSession.connect({});
    });

    it(`should send error when subscribing with same ID multiple times`, (done) => {
        const destination = '/queue/abc';
        const subscription = { id: 'sub-001', destination, ack: 'auto' };
        serverListener.connected = () =>
            clientSession.subscribe(subscription)
                .then(() => clientSession.subscribe(subscription));
        brokerListener.connecting = noopAsyncFn;
        brokerListener.subscribing = noopAsyncFn;
        serverListener.error = (headers) => check(() => assert.include(headers.message, 'Subscription ID sub-001 already found for session'), done);
        clientSession.connect({});
    });

    it(`should execute an operation for subscriptions based on destination`, (done) => {
        const destination = '/queue/abc';
        const subscription = { id: 'sub-001', destination, ack: 'auto' };
        serverListener.connected = () =>
            clientSession.subscribe(subscription)
                .then(() => clientSession.subscribe(subscription));
        brokerListener.connecting = noopAsyncFn;
        brokerListener.subscribing = async () =>
            broker.forDestination(destination, (_sessionId, sub) => check(() => assert.deepEqual(sub, subscription), done));
        clientSession.connect({});
    });

    it(`should handle unsubscription from destination`, (done) => {
        const id = 'sub-001';
        const destination = '/queue/abc';
        const subscription = { id, destination, ack: 'auto' }
        serverListener.connected = () => clientSession.subscribe({ id, destination })
            .then(() => clientSession.unsubscribe({ id }));
        brokerListener.connecting = noopAsyncFn;
        brokerListener.subscribing = noopAsyncFn;
        brokerListener.unsubscribing = async (_sessionId, sub) =>
            check(() => assert.deepEqual(sub, subscription), done);
        clientSession.connect({});
    });

    it(`should send error when unsubscribing from invalid destination`, (done) => {
        const id = 'sub-001';
        serverListener.connected = () => clientSession.unsubscribe({ id });
        brokerListener.connecting = noopAsyncFn;
        serverListener.error = (headers) => check(() => assert.equal(headers.message, 'Cannot unsubscribe: unknown subscription ID or destination.'), done);
        clientSession.connect({});
    });

    it(`should handle subscription and unsubscription without ID using legacy protocol`, (done) => {
        const destination = '/queue/abc';
        serverListener.connected = () => {
            clientSession.subscribe({ destination })
                .then(() => clientSession.unsubscribe({ destination, receipt: 'r001' }));
        }
        brokerListener.connecting = noopAsyncFn;
        brokerListener.subscribing = noopAsyncFn;
        let subscription: Subscription;
        let sessionId: string;
        brokerListener.unsubscribing = async (_sessionId, sub) => {
            sessionId = _sessionId;
            subscription = broker.subscriptions.get(sessionId, sub.id)!;
        }
        serverListener.receipt = () =>
            check(() => expect(broker.subscriptions.get(sessionId, subscription.id)).to.be.undefined, done);
        clientSession.connect({ 'accept-version': '1.0' });
    });

    it(`should handle positive acknowledge`, (done) => {
        const id = 'msg-001';
        const ack = { messageId: id, value: true };
        serverListener.connected = () => clientSession.ack({ id });
        brokerListener.connecting = noopAsyncFn;
        brokerListener.acknowledging = async (_sessionId, acknowledge) =>
            check(() => assert.deepEqual(ack, acknowledge), done);
        clientSession.connect({});
    });

    it(`should handle negative acknowledge`, (done) => {
        const id = 'msg-001';
        const transaction = 't-001';
        const subscription = 'sub-001';
        const ack = { messageId: id, value: false, transaction, subscription };
        serverListener.connected = () => clientSession.nack({ id, transaction, subscription });
        brokerListener.connecting = noopAsyncFn;
        brokerListener.acknowledging = async (_sessionId, acknowledge) =>
            check(() => assert.deepEqual(ack, acknowledge), done);

        clientSession.connect({});
    });

    it(`should handle transaction begin`, (done) => {
        const transaction = 't001';
        serverListener.connected = () => clientSession.begin({ transaction });
        brokerListener.connecting = noopAsyncFn;
        brokerListener.beginningTransaction = async (_sessionId, transactionId) =>
            check(() => assert.equal(transactionId, transaction), done);
        clientSession.connect({});
    });

    it(`should send error when beginning transactions with same ID`, (done) => {
        const transaction = 't001';
        serverListener.connected = () => clientSession.begin({ transaction })
            .then(() => clientSession.begin({ transaction }));
        brokerListener.connecting = noopAsyncFn;
        brokerListener.incomingMessage = noopAsyncFn;
        brokerListener.beginningTransaction = noopAsyncFn;
        serverListener.error = (headers) => check(() => assert.include(headers.message, `Transaction with ID ${transaction} already started`), done);
        clientSession.connect({});
    });

    it(`should handle transaction commit`, (done) => {
        const transaction = 't001';
        serverListener.connected = () => clientSession.begin({ transaction })
            .then(() => clientSession.commit({ transaction }));
        brokerListener.connecting = noopAsyncFn;
        brokerListener.beginningTransaction = noopAsyncFn;
        brokerListener.committingTransaction = async (_sessionId, transactionId) =>
            check(() => assert.equal(transactionId, transaction), done);
        clientSession.connect({});
    });

    it(`should send error when committing an invalid transaction`, (done) => {
        const transaction = 't001';
        serverListener.connected = () => clientSession.commit({ transaction });
        brokerListener.connecting = noopAsyncFn;
        serverListener.error = (headers) => check(() => assert.include(headers.message, `Transaction with ID ${transaction} not found`), done);
        clientSession.connect({});
    });

    it(`should handle transaction abort`, (done) => {
        const transaction = 't001';
        serverListener.connected = () => clientSession.begin({ transaction })
            .then(() => clientSession.abort({ transaction }));
        brokerListener.connecting = noopAsyncFn;
        brokerListener.beginningTransaction = noopAsyncFn;
        brokerListener.abortingTransaction = async (_sessionId, transactionId) =>
            check(() => assert.equal(transactionId, transaction), done);
        clientSession.connect({});
    });

    it(`should send a message to a specific session subscription`, (done) => {
        const id = 'sub-001';
        const messageId = '1';
        const body = 'hello';
        const destination = '/queue/abc';
        const message = {
            headers: { 'content-length': '5', 'message-id': messageId, destination, subscription: id },
            body
        }
        let sessionId: string;
        serverListener.connected = () => clientSession.subscribe({ id, destination, receipt: 'r123' });
        brokerListener.connecting = noopAsyncFn;
        brokerListener.subscribing = async (id, _sub) => { sessionId = id };
        serverListener.receipt = () => {
            broker.sendMessage({ headers: { 'message-id': messageId }, body }, destination, sessionId);
        }
        serverListener.message = (headers, body) =>
            check(() => assert.deepEqual({ headers, body }, message), done);
        clientSession.connect({});
    });

    it(`should send a message to a destination for all sessions`, (done) => {
        const id = 'sub-001';
        const messageId = '1';
        const body = 'hello';
        const destination = '/queue/abc';
        const message = {
            headers: { 'content-length': '5', 'message-id': messageId, destination, subscription: id },
            body
        }
        serverListener.connected = () => clientSession.subscribe({ id, destination, receipt: 'r123' });
        brokerListener.connecting = noopAsyncFn;
        brokerListener.subscribing = noopAsyncFn;
        serverListener.receipt = () => {
            broker.sendMessage({ headers: { 'message-id': messageId }, body }, destination);
        }
        serverListener.message = (headers, body) =>
            check(() => assert.deepEqual({ headers, body }, message), done);
        clientSession.connect({});
    });

});


describe('STOMP Session Subscription Registry', () => {

    let reg: SessionSubscriptionsRegistry;

    beforeEach((done) => {
        reg = new SessionSubscriptionsRegistry('test');
        done();
    });

    it(`should insert a new subscription`, (done) => {
        const id = 'sub-1';
        const sub = { id, destination: '/queue/abc', ack: 'auto' };
        reg.add(sub);
        check(() => assert.deepEqual(reg.get(id), sub), done);
    });

    it(`should throw an error when adding an already existing subscription`, (done) => {
        const id = 'sub-1';
        const sub = { id, destination: '/queue/abc', ack: 'auto' };
        reg.add(sub);
        check(() => assert.throws(() => reg.add(sub)), done);
    });

    it(`should remove a subscription`, (done) => {
        const id = 'sub-1';
        const sub = { id, destination: '/queue/abc', ack: 'auto' };
        reg.add(sub);
        reg.remove(sub.id);
        check(() => assert.isUndefined(reg.get(id)), done);
    });

    it(`should not remove an invalid subscription`, (done) => {
        const id = 'sub-1';
        const sub = { id, destination: '/queue/abc', ack: 'auto' };
        reg.add(sub);
        const res = reg.remove('/queue/xyz');
        check(() => assert.isFalse(res), done);
    });

    it(`should insert multiple subscriptions on same destination`, (done) => {
        const id1 = 'sub-1';
        const destination = '/queue/abc';
        const sub1 = { id: id1, destination, ack: 'auto' };
        const sub2 = { id: 'sub-2', destination, ack: 'auto' };
        reg.add(sub1);
        reg.add(sub2);
        let arr: Subscription[] = [];
        reg.forDestination(destination, s => (arr.push(s), true));
        check(() => expect(arr).to.include.deep.members([sub1, sub2]), done);
    });

    it(`should ignore an invalid destination`, (done) => {
        const id = 'sub-1';
        const sub = { id, destination: '/queue/abc', ack: 'auto' };
        reg.add(sub);
        reg.forDestination('/queue/xyz', s => (done(new Error('Invalid destination found.')), true));
        done();
    });

});
