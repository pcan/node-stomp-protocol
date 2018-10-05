import 'mocha';
import { StompClientSessionLayer } from '../src/session';
import {
    StompServerCommandListener
} from '../src/protocol'
import { createStompClientSession, StompError } from '../src/index';
import { countdownLatch, noopFn, noopAsyncFn, check } from './helpers';
import { StompBrokerLayer, StompBrokerListener } from '../src/broker';
import { createServer, Server, createConnection, Socket } from 'net';
import { assert } from 'chai';


describe('STOMP Broker Layer', () => {
    let broker: StompBrokerLayer<Socket>;
    let clientSession: StompClientSessionLayer;
    let serverListener: StompServerCommandListener;
    let brokerListener: StompBrokerListener<Socket>;
    let server: Server;
    let clientSocket: Socket;

    beforeEach((done) => {
        const latch = countdownLatch(2, done);
        serverListener = {
            onProtocolError: (_err) => { },
            onEnd: noopFn
        } as StompServerCommandListener;
        brokerListener = {
            creatingSession: (_sessionId, _socket, cb) => cb()
        } as StompBrokerListener<Socket>;

        broker = new StompBrokerLayer<Socket>(brokerListener);
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
        clientSession.connect();
    });

    it(`should refuse incoming connection`, (done) => {
        const loginError = new StompError("Login Error");
        serverListener.error = (err) => check(() => assert.deepEqual(err!.message, loginError.message), done);
        brokerListener.connecting = (_sessionId, _headers, cb) => cb(loginError);
        clientSession.connect();
    });

});
