import 'mocha';
import { assert, should, expect } from 'chai';
import { StompFrame, StompEventEmitter, StompError } from '../src/model';
import { StompServerSessionLayer, StompClientSessionLayer } from '../src/session';
import {
    StompClientCommandListener, StompServerCommandListener,
    StompServerCommands, StompClientCommands
} from '../src/protocol'

import { createStompServerSession, createStompClientSession } from '../src/index';
import { check, countdownLatch, noopFn, noopAsyncFn } from './helpers';
import { createServer, Server, createConnection, Socket } from 'net';
import * as WebSocket from 'ws';

describe('STOMP Client & Server over Plain Socket', () => {
    let serverSession: StompServerSessionLayer;
    let clientSession: StompClientSessionLayer;
    let clientListener: StompClientCommandListener;
    let serverListener: StompServerCommandListener;
    let server: Server;
    let clientSocket: Socket;

    beforeEach((done) => {
        const latch = countdownLatch(2, done);
        clientListener = {
            onProtocolError: (err) => { },
            onEnd: noopFn
        } as StompClientCommandListener;
        serverListener = {
            onProtocolError: (err) => { },
            onEnd: noopFn
        } as StompServerCommandListener;
        server = createServer((socket) => {
            serverSession = createStompServerSession(socket, clientListener);
        });
        server.listen(59999, 'localhost', latch);
        clientSocket = createConnection(59999, 'localhost', latch);
        clientSession = createStompClientSession(clientSocket, serverListener);
    });

    afterEach((done) => {
        clientSocket.end();
        server.close(done);
    });

    it(`should perform connection`, (done) => {
        serverListener.connected = (headers) => done();
        clientListener.connect = (headers) => serverSession.connected();
        clientSession.connect();
    });

    it(`should perform disconnection`, (done) => {
        serverListener.onEnd = done;
        clientListener.disconnect = (headers) => serverSession.close();
        serverListener.connected = (headers) => clientSession.disconnect();
        clientListener.connect = (headers) => serverSession.connected();
        clientSession.connect();
    });

    it(`should handle client-side socket end`, (done) => {
        clientListener.onEnd = done;
        clientSession.close();
    });

    it(`should handle server-side socket end`, (done) => {
        serverListener.connected = noopAsyncFn;
        serverListener.onEnd = done;
        clientListener.connect = (headers) => serverSession.connected();
        clientSession.connect().then(() => clientSession.close());
    });

    it(`should disconnect client after error`, (done) => {
        const latch = countdownLatch(2, done);
        serverListener.onEnd = latch;
        serverListener.error = () => latch();
        clientSession.connect({ 'accept-version': '350.215' });
    });
});


describe('STOMP Client & Server over WebSocket', () => {
    let serverSession: StompServerSessionLayer;
    let clientSession: StompClientSessionLayer;
    let clientListener: StompClientCommandListener;
    let serverListener: StompServerCommandListener;
    let server: WebSocket.Server;
    let clientSocket: WebSocket;

    beforeEach((done) => {
        const latch = countdownLatch(2, done);
        clientListener = {
            onProtocolError: (err) => { },
            onEnd: noopFn
        } as StompClientCommandListener;
        serverListener = {
            onProtocolError: (err) => { },
            onEnd: noopFn
        } as StompServerCommandListener;

        server = new WebSocket.Server({ port: 59999 }, latch);

        server.on('connection', function connection(ws) {
            serverSession = createStompServerSession(ws, clientListener);
        });

        clientSocket = new WebSocket("ws://localhost:59999/ws");
        clientSocket.on('open', latch);
        clientSession = createStompClientSession(clientSocket, serverListener);
    });

    afterEach((done) => {
        clientSocket.close();
        server.close(done);
    });

});
